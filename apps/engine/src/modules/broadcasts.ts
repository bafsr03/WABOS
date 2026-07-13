import { db } from '../db/index.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { getSock } from '../wa/connection.js';
import { getOrCreateConversation, insertMessage, type Contact } from './store.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getBroadcast(id: number) {
  const broadcast = db.prepare(`
    SELECT b.*, t.name AS tag_name FROM broadcasts b
    LEFT JOIN tags t ON t.id = b.tag_id
    WHERE b.id = ?
  `).get(id);
  const recipients = db.prepare(`
    SELECT r.*, c.name, c.phone FROM broadcast_recipients r
    JOIN contacts c ON c.id = r.contact_id
    WHERE r.broadcast_id = ?
  `).all(id);
  return broadcast ? { ...(broadcast as object), recipients } : undefined;
}

export function listBroadcasts() {
  return db.prepare(`
    SELECT b.*, t.name AS tag_name FROM broadcasts b
    LEFT JOIN tags t ON t.id = b.tag_id
    ORDER BY b.created_at DESC
  `).all();
}

export function createBroadcast(input: { name: string; message: string; tagId?: number | null }) {
  const contacts = (input.tagId
    ? db.prepare('SELECT c.* FROM contacts c JOIN contact_tags ct ON ct.contact_id = c.id WHERE ct.tag_id = ?').all(input.tagId)
    : db.prepare('SELECT * FROM contacts').all()) as Contact[];

  if (contacts.length === 0) throw new Error('No recipients match the selected segment');

  const info = db.prepare('INSERT INTO broadcasts (name, message, tag_id, total) VALUES (?, ?, ?, ?)')
    .run(input.name, input.message, input.tagId ?? null, contacts.length);
  const broadcastId = Number(info.lastInsertRowid);

  const insertRecipient = db.prepare('INSERT INTO broadcast_recipients (broadcast_id, contact_id) VALUES (?, ?)');
  for (const c of contacts) insertRecipient.run(broadcastId, c.id);

  // Fire and forget — progress is streamed over the event bus
  void runBroadcast(broadcastId, contacts, input.message);
  return getBroadcast(broadcastId);
}

async function runBroadcast(broadcastId: number, contacts: Contact[], message: string) {
  db.prepare("UPDATE broadcasts SET status = 'sending' WHERE id = ?").run(broadcastId);
  emitProgress(broadcastId);

  for (const contact of contacts) {
    // Throttle hard: one message every 6–12 s. WhatsApp bans spammy patterns.
    await sleep(6000 + Math.random() * 6000);
    try {
      const sock = getSock();
      const sent = await sock.sendMessage(contact.jid, { text: message });
      const conversation = getOrCreateConversation(contact.id);
      insertMessage({
        waMessageId: sent?.key?.id ?? null,
        conversationId: conversation.id,
        direction: 'out',
        text: message,
      });
      db.prepare("UPDATE broadcast_recipients SET status = 'sent' WHERE broadcast_id = ? AND contact_id = ?")
        .run(broadcastId, contact.id);
      db.prepare('UPDATE broadcasts SET sent = sent + 1 WHERE id = ?').run(broadcastId);
    } catch (err) {
      logger.error({ err, contact: contact.phone }, 'broadcast send failed');
      db.prepare("UPDATE broadcast_recipients SET status = 'failed', error = ? WHERE broadcast_id = ? AND contact_id = ?")
        .run(String(err), broadcastId, contact.id);
      db.prepare('UPDATE broadcasts SET failed = failed + 1 WHERE id = ?').run(broadcastId);
    }
    emitProgress(broadcastId);
  }

  const row = db.prepare('SELECT failed, total FROM broadcasts WHERE id = ?').get(broadcastId) as { failed: number; total: number };
  db.prepare('UPDATE broadcasts SET status = ? WHERE id = ?')
    .run(row.failed === row.total ? 'failed' : 'done', broadcastId);
  emitProgress(broadcastId);
}

function emitProgress(broadcastId: number) {
  bus.emitEvent({ type: 'broadcast.progress', broadcast: getBroadcast(broadcastId) });
}
