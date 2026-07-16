import type { WAMessage } from '@whiskeysockets/baileys';
import { one, none, setSetting } from '../db/index.js';
import { logger } from '../logger.js';
import { upsertContactByJid, getOrCreateConversation } from '../modules/store.js';
import { getActiveImport, recordImported, finishImport } from '../modules/history-import.js';
import { extractText, isIgnorableJid } from './inbound.js';

// Bulk import of historical messages arriving on `messaging-history.set`. This is
// a DIFFERENT event from `messages.upsert`, so nothing here triggers the AI or the
// receipt pipeline. We insert straight into `messages` (bypassing insertMessage())
// so we don't inflate unread_count or emit a per-message event storm.

interface ImportResult { inserted: number; chats: number }

export async function importMessages(messages: WAMessage[]): Promise<ImportResult> {
  const convByJid = new Map<string, number>();
  const maxTs = new Map<number, number>();
  let inserted = 0;

  for (const msg of messages) {
    const jid = msg.key?.remoteJid;
    if (!jid || isIgnorableJid(jid)) continue;
    const extracted = extractText(msg.message);
    if (!extracted) continue;

    let conversationId = convByJid.get(jid);
    if (conversationId === undefined) {
      const fromMe = Boolean(msg.key?.fromMe);
      const contact = await upsertContactByJid(jid, fromMe ? undefined : msg.pushName ?? undefined);
      conversationId = (await getOrCreateConversation(contact.id)).id;
      convByJid.set(jid, conversationId);
    }

    const ts = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
    const row = await one<{ id: number }>(`
      INSERT INTO messages (wa_message_id, conversation_id, direction, type, text, from_ai, timestamp)
      VALUES ($1, $2, $3, $4, $5, 0, $6)
      ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
      RETURNING id
    `, [msg.key?.id ?? null, conversationId, msg.key?.fromMe ? 'out' : 'in', extracted.type, extracted.text, ts]);
    if (row) {
      inserted++;
      const prev = maxTs.get(conversationId) ?? 0;
      if (ts > prev) maxTs.set(conversationId, ts);
    }
  }

  // One bump per touched conversation so the inbox orders correctly. Never
  // move last_message_at backwards, and never touch unread_count.
  for (const [conversationId, ts] of maxTs) {
    await none('UPDATE conversations SET last_message_at = GREATEST(last_message_at, $1) WHERE id = $2', [ts, conversationId]);
  }

  return { inserted, chats: convByJid.size };
}

// Wired to the socket. Discards history unless the owner has an import in flight —
// the queued/running import row IS the gate, preserving the "start from now"
// default. (A re-scan import is created as 'queued' before the relink, so it's
// already active when WhatsApp pushes the backlog.)
export async function handleHistorySync(payload: {
  messages: WAMessage[]; progress?: number | null; isLatest?: boolean;
}): Promise<void> {
  const active = await getActiveImport();
  if (!active) return; // start-from-now: no explicit import running → ignore

  const { inserted, chats } = await importMessages(payload.messages ?? []);
  logger.info({ inserted, chats, progress: payload.progress, isLatest: payload.isLatest, importId: active.id, source: active.source }, 'history sync batch imported');
  await recordImported(active.id, inserted, chats, payload.progress ?? null);

  // The re-scan (sync) import completes when WhatsApp signals the last batch.
  // Turn full-sync back off so future links return to "start from now" and we
  // don't silently re-ingest history on every reconnect.
  if (active.source === 'sync' && payload.isLatest) {
    await finishImport(active.id, 'done');
    await setSetting('history_full_sync', '0');
  }
}
