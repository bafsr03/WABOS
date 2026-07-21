import { downloadMediaMessage, type WAMessage, type proto } from '@whiskeysockets/baileys';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { one } from '../db/index.js';
import { bus } from '../events.js';
import type { Contact, Conversation, Message } from '../modules/store.js';
import { createReceipt, getPaymentSettings, listPendingCharges, type MediaRow } from '../modules/charges.js';
import { enqueueJob, pokePoller } from '../jobs/queue.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
};

function unwrapImage(message: proto.IMessage | null | undefined): proto.Message.IImageMessage | null {
  if (!message) return null;
  if (message.imageMessage) return message.imageMessage;
  if (message.ephemeralMessage) return unwrapImage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapImage(message.viewOnceMessage.message);
  return null;
}

function unwrapAudio(message: proto.IMessage | null | undefined): proto.Message.IAudioMessage | null {
  if (!message) return null;
  if (message.audioMessage) return message.audioMessage;
  if (message.ephemeralMessage) return unwrapAudio(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapAudio(message.viewOnceMessage.message);
  return null;
}

// Content-addressed storage: write the buffer under mediaDir/<year>/<month>/<sha>.<ext>
// (deduped by sha256) and insert a media row. Returns the new media id.
async function storeMedia(buffer: Buffer, mime: string, messageId: number, ext: string): Promise<number> {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const now = new Date();
  const relDir = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  const relPath = path.join(relDir, `${sha256}.${ext}`);
  const absPath = path.join(config.mediaDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  if (!fs.existsSync(absPath)) fs.writeFileSync(absPath, buffer);
  const { id } = (await one<{ id: number }>(`
    INSERT INTO media (message_id, mime, path, size_bytes, sha256) VALUES ($1, $2, $3, $4, $5) RETURNING id
  `, [messageId, mime, relPath, buffer.length, sha256]))!;
  return id;
}

// Downloads and stores an inbound image, then queues it for receipt
// verification. Returns true when the image was claimed: the receipt worker
// now owns the conversation's reply, so the caller must skip the AI debounce.
export async function handleInboundImage(
  msg: WAMessage,
  stored: Message,
  contact: Contact,
  conversation: Conversation,
): Promise<boolean> {
  const image = unwrapImage(msg.message);
  if (!image) return false;

  const settings = await getPaymentSettings();
  if (settings.downloadPolicy === 'pending_charge' && (await listPendingCharges(contact.id)).length === 0) {
    return false;
  }

  const declaredSize = Number(image.fileLength ?? 0);
  if (declaredSize > MAX_IMAGE_BYTES) {
    logger.warn({ messageId: stored.id, declaredSize }, 'inbound image too large, skipping download');
    return false;
  }

  const buffer = await downloadMediaMessage(msg, 'buffer', {});
  if (buffer.length > MAX_IMAGE_BYTES) {
    logger.warn({ messageId: stored.id, size: buffer.length }, 'inbound image too large after download');
    return false;
  }

  const mime = image.mimetype ?? 'image/jpeg';
  const mediaId = await storeMedia(buffer, mime, stored.id, EXT_BY_MIME[mime] ?? 'jpg');

  const receipt = await createReceipt({
    mediaId,
    messageId: stored.id,
    contactId: contact.id,
    conversationId: conversation.id,
  });

  await enqueueJob('receipt.process', { receiptId: receipt.id });
  bus.emitInternal({
    type: 'media.received',
    mediaId,
    messageId: stored.id,
    conversationId: conversation.id,
    contactId: contact.id,
  });
  pokePoller();
  logger.info({ mediaId, receiptId: receipt.id, contactId: contact.id }, 'inbound image queued for receipt verification');
  return true;
}

// Downloads and stores an inbound voice note / audio message. Store-only (no
// transcription yet) — it makes the audio playable in the inbox and available
// for future features. Returns true when stored.
export async function handleInboundAudio(msg: WAMessage, stored: Message, contact: Contact): Promise<boolean> {
  const audio = unwrapAudio(msg.message);
  if (!audio) return false;

  const declaredSize = Number(audio.fileLength ?? 0);
  if (declaredSize > MAX_AUDIO_BYTES) {
    logger.warn({ messageId: stored.id, declaredSize }, 'inbound audio too large, skipping download');
    return false;
  }

  const buffer = await downloadMediaMessage(msg, 'buffer', {});
  if (buffer.length > MAX_AUDIO_BYTES) {
    logger.warn({ messageId: stored.id, size: buffer.length }, 'inbound audio too large after download');
    return false;
  }

  const mime = (audio.mimetype ?? 'audio/ogg').split(';')[0]; // strip "; codecs=opus"
  const mediaId = await storeMedia(buffer, mime, stored.id, EXT_BY_MIME[mime] ?? 'ogg');
  bus.emitInternal({
    type: 'media.received',
    mediaId,
    messageId: stored.id,
    conversationId: stored.conversation_id,
    contactId: contact.id,
  });
  logger.info({ mediaId, messageId: stored.id }, 'inbound audio stored');
  return true;
}

export function mediaAbsolutePath(media: MediaRow): string {
  return path.join(config.mediaDir, media.path);
}
