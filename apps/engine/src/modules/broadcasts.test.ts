import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Broadcasts must be durable: progress lives in broadcast_recipients rows, so a
// restart resumes from the first pending recipient with no duplicate sends.

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('./store.js');
let bc: typeof import('./broadcasts.js');

beforeAll(async () => {
  schema = await useTempSchema();
  // The job handler calls getSock(); stub the WhatsApp socket so no real network.
  vi.doMock('../wa/connection.js', () => ({
    getSock: () => {
      if (!(globalThis as any).__waConnected) throw new Error('WhatsApp is not connected');
      return { sendMessage: async () => ({ key: { id: `wa-${Math.random()}` } }) };
    },
  }));
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('./store.js');
  bc = await import('./broadcasts.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  (globalThis as any).__waConnected = true;
  await db.none('DELETE FROM broadcast_recipients');
  await db.none('DELETE FROM broadcasts');
  await db.none('DELETE FROM messages');
  await db.none('DELETE FROM conversations');
  await db.none('DELETE FROM jobs');
  await db.none('DELETE FROM contacts');
});

async function seedContacts(n: number) {
  for (let i = 0; i < n; i++) await store.upsertContactByJid(`5199900${i}@s.whatsapp.net`, `C${i}`);
}

const status = async (id: number) =>
  (await db.one<{ status: string }>('SELECT status FROM broadcasts WHERE id = $1', [id]))!.status;
const recipientStatuses = async (id: number) =>
  (await db.many<{ status: string }>('SELECT status FROM broadcast_recipients WHERE broadcast_id = $1', [id])).map((r) => r.status);

// Drive the self-rescheduling handler directly (ignoring run_at), like the poller would.
async function drain(broadcastId: number, max = 50) {
  for (let i = 0; i < max && (await status(broadcastId)) === 'sending'; i++) {
    await bc.broadcastSendJob({ broadcastId });
  }
}

describe('durable broadcast send', () => {
  it('sends one recipient per job invocation and resumes after an interruption', async () => {
    await seedContacts(3);
    const created = (await bc.createBroadcast({ name: 'promo', message: 'hola' })) as any;
    const id = created.id;
    expect(await status(id)).toBe('sending');
    expect(await recipientStatuses(id)).toEqual(['pending', 'pending', 'pending']);

    await bc.broadcastSendJob({ broadcastId: id });
    expect((await recipientStatuses(id)).filter((s) => s === 'sent').length).toBe(1);
    expect((await recipientStatuses(id)).filter((s) => s === 'pending').length).toBe(2);

    // Simulate a restart: nothing is held in memory — resume purely from DB state.
    await drain(id);

    expect(await recipientStatuses(id)).toEqual(['sent', 'sent', 'sent']);
    expect(await status(id)).toBe('done');
    const b = (await db.one<{ sent: number; total: number }>('SELECT sent, total FROM broadcasts WHERE id = $1', [id]))!;
    expect(b.sent).toBe(3);
    expect((await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM messages'))!.n).toBe(3);
  });

  it('pauses without failing recipients when WhatsApp is disconnected', async () => {
    await seedContacts(2);
    (globalThis as any).__waConnected = false;
    const created = (await bc.createBroadcast({ name: 'promo', message: 'hola' })) as any;
    const id = created.id;

    await bc.broadcastSendJob({ broadcastId: id });

    expect((await recipientStatuses(id)).every((s) => s === 'pending')).toBe(true);
    const queued = (await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM jobs WHERE type = 'broadcast.send' AND status = 'queued'"))!;
    expect(queued.n).toBeGreaterThan(0);

    (globalThis as any).__waConnected = true;
    await drain(id);
    expect(await recipientStatuses(id)).toEqual(['sent', 'sent']);
    expect(await status(id)).toBe('done');
  });
});
