import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The schema + runtime are tenant-shaped: the same helpers, run under different
// business contexts, read and clear only their own tenant's data.

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('./store.js');
let reset: typeof import('./reset.js');
let ctx: typeof import('../context.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('./store.js');
  reset = await import('./reset.js');
  ctx = await import('../context.js');
  // Business 1 is seeded by the migration; add a second tenant.
  await db.none("INSERT INTO businesses (id, name) VALUES (2, 'Biz Two')");
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

const contactCount = async (businessId: number) =>
  (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM contacts WHERE business_id = $1', [businessId]))!.n;

describe('per-business scoping', () => {
  it('isolates settings, contacts and conversations by business context', async () => {
    await ctx.runWithBusiness(1, async () => {
      await db.setSetting('business_name', 'Alpha');
      const c = await store.upsertContactByJid('5111@s.whatsapp.net', 'Ana');
      await store.getOrCreateConversation(c.id);
    });
    await ctx.runWithBusiness(2, async () => {
      await db.setSetting('business_name', 'Beta');
      const c = await store.upsertContactByJid('5222@s.whatsapp.net', 'Bob');
      await store.getOrCreateConversation(c.id);
    });

    // Settings don't bleed across tenants (same key, different values).
    expect(await ctx.runWithBusiness(1, () => db.getSetting('business_name', ''))).toBe('Alpha');
    expect(await ctx.runWithBusiness(2, () => db.getSetting('business_name', ''))).toBe('Beta');

    // listConversations returns only the current tenant's chats.
    expect(await ctx.runWithBusiness(1, () => store.listConversations())).toHaveLength(1);
    expect(await ctx.runWithBusiness(2, () => store.listConversations())).toHaveLength(1);

    expect(await contactCount(1)).toBe(1);
    expect(await contactCount(2)).toBe(1);
  });

  it('clears connection data for one tenant without touching the other', async () => {
    await ctx.runWithBusiness(1, () => reset.clearConnectionData());

    expect(await ctx.runWithBusiness(1, () => store.listConversations())).toHaveLength(0);
    expect(await contactCount(1)).toBe(1); // CRM kept
    expect(await ctx.runWithBusiness(2, () => store.listConversations())).toHaveLength(1);
    expect(await ctx.runWithBusiness(2, () => db.getSetting('business_name', ''))).toBe('Beta');
  });
});
