import type { proto, WAMessage } from '@whiskeysockets/baileys';
import { logger } from '../logger.js';
import { getSetting } from '../db/index.js';
import { currentBusinessId, runWithBusiness } from '../context.js';
import {
  getConversation,
  getOrCreateConversation,
  insertMessage,
  upsertContactByJid,
} from '../modules/store.js';
import { runAiEmployee } from '../ai/employee.js';
import { handleInboundImage, handleInboundAudio } from './media.js';

const AI_DEBOUNCE_MS = 4000;
const pendingAi = new Map<number, NodeJS.Timeout>();

export function extractText(message: proto.IMessage | null | undefined): { text: string; type: string } | null {
  if (!message) return null;
  if (message.conversation) return { text: message.conversation, type: 'text' };
  if (message.extendedTextMessage?.text) return { text: message.extendedTextMessage.text, type: 'text' };
  if (message.imageMessage) return { text: message.imageMessage.caption ?? '[imagen]', type: 'image' };
  if (message.videoMessage) return { text: message.videoMessage.caption ?? '[video]', type: 'video' };
  if (message.audioMessage) return { text: '[nota de voz]', type: 'audio' };
  if (message.documentMessage) return { text: `[documento] ${message.documentMessage.fileName ?? ''}`.trim(), type: 'document' };
  if (message.stickerMessage) return { text: '[sticker]', type: 'sticker' };
  if (message.locationMessage) return { text: '[ubicación]', type: 'location' };
  if (message.contactMessage) return { text: '[contacto]', type: 'contact' };
  if (message.ephemeralMessage) return extractText(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return extractText(message.viewOnceMessage.message);
  return null;
}

export function isIgnorableJid(jid: string): boolean {
  return (
    jid.endsWith('@g.us') ||          // groups
    jid.endsWith('@broadcast') ||     // status / broadcast lists
    jid.endsWith('@newsletter') ||    // channels
    jid === 'status@broadcast'
  );
}

// The caller (the per-business socket in connection.ts) already runs this inside
// runWithBusiness(businessId), so every query/emit here scopes to that tenant.
export async function handleInbound(upsert: { messages: WAMessage[]; type: string }): Promise<void> {
  if (upsert.type !== 'notify' && upsert.type !== 'append') return;
  for (const msg of upsert.messages) {
    const jid = msg.key.remoteJid;
    if (!jid || isIgnorableJid(jid)) continue;

    const extracted = extractText(msg.message);
    if (!extracted) continue;

    const fromMe = Boolean(msg.key.fromMe);
    const contact = await upsertContactByJid(jid, fromMe ? undefined : msg.pushName ?? undefined);
    const conversation = await getOrCreateConversation(contact.id);

    const stored = await insertMessage({
      waMessageId: msg.key.id,
      conversationId: conversation.id,
      direction: fromMe ? 'out' : 'in',
      type: extracted.type,
      text: extracted.text,
      timestamp: Number(msg.messageTimestamp) || undefined,
    });
    if (!stored) continue; // duplicate

    if (fromMe) continue; // messages sent from the owner's phone never trigger the AI

    if (extracted.type === 'image') {
      const claimed = await handleInboundImage(msg, stored, contact, conversation)
        .catch((err) => { logger.error({ err, messageId: stored.id }, 'inbound image handling failed'); return false; });
      if (claimed) continue; // the receipt worker owns the reply — skip the AI debounce
    } else if (extracted.type === 'audio') {
      // Store the voice note (best-effort); it never blocks or claims the reply.
      await handleInboundAudio(msg, stored, contact)
        .catch((err) => logger.error({ err, messageId: stored.id }, 'inbound audio handling failed'));
    }

    await scheduleAiReply(conversation.id);
  }
}

// Debounce so someone typing 3 quick messages gets one coherent reply, not three.
// Exported so the receipt worker can hand non-receipt images back to the AI.
export async function scheduleAiReply(conversationId: number): Promise<void> {
  if (await getSetting('ai_enabled', '1') !== '1') return;
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.mode !== 'ai') return;

  const existing = pendingAi.get(conversationId);
  if (existing) clearTimeout(existing);

  // The debounce timer fires outside the current async context, so capture the
  // business now and re-enter it when the deferred reply runs.
  const businessId = currentBusinessId();
  pendingAi.set(conversationId, setTimeout(() => runWithBusiness(businessId, async () => {
    pendingAi.delete(conversationId);
    // Re-check right before running: the owner may have taken over meanwhile
    const fresh = await getConversation(conversationId);
    if (!fresh || fresh.mode !== 'ai' || (await getSetting('ai_enabled', '1')) !== '1') return;
    runAiEmployee(conversationId).catch((err) => logger.error({ err, conversationId }, 'AI employee failed'));
  }), AI_DEBOUNCE_MS));
}
