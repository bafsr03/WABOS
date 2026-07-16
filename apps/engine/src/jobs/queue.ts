import { one, none } from '../db/index.js';
import { logger } from '../logger.js';
import { currentBusinessId, runWithBusiness } from '../context.js';

// Durable job queue on Postgres: jobs survive restarts and get retried with
// backoff. Claiming uses UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)
// so it's race-free even across concurrent drains/processes. The handler
// signature maps 1:1 to a BullMQ processor for a future swap.

export interface Job {
  id: number;
  business_id: number;
  type: string;
  payload: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'dead';
  attempts: number;
  max_attempts: number;
  run_at: number;
  last_error: string | null;
}

export type JobHandler = (payload: any, job: Job) => Promise<void>;
export type DeadJobHandler = (payload: any, job: Job) => void;

const POLL_INTERVAL_MS = 5000;

let handlers: Record<string, JobHandler> = {};
let onDead: DeadJobHandler | undefined;
let draining = false;
let started = false;

export async function enqueueJob(type: string, payload: object, runAt?: number): Promise<number> {
  const row = await one<{ id: number }>(
    'INSERT INTO jobs (business_id, type, payload, run_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [currentBusinessId(), type, JSON.stringify(payload), runAt ?? Math.floor(Date.now() / 1000)],
  );
  return row!.id;
}

export function pokePoller() {
  void drain();
}

async function claimNextJob(): Promise<Job | undefined> {
  const now = Math.floor(Date.now() / 1000);
  return one<Job>(`
    UPDATE jobs SET status = 'running', updated_at = (extract(epoch from now())::bigint)
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'queued' AND run_at <= $1
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING *
  `, [now]);
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    let next: Job | undefined;
    while ((next = await claimNextJob())) {
      const job = next; // stable const so closures below keep the narrowed type
      const handler = handlers[job.type];
      const payload = JSON.parse(job.payload);
      if (!handler) {
        logger.error({ jobId: job.id, type: job.type }, 'no handler for job type');
        await none(`UPDATE jobs SET status = 'dead', last_error = 'no handler', updated_at = (extract(epoch from now())::bigint) WHERE id = $1`, [job.id]);
        continue;
      }
      // Run the handler inside the job's business context so every downstream
      // query scopes to the right tenant.
      try {
        await runWithBusiness(job.business_id, () => handler(payload, job));
        await none(`UPDATE jobs SET status = 'done', updated_at = (extract(epoch from now())::bigint) WHERE id = $1`, [job.id]);
      } catch (err: any) {
        const attempts = job.attempts + 1;
        const message = String(err?.message ?? err).slice(0, 500);
        if (attempts >= job.max_attempts) {
          logger.error({ jobId: job.id, type: job.type, err }, 'job dead after max attempts');
          await none(`UPDATE jobs SET status = 'dead', attempts = $1, last_error = $2, updated_at = (extract(epoch from now())::bigint) WHERE id = $3`,
            [attempts, message, job.id]);
          try { runWithBusiness(job.business_id, () => onDead?.(payload, { ...job, attempts })); } catch { /* never break the loop */ }
        } else {
          const backoff = attempts * attempts * 30;
          logger.warn({ jobId: job.id, type: job.type, attempts, backoff, err }, 'job failed, retrying');
          await none(`UPDATE jobs SET status = 'queued', attempts = $1, last_error = $2, run_at = (extract(epoch from now())::bigint) + $3, updated_at = (extract(epoch from now())::bigint) WHERE id = $4`,
            [attempts, message, backoff, job.id]);
        }
      }
    }
  } finally {
    draining = false;
  }
}

export async function startJobPoller(jobHandlers: Record<string, JobHandler>, deadJobHandler?: DeadJobHandler) {
  if (started) throw new Error('job poller already started');
  started = true;
  handlers = jobHandlers;
  onDead = deadJobHandler;
  // Jobs left running by a crash/restart go back to the queue.
  await none(`UPDATE jobs SET status = 'queued', updated_at = (extract(epoch from now())::bigint) WHERE status = 'running'`);
  setInterval(() => void drain(), POLL_INTERVAL_MS).unref();
  void drain();
}
