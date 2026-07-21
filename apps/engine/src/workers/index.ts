import { startJobPoller } from '../jobs/queue.js';
import { broadcastSendJob, resumeBroadcasts } from '../modules/broadcasts.js';
import { processReceiptJob, onReceiptJobDead } from './receipt-verifier.js';
import { paymentEmailPollJob, startEmailPolling } from './payment-email-poller.js';
import { runStyleAnalysis } from './style-worker.js';
import { startCollectionsScheduler } from './collections.js';
import { startPushDispatcher } from '../modules/push.js';

// Workers are in-process modules that consume durable jobs. To add one:
// export job handlers from src/workers/<name>.ts and register them here.
export async function registerWorkers() {
  await startJobPoller(
    {
      'receipt.process': processReceiptJob,
      'payment.email_poll': paymentEmailPollJob,
      'style.analyze': runStyleAnalysis,
      'broadcast.send': broadcastSendJob,
    },
    (payload, job) => {
      if (job.type === 'receipt.process') void onReceiptJobDead(payload);
    },
  );
  // Runs after startJobPoller has requeued crashed 'running' jobs, so it only
  // enqueues for broadcasts that truly have no live send chain.
  await resumeBroadcasts();
  await startEmailPolling();
  startCollectionsScheduler();
  startPushDispatcher();
}
