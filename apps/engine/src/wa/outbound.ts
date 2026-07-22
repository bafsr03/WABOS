import { logger } from '../logger.js';
import { getSock } from './connection.js';
import { currentBusinessId, runWithBusiness } from '../context.js';
import { getConversation, insertMessage } from '../modules/store.js';

interface SendJob {
  businessId: number;
  conversationId: number | null; // null = system message (e.g. owner digest): not threaded into the inbox
  jid: string;
  text: string;
  fromAi: boolean;
  humanized: boolean;
  resolve: (ok: boolean) => void;
}

// One serialized queue per business: each tenant's sends pace independently
// (anti-ban jitter) and route to that tenant's own socket.
const queues = new Map<number, { queue: SendJob[]; processing: boolean }>();
function queueFor(businessId: number) {
  let q = queues.get(businessId);
  if (!q) { q = { queue: [], processing: false }; queues.set(businessId, q); }
  return q;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

async function processQueue(businessId: number) {
  const q = queueFor(businessId);
  if (q.processing) return;
  q.processing = true;
  while (q.queue.length > 0) {
    const job = q.queue.shift()!;
    try {
      const sock = getSock(businessId);
      if (job.humanized) {
        await sock.sendPresenceUpdate('composing', job.jid);
        await sleep(jitter(2000, 5000));
        await sock.sendPresenceUpdate('paused', job.jid);
      } else {
        await sleep(jitter(800, 1800));
      }
      const sent = await sock.sendMessage(job.jid, { text: job.text });
      // The queue drains outside the original request context, so re-enter the
      // job's business before writing (insertMessage scopes by currentBusinessId).
      // System sends (conversationId null, e.g. the owner digest) are not logged
      // to a conversation, so they never appear in the customer inbox.
      if (job.conversationId != null) {
        await runWithBusiness(businessId, () => insertMessage({
          waMessageId: sent?.key?.id ?? null,
          conversationId: job.conversationId!,
          direction: 'out',
          text: job.text,
          fromAi: job.fromAi,
        }));
      }
      job.resolve(true);
    } catch (err) {
      logger.error({ err, jid: job.jid, businessId }, 'failed to send message');
      job.resolve(false);
    }
  }
  q.processing = false;
}

export async function sendText(opts: {
  conversationId: number;
  text: string;
  fromAi?: boolean;
  humanized?: boolean;
}): Promise<boolean> {
  const businessId = currentBusinessId();
  const conversation = await getConversation(opts.conversationId);
  if (!conversation) return false;
  return new Promise((resolve) => {
    queueFor(businessId).queue.push({
      businessId,
      conversationId: opts.conversationId,
      jid: conversation.jid,
      text: opts.text,
      fromAi: opts.fromAi ?? false,
      humanized: opts.humanized ?? true,
      resolve,
    });
    void processQueue(businessId);
  });
}

// Send a system message (e.g. the daily digest) from the business number to an
// arbitrary phone — the owner's personal number. Not threaded into any
// conversation, so it never shows up in the customer inbox. `phone` is digits
// only (no +); it's normalized to a WhatsApp JID.
export async function sendOwnerText(businessId: number, phone: string, text: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return false;
  return new Promise((resolve) => {
    queueFor(businessId).queue.push({
      businessId,
      conversationId: null,
      jid: `${digits}@s.whatsapp.net`,
      text,
      fromAi: false,
      humanized: false,
      resolve,
    });
    void processQueue(businessId);
  });
}
