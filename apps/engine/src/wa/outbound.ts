import { logger } from '../logger.js';
import { getSock } from './connection.js';
import { getConversation, insertMessage } from '../modules/store.js';

interface SendJob {
  conversationId: number;
  jid: string;
  text: string;
  fromAi: boolean;
  humanized: boolean;
  resolve: (ok: boolean) => void;
}

const queue: SendJob[] = [];
let processing = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

// All outgoing messages funnel through one serialized queue: a global pace
// with jitter keeps sending patterns human-shaped (anti-ban guardrail).
async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      const sock = getSock();
      if (job.humanized) {
        await sock.sendPresenceUpdate('composing', job.jid);
        await sleep(jitter(2000, 5000));
        await sock.sendPresenceUpdate('paused', job.jid);
      } else {
        await sleep(jitter(800, 1800));
      }
      const sent = await sock.sendMessage(job.jid, { text: job.text });
      insertMessage({
        waMessageId: sent?.key?.id ?? null,
        conversationId: job.conversationId,
        direction: 'out',
        text: job.text,
        fromAi: job.fromAi,
      });
      job.resolve(true);
    } catch (err) {
      logger.error({ err, jid: job.jid }, 'failed to send message');
      job.resolve(false);
    }
  }
  processing = false;
}

export function sendText(opts: {
  conversationId: number;
  text: string;
  fromAi?: boolean;
  humanized?: boolean;
}): Promise<boolean> {
  const conversation = getConversation(opts.conversationId);
  if (!conversation) return Promise.resolve(false);
  return new Promise((resolve) => {
    queue.push({
      conversationId: opts.conversationId,
      jid: conversation.jid,
      text: opts.text,
      fromAi: opts.fromAi ?? false,
      humanized: opts.humanized ?? true,
      resolve,
    });
    void processQueue();
  });
}
