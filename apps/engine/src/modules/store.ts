import { one, many, none } from '../db/index.js';
import { bus } from '../events.js';
import { currentBusinessId } from '../context.js';

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

export async function upsertContactByJid(jid: string, name?: string): Promise<Contact> {
  const businessId = currentBusinessId();
  const existing = await one<Contact>('SELECT * FROM contacts WHERE business_id = $1 AND jid = $2', [businessId, jid]);
  if (existing) {
    // Keep a manually-set name; only fill in the WhatsApp pushName when we have nothing
    if (name && !existing.name) {
      await none('UPDATE contacts SET name = $1 WHERE id = $2', [name, existing.id]);
      existing.name = name;
    }
    return existing;
  }
  return (await one<Contact>(
    'INSERT INTO contacts (business_id, jid, phone, name) VALUES ($1, $2, $3, $4) RETURNING *',
    [businessId, jid, jidToPhone(jid), name ?? ''],
  ))!;
}

export async function getOrCreateConversation(contactId: number): Promise<Conversation> {
  const existing = await one<Conversation>('SELECT * FROM conversations WHERE contact_id = $1', [contactId]);
  if (existing) return existing;
  return (await one<Conversation>(
    'INSERT INTO conversations (business_id, contact_id) VALUES ($1, $2) RETURNING *',
    [currentBusinessId(), contactId],
  ))!;
}

export async function getConversation(id: number): Promise<(Conversation & Contact & { contact_id: number }) | undefined> {
  return one(`
    SELECT c.*, ct.jid, ct.phone, ct.name, ct.notes
    FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.id = $1 AND c.business_id = $2
  `, [id, currentBusinessId()]);
}

// True when the conversation's contact carries `tagName`. Used to route model
// tiering (sales-tagged chats get the stronger model). Case-insensitive to match
// how tag_customer stores tags (lowercased).
export async function conversationHasTag(conversationId: number, tagName: string): Promise<boolean> {
  const row = await one(`
    SELECT 1 FROM conversations c
    JOIN contact_tags ct ON ct.contact_id = c.contact_id
    JOIN tags t ON t.id = ct.tag_id
    WHERE c.id = $1 AND c.business_id = $2 AND lower(t.name) = lower($3)
    LIMIT 1
  `, [conversationId, currentBusinessId(), tagName]);
  return row !== undefined;
}

export async function insertMessage(msg: {
  waMessageId?: string | null;
  conversationId: number;
  direction: 'in' | 'out';
  type?: string;
  text: string;
  fromAi?: boolean;
  timestamp?: number;
}): Promise<Message | null> {
  const ts = msg.timestamp ?? Math.floor(Date.now() / 1000);
  const inserted = await one<{ id: number }>(`
    INSERT INTO messages (wa_message_id, conversation_id, direction, type, text, from_ai, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
    RETURNING id
  `, [msg.waMessageId ?? null, msg.conversationId, msg.direction, msg.type ?? 'text', msg.text, msg.fromAi ? 1 : 0, ts]);
  if (!inserted) return null; // duplicate wa_message_id

  const unreadDelta = msg.direction === 'in' ? 1 : 0;
  await none('UPDATE conversations SET last_message_at = $1, unread_count = unread_count + $2 WHERE id = $3',
    [ts, unreadDelta, msg.conversationId]);

  const row = (await one<Message>('SELECT * FROM messages WHERE id = $1', [inserted.id]))!;
  bus.emitEvent({ type: 'message.new', conversationId: msg.conversationId, message: row });
  bus.emitEvent({ type: 'conversation.updated', conversation: await getConversation(msg.conversationId) });
  return row;
}

export async function listConversations() {
  return many(`
    SELECT c.id, c.mode, c.unread_count, c.last_message_at,
           ct.id AS contact_id, ct.jid, ct.phone, ct.name,
           (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_message,
           (SELECT direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.timestamp DESC, m.id DESC LIMIT 1) AS last_direction
    FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.business_id = $1
    ORDER BY c.last_message_at DESC
  `, [currentBusinessId()]);
}

export async function listMessages(conversationId: number, limit = 100): Promise<Message[]> {
  const rows = await many<Message>(`
    SELECT * FROM messages WHERE conversation_id = $1
    ORDER BY timestamp DESC, id DESC LIMIT $2
  `, [conversationId, limit]);
  return rows.reverse();
}

export async function setConversationMode(id: number, mode: 'ai' | 'human') {
  await none('UPDATE conversations SET mode = $1 WHERE id = $2', [mode, id]);
  bus.emitEvent({ type: 'conversation.updated', conversation: await getConversation(id) });
}

export async function markConversationRead(id: number) {
  await none('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);
  bus.emitEvent({ type: 'conversation.updated', conversation: await getConversation(id) });
}
