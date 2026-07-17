import { one, many, none } from '../db/index.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { currentBusinessId, runWithBusiness } from '../context.js';
import { enqueueJob } from '../jobs/queue.js';
import { getSock } from '../wa/connection.js';
import { getOrCreateConversation, insertMessage, type Contact } from './store.js';

// Throttle hard: one message every 6–12 s. WhatsApp bans spammy patterns.
const nextSendDelaySec = () => 6 + Math.random() * 6;
// If WhatsApp is momentarily disconnected, retry the same recipient after this
// long without burning a job attempt (see broadcastSendJob).
const WA_RETRY_SEC = 15;

export async function getBroadcast(id: number) {
  const broadcast = await one(`
    SELECT b.*, t.name AS tag_name FROM broadcasts b
    LEFT JOIN tags t ON t.id = b.tag_id
    WHERE b.id = $1
  `, [id]);
  const recipients = await many(`
    SELECT r.*, c.name, c.phone FROM broadcast_recipients r
    JOIN contacts c ON c.id = r.contact_id
    WHERE r.broadcast_id = $1
  `, [id]);
  return broadcast ? { ...(broadcast as object), recipients } : undefined;
}

export async function listBroadcasts() {
  return many(`
    SELECT b.*, t.name AS tag_name FROM broadcasts b
    LEFT JOIN tags t ON t.id = b.tag_id
    WHERE b.business_id = $1
    ORDER BY b.created_at DESC
  `, [currentBusinessId()]);
}

export async function createBroadcast(input: { name: string; message: string; tagId?: number | null }) {
  const businessId = currentBusinessId();
  // Test contacts are never real recipients.
  const contacts = (input.tagId
    ? await many<Contact>('SELECT c.* FROM contacts c JOIN contact_tags ct ON ct.contact_id = c.id WHERE c.business_id = $1 AND c.is_test = 0 AND ct.tag_id = $2', [businessId, input.tagId])
    : await many<Contact>('SELECT * FROM contacts WHERE business_id = $1 AND is_test = 0', [businessId]));

  if (contacts.length === 0) throw new Error('No recipients match the selected segment');

  const { id: broadcastId } = (await one<{ id: number }>(
    'INSERT INTO broadcasts (business_id, name, message, tag_id, total) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [businessId, input.name, input.message, input.tagId ?? null, contacts.length],
  ))!;

  for (const c of contacts) {
    await none('INSERT INTO broadcast_recipients (broadcast_id, contact_id) VALUES ($1, $2)', [broadcastId, c.id]);
  }

  await none("UPDATE broadcasts SET status = 'sending' WHERE id = $1", [broadcastId]);
  await emitProgress(broadcastId);
  // Durable, one-recipient-at-a-time job. Survives restarts (jobs left 'running'
  // are requeued on boot) and paces itself via run_at so it never blocks the
  // single job-drain loop for the whole broadcast.
  await enqueueJob('broadcast.send', { broadcastId });
  return getBroadcast(broadcastId);
}

interface BroadcastRow { id: number; message: string; status: string; failed: number; total: number }

// Sends the next pending recipient of a broadcast, then reschedules itself for
// the one after (with a throttle delay). Durable by design: recipient status is
// the source of truth, so a crash resumes exactly where it left off with no
// duplicate sends. Registered as the 'broadcast.send' job handler.
export async function broadcastSendJob(payload: { broadcastId: number }): Promise<void> {
  const broadcastId = payload.broadcastId;
  const broadcast = await one<BroadcastRow>('SELECT id, message, status, failed, total FROM broadcasts WHERE id = $1', [broadcastId]);
  // Gone or no longer sending (e.g. cancelled) — stop the chain.
  if (!broadcast || broadcast.status !== 'sending') return;

  const recipient = await one<{ contact_id: number; jid: string; phone: string }>(`
    SELECT r.contact_id, c.jid, c.phone FROM broadcast_recipients r
    JOIN contacts c ON c.id = r.contact_id
    WHERE r.broadcast_id = $1 AND r.status = 'pending'
    ORDER BY r.id LIMIT 1
  `, [broadcastId]);

  if (!recipient) {
    // No pending recipients left — finalize.
    const status = broadcast.failed === broadcast.total ? 'failed' : 'done';
    await none('UPDATE broadcasts SET status = $1 WHERE id = $2', [status, broadcastId]);
    await emitProgress(broadcastId);
    return;
  }

  // WhatsApp not connected: retry the SAME recipient shortly. Return normally so
  // this transient state never counts as a job failure / marks the recipient failed.
  let sock: ReturnType<typeof getSock>;
  try {
    sock = getSock();
  } catch {
    await enqueueJob('broadcast.send', { broadcastId }, Math.floor(Date.now() / 1000) + WA_RETRY_SEC);
    return;
  }

  try {
    const sent = await sock.sendMessage(recipient.jid, { text: broadcast.message });
    const conversation = await getOrCreateConversation(recipient.contact_id);
    await insertMessage({
      waMessageId: sent?.key?.id ?? null,
      conversationId: conversation.id,
      direction: 'out',
      text: broadcast.message,
    });
    await none("UPDATE broadcast_recipients SET status = 'sent' WHERE broadcast_id = $1 AND contact_id = $2", [broadcastId, recipient.contact_id]);
    await none('UPDATE broadcasts SET sent = sent + 1 WHERE id = $1', [broadcastId]);
  } catch (err) {
    logger.error({ err, contact: recipient.phone }, 'broadcast send failed');
    await none("UPDATE broadcast_recipients SET status = 'failed', error = $1 WHERE broadcast_id = $2 AND contact_id = $3", [String(err), broadcastId, recipient.contact_id]);
    await none('UPDATE broadcasts SET failed = failed + 1 WHERE id = $1', [broadcastId]);
  }
  await emitProgress(broadcastId);

  // Chain to the next recipient after a throttle delay.
  await enqueueJob('broadcast.send', { broadcastId }, Math.floor(Date.now() / 1000 + nextSendDelaySec()));
}

// On boot, resume any broadcast that was mid-send but has no live job chain
// (e.g. crashed between finishing a recipient and enqueuing the next).
export async function resumeBroadcasts(): Promise<void> {
  const stuck = await many<{ id: number; business_id: number }>(`
    SELECT b.id, b.business_id FROM broadcasts b
    WHERE b.status = 'sending'
      AND EXISTS (SELECT 1 FROM broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.type = 'broadcast.send'
          AND j.status IN ('queued', 'running')
          AND j.payload = '{"broadcastId":' || b.id::text || '}'
      )
  `);
  for (const b of stuck) {
    logger.info({ broadcastId: b.id }, 'resuming interrupted broadcast');
    await runWithBusiness(b.business_id, () => enqueueJob('broadcast.send', { broadcastId: b.id }));
  }
}

async function emitProgress(broadcastId: number) {
  bus.emitEvent({ type: 'broadcast.progress', broadcast: await getBroadcast(broadcastId) });
}
