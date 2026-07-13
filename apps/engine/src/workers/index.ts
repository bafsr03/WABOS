import { startJobPoller } from '../jobs/queue.js';
import { processReceiptJob, onReceiptJobDead } from './receipt-verifier.js';
import { paymentEmailPollJob, startEmailPolling } from './payment-email-poller.js';

// Workers are in-process modules that consume durable jobs. To add one:
// export job handlers from src/workers/<name>.ts and register them here.
export function registerWorkers() {
  startJobPoller(
    {
      'receipt.process': processReceiptJob,
      'payment.email_poll': paymentEmailPollJob,
    },
    (payload, job) => {
      if (job.type === 'receipt.process') onReceiptJobDead(payload);
    },
  );
  startEmailPolling();
}
