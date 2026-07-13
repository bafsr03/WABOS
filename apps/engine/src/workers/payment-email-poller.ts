import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { logger } from '../logger.js';
import { getSetting } from '../db/index.js';
import { enqueueJob } from '../jobs/queue.js';
import { insertNotification } from '../modules/payment-notifications.js';
import { parseNotificationEmail } from '../modules/notification-parse.js';
import { rekickPendingReceipts } from './receipt-verifier.js';

// Senders we trust as payment-notification sources.
const SENDER_ALLOWLIST = ['yape.com.pe', 'viabcp.com', 'interbank.pe', 'bbva.pe', 'bbva.com', 'scotiabank.com.pe'];

function emailConfig() {
  return {
    enabled: getSetting('payments_ground_truth_source', 'off') === 'email',
    host: getSetting('payments_imap_host', ''),
    port: Number(getSetting('payments_imap_port', '993')) || 993,
    user: getSetting('payments_imap_user', ''),
    pass: getSetting('payments_imap_pass', ''),
  };
}

function isAllowed(from: string): boolean {
  const f = from.toLowerCase();
  return SENDER_ALLOWLIST.some((d) => f.includes(d));
}

// One IMAP sweep: fetch UNSEEN mail, parse payment alerts into the ledger, mark seen.
export async function pollPaymentEmails(): Promise<void> {
  const cfg = emailConfig();
  if (!cfg.enabled || !cfg.host || !cfg.user || !cfg.pass) return;

  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: true,
    auth: { user: cfg.user, pass: cfg.pass }, logger: false,
  });
  await client.connect();
  let ingested = 0;
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ seen: false }, { source: true, envelope: true })) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const from = parsed.from?.value?.[0]?.address ?? '';
          if (!isAllowed(from)) continue;
          const info = parseNotificationEmail({
            from,
            subject: parsed.subject ?? '',
            text: parsed.text ?? parsed.html?.toString() ?? '',
          });
          if (info) {
            const externalId = parsed.messageId ?? `${from}:${msg.uid}`;
            const receivedAt = parsed.date ? Math.floor(parsed.date.getTime() / 1000) : undefined;
            const row = insertNotification({
              source: 'email',
              provider: info.provider,
              amount: info.amount,
              currency: info.currency,
              operationNumber: info.operationNumber,
              senderName: info.senderName,
              rawText: (parsed.text ?? '').slice(0, 2000),
              receivedAt,
              externalId,
            });
            if (row) ingested++;
          }
        } finally {
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  if (ingested > 0) {
    logger.info({ ingested }, 'payment emails ingested');
    rekickPendingReceipts();
  }
}

// Self-rescheduling durable job: sweep, then queue exactly one next sweep.
// Errors are logged and swallowed so the job always completes 'done' — the 60s
// cadence is its own backoff, and letting it throw would make the queue retry
// AND reschedule, spawning duplicate loops.
export async function paymentEmailPollJob(): Promise<void> {
  try {
    await pollPaymentEmails();
  } catch (err) {
    logger.warn({ err }, 'payment email poll failed');
  } finally {
    if (emailConfig().enabled) {
      enqueueJob('payment.email_poll', {}, Math.floor(Date.now() / 1000) + 60);
    }
  }
}

// Kick off the loop at startup if email polling is configured.
export function startEmailPolling() {
  if (emailConfig().enabled) enqueueJob('payment.email_poll', {}, Math.floor(Date.now() / 1000) + 5);
}
