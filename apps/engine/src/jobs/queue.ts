import { db } from '../db/index.js';
import { logger } from '../logger.js';

// Minimal durable job queue on SQLite: jobs survive restarts and get retried
// with backoff. Single process + synchronous better-sqlite3 means claiming a
// job is race-free. The handler signature maps 1:1 to a BullMQ processor so a
// future swap to a real queue only replaces this file.

export interface Job {
  id: number;
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

export function enqueueJob(type: string, payload: object, runAt?: number): number {
  const info = db.prepare('INSERT INTO jobs (type, payload, run_at) VALUES (?, ?, ?)')
    .run(type, JSON.stringify(payload), runAt ?? Math.floor(Date.now() / 1000));
  return Number(info.lastInsertRowid);
}

export function pokePoller() {
  void drain();
}

function claimNextJob(): Job | undefined {
  const now = Math.floor(Date.now() / 1000);
  const job = db.prepare(`
    SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY id LIMIT 1
  `).get(now) as Job | undefined;
  if (!job) return undefined;
  db.prepare(`UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ?`).run(job.id);
  return job;
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    let job: Job | undefined;
    while ((job = claimNextJob())) {
      const handler = handlers[job.type];
      const payload = JSON.parse(job.payload);
      if (!handler) {
        logger.error({ jobId: job.id, type: job.type }, 'no handler for job type');
        db.prepare(`UPDATE jobs SET status = 'dead', last_error = 'no handler', updated_at = unixepoch() WHERE id = ?`).run(job.id);
        continue;
      }
      try {
        await handler(payload, job);
        db.prepare(`UPDATE jobs SET status = 'done', updated_at = unixepoch() WHERE id = ?`).run(job.id);
      } catch (err: any) {
        const attempts = job.attempts + 1;
        const message = String(err?.message ?? err).slice(0, 500);
        if (attempts >= job.max_attempts) {
          logger.error({ jobId: job.id, type: job.type, err }, 'job dead after max attempts');
          db.prepare(`UPDATE jobs SET status = 'dead', attempts = ?, last_error = ?, updated_at = unixepoch() WHERE id = ?`)
            .run(attempts, message, job.id);
          try { onDead?.(payload, { ...job, attempts }); } catch { /* never break the loop */ }
        } else {
          const backoff = attempts * attempts * 30;
          logger.warn({ jobId: job.id, type: job.type, attempts, backoff, err }, 'job failed, retrying');
          db.prepare(`UPDATE jobs SET status = 'queued', attempts = ?, last_error = ?, run_at = unixepoch() + ?, updated_at = unixepoch() WHERE id = ?`)
            .run(attempts, message, backoff, job.id);
        }
      }
    }
  } finally {
    draining = false;
  }
}

export function startJobPoller(jobHandlers: Record<string, JobHandler>, deadJobHandler?: DeadJobHandler) {
  if (started) throw new Error('job poller already started');
  started = true;
  handlers = jobHandlers;
  onDead = deadJobHandler;
  // Jobs left running by a crash/restart go back to the queue.
  db.prepare(`UPDATE jobs SET status = 'queued', updated_at = unixepoch() WHERE status = 'running'`).run();
  setInterval(() => void drain(), POLL_INTERVAL_MS).unref();
  void drain();
}
