import { one, many, none } from '../db/index.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { currentBusinessId } from '../context.js';
import { getSock } from '../wa/connection.js';

// State + control for opt-in history imports. The actual message writing lives in
// wa/history.ts; this module owns the run lifecycle and the on-demand backfill loop.

export interface HistoryImport {
  id: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'stopped';
  source: 'on_demand' | 'sync';
  messages_imported: number;
  chats_seen: number;
  progress: number;
  error: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getImport(id: number): Promise<HistoryImport | undefined> {
  return one<HistoryImport>('SELECT * FROM history_imports WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
}

export async function getLatestImport(): Promise<HistoryImport | undefined> {
  return one<HistoryImport>('SELECT * FROM history_imports WHERE business_id = $1 ORDER BY id DESC LIMIT 1', [currentBusinessId()]);
}

// The one import currently able to ingest history (running, or queued and waiting
// for a re-scan). Used both as the gate in wa/history.ts and to block duplicates.
export async function getActiveImport(): Promise<HistoryImport | undefined> {
  return one<HistoryImport>("SELECT * FROM history_imports WHERE business_id = $1 AND status IN ('queued','running') ORDER BY id DESC LIMIT 1", [currentBusinessId()]);
}

export async function emitHistoryProgress(id: number) {
  bus.emitEvent({ type: 'history.progress', import: await getImport(id) });
}

export async function createImport(source: 'on_demand' | 'sync'): Promise<HistoryImport> {
  const status = source === 'on_demand' ? 'running' : 'queued';
  const { id } = (await one<{ id: number }>('INSERT INTO history_imports (business_id, status, source) VALUES ($1, $2, $3) RETURNING id',
    [currentBusinessId(), status, source]))!;
  const row = (await getImport(id))!;
  await emitHistoryProgress(row.id);
  return row;
}

// Called from wa/history.ts as batches land. Flips a queued (re-scan) import to
// running on its first batch.
export async function recordImported(id: number, inserted: number, chats: number, progress: number | null) {
  await none(`
    UPDATE history_imports
    SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
        messages_imported = messages_imported + $1,
        chats_seen = GREATEST(chats_seen, $2),
        progress = COALESCE($3, progress),
        updated_at = (extract(epoch from now())::bigint)
    WHERE id = $4
  `, [inserted, chats, progress, id]);
  await emitHistoryProgress(id);
}

export async function finishImport(id: number, status: 'done' | 'failed' | 'stopped', error?: string) {
  await none("UPDATE history_imports SET status = $1, error = $2, progress = CASE WHEN $1 = 'done' THEN 100 ELSE progress END, completed_at = (extract(epoch from now())::bigint), updated_at = (extract(epoch from now())::bigint) WHERE id = $3",
    [status, error ?? null, id]);
  await emitHistoryProgress(id);
}

export async function stopImport(): Promise<HistoryImport | undefined> {
  const active = await getActiveImport();
  if (!active) return undefined;
  await finishImport(active.id, 'stopped');
  return getImport(active.id);
}

// On-demand backfill: page older messages for existing chats without a re-scan.
// Bounded + throttled so we never hammer WhatsApp. Results arrive asynchronously
// on `messaging-history.set` and are counted by wa/history.ts.
const MAX_ROUNDS = 3;      // how many times we page further back per chat
const FETCH_COUNT = 50;    // messages requested per call
const THROTTLE_MS = 2000;  // between fetch requests
const ROUND_SETTLE_MS = 4000; // wait for a round's results to land before paging again
const FINAL_SETTLE_MS = 8000; // extra grace for trailing async batches after the last round

export async function startOnDemandBackfill(importId: number): Promise<void> {
  try {
    const chats = await many<{ conversation_id: number; jid: string }>(`
      SELECT c.id AS conversation_id, ct.jid AS jid
      FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.business_id = $1 AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
    `, [currentBusinessId()]);

    if (chats.length === 0) { await finishImport(importId, 'done'); return; }
    await none('UPDATE history_imports SET chats_seen = $1 WHERE id = $2', [chats.length, importId]);

    const total = MAX_ROUNDS * chats.length;
    let step = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (const chat of chats) {
        if ((await getImport(importId))?.status !== 'running') return; // stopped/failed → bail

        const oldest = await one<{ wa_message_id: string; direction: string; timestamp: number }>(`
          SELECT wa_message_id, direction, timestamp FROM messages
          WHERE conversation_id = $1 AND wa_message_id IS NOT NULL
          ORDER BY timestamp ASC, id ASC LIMIT 1
        `, [chat.conversation_id]);

        step++;
        await none('UPDATE history_imports SET progress = $1, updated_at = (extract(epoch from now())::bigint) WHERE id = $2',
          [Math.min(99, Math.round((step / total) * 100)), importId]);
        await emitHistoryProgress(importId);

        if (!oldest) continue;
        try {
          await getSock().fetchMessageHistory(
            FETCH_COUNT,
            { remoteJid: chat.jid, id: oldest.wa_message_id, fromMe: oldest.direction === 'out' },
            // Baileys expects oldestMsgTimestampMs (milliseconds); our DB stores seconds.
            oldest.timestamp * 1000,
          );
        } catch (err) {
          logger.warn({ err, jid: chat.jid }, 'fetchMessageHistory failed for chat');
        }
        await sleep(THROTTLE_MS);
      }
      await sleep(ROUND_SETTLE_MS); // let this round's results ingest before paging further back
    }

    // On-demand batches arrive asynchronously; give trailing ones time to land
    // (and be counted) before we close the run.
    await sleep(FINAL_SETTLE_MS);
    if ((await getImport(importId))?.status === 'running') await finishImport(importId, 'done');
  } catch (err: any) {
    logger.error({ err, importId }, 'history backfill failed');
    await finishImport(importId, 'failed', String(err?.message ?? err));
  }
}
