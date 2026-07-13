import { db } from '../db/index.js';
import { bus } from '../events.js';

export interface Contact {
  id: number; jid: string; phone: string; name: string; notes: string; created_at: number;
}
export interface Conversation {
  id: number; contact_id: number; mode: 'ai' | 'human'; unread_count: number; last_message_at: number;
}
export interface Message {
  id: number; wa_message_id: string | null; conversation_id: number;
  direction: 'in' | 'out'; type: string; text: string; from_ai: number; status: string; timestamp: number;
}

export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

export function upsertContactByJid(jid: string, name?: string): Contact {
  const existing = db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid) as Contact | undefined;
  if (existing) {
    // Keep a manually-set name; only fill in the WhatsApp pushName when we have nothing
    if (name && !existing.name) {
      db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(name, existing.id);
      existing.name = name;
    }
    return existing;
  }
  const info = db.prepare('INSERT INTO contacts (jid, phone, name) VALUES (?, ?, ?)')
    .run(jid, jidToPhone(jid), name ?? '');
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid) as Contact;
}

export function getOrCreateConversation(contactId: number): Conversation {
  const existing = db.prepare('SELECT * FROM conversations WHERE contact_id = ?').get(contactId) as Conversation | undefined;
  if (existing) return existing;
  const info = db.prepare('INSERT INTO conversations (contact_id) VALUES (?)').run(contactId);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid) as Conversation;
}

export function getConversation(id: number): (Conversation & Contact & { contact_id: number }) | undefined {
  return db.prepare(`
    SELECT c.*, ct.jid, ct.phone, ct.name, ct.notes
    FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.id = ?
  `).get(id) as any;
}

export function insertMessage(msg: {
  waMessageId?: string | null;
  conversationId: number;
  direction: 'in' | 'out';
  type?: string;
  text: string;
  fromAi?: boolean;
  timestamp?: number;
}): Message | null {
  const ts = msg.timestamp ?? Math.floor(Date.now() / 1000);
  const info = db.prepare(`
    INSERT OR IGNORE INTO messages (wa_message_id, conversation_id, direction, type, text, from_ai, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(msg.waMessageId ?? null, msg.conversationId, msg.direction, msg.type ?? 'text', msg.text, msg.fromAi ? 1 : 0, ts);
  if (info.changes === 0) return null; // duplicate wa_message_id

  const unreadDelta = msg.direction === 'in' ? 1 : 0;
  db.prepare('UPDATE conversations SET last_message_at = ?, unread_count = unread_count + ? WHERE id = ?')
    .run(ts, unreadDelta, msg.conversationId);

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid) as Message;
  bus.emitEvent({ type: 'message.new', conversationId: msg.conversationId, message: row });
  bus.emitEvent({ type: 'conversation.updated', conversation: getConversation(msg.conversationId) });
  return row;
}

export function listConversations() {
  return db.prepare(`
    SELECT c.id, c.mode, c.unread_count, c.last_message_at,
           ct.id AS contact_id, ct.jid, ct.phone, ct.name,
           (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_message,
           (SELECT direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_direction
    FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
    ORDER BY c.last_message_at DESC
  `).all();
}

export function listMessages(conversationId: number, limit = 100): Message[] {
  const rows = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ?
    ORDER BY timestamp DESC, id DESC LIMIT ?
  `).all(conversationId, limit) as Message[];
  return rows.reverse();
}

export function setConversationMode(id: number, mode: 'ai' | 'human') {
  db.prepare('UPDATE conversations SET mode = ? WHERE id = ?').run(mode, id);
  bus.emitEvent({ type: 'conversation.updated', conversation: getConversation(id) });
}

export function markConversationRead(id: number) {
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(id);
  bus.emitEvent({ type: 'conversation.updated', conversation: getConversation(id) });
}
