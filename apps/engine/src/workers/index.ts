import { startJobPoller, type JobHandler } from '../jobs/queue.js';
import { broadcastSendJob, resumeBroadcasts } from '../modules/broadcasts.js';
import { processReceiptJob, onReceiptJobDead } from './receipt-verifier.js';
import { paymentEmailPollJob, startEmailPolling } from './payment-email-poller.js';
import { runStyleAnalysis } from './style-worker.js';
import { startCollectionsScheduler } from './collections.js';
import { startDigestScheduler } from './digest.js';
import { startBackupScheduler } from './backup.js';
import { startPushDispatcher } from '../modules/push.js';
import { runsStore, runsWhatsapp } from '../roles.js';

// Workers are in-process modules that consume durable jobs. Each role registers
// only the handlers + schedulers it owns; the shared job queue (role-scoped
// claims, see jobs/queue.ts) keeps the two backends from stealing each other's
// jobs. In ROLE=all every worker runs in the one process, exactly as before.
export async function registerWorkers() {
  const handlers: Record<string, JobHandler> = {};

  // WhatsApp-side jobs: receipt vision-verification, voice-DNA style analysis,
  // and bulk broadcast sends — all need the WhatsApp socket and/or its media.
  if (runsWhatsapp) {
    handlers['receipt.process'] = processReceiptJob;
    handlers['style.analyze'] = runStyleAnalysis;
    handlers['broadcast.send'] = broadcastSendJob;
  }
  // Store-side jobs: inbound payment-email polling.
  if (runsStore) {
    handlers['payment.email_poll'] = paymentEmailPollJob;
  }

  await startJobPoller(handlers, (payload, job) => {
    if (job.type === 'receipt.process') void onReceiptJobDead(payload);
  });

  if (runsWhatsapp) {
    // Runs after startJobPoller has requeued crashed 'running' jobs, so it only
    // enqueues for broadcasts that truly have no live send chain.
    await resumeBroadcasts();
  }
  if (runsStore) {
    await startEmailPolling();
    startCollectionsScheduler();
    startDigestScheduler();
    startBackupScheduler();
    startPushDispatcher();
  }
}
