import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Metering math + hard-cap boundary on a Basico-tier business (limit 1000).

let schema: string;
let db: typeof import('../db/index.js');
let ctx: typeof import('../context.js');
let usage: typeof import('./usage.js');
let ent: typeof import('./entitlements.js');
let bizId: number;

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  ctx = await import('../context.js');
  usage = await import('./usage.js');
  ent = await import('./entitlements.js');
  // Basico tier has a 1,000-message cap (the boundary this test exercises).
  const row = await db.one<{ id: number }>("INSERT INTO businesses (name, plan_tier) VALUES ('Basico Co', 'basico') RETURNING id");
  bizId = row!.id;
});

afterAll(async () => {
  await db.pool.end();
  await dropTempSchema(schema);
});

describe('ai usage metering', () => {
  it('accumulates messages/tokens and enforces the tier cap at the boundary', async () => {
    await ctx.runWithBusiness(bizId, async () => {
      expect(await ent.getPlanTier()).toBe('basico');
      expect(await ent.isAiWithinLimit()).toBe(true);

      let u = await ent.getAiUsage();
      expect(u).toMatchObject({ messages: 0, limit: 1000 });

      await usage.recordAiUsage({ messages: 999, inputTokens: 10, outputTokens: 20 });
      expect(await ent.isAiWithinLimit()).toBe(true); // 999 < 1000

      await usage.recordAiUsage({ messages: 1, inputTokens: 3, outputTokens: 4 });
      u = await ent.getAiUsage();
      expect(u.messages).toBe(1000);
      expect(u.inputTokens).toBe(13);
      expect(u.outputTokens).toBe(24);
      expect(await ent.isAiWithinLimit()).toBe(false); // 1000 >= 1000 → paused
    });
  });

  it('applies the free-trial cap and falls back to free for an unknown tier', async () => {
    const free = (await db.one<{ id: number }>("INSERT INTO businesses (name, plan_tier) VALUES ('Trial Co', 'free') RETURNING id"))!;
    const bogus = (await db.one<{ id: number }>("INSERT INTO businesses (name, plan_tier) VALUES ('Weird Co', 'mystery') RETURNING id"))!;
    await ctx.runWithBusiness(free.id, async () => {
      expect((await ent.getLimits()).aiMessagesPerMonth).toBe(200);
    });
    await ctx.runWithBusiness(bogus.id, async () => {
      expect((await ent.getLimits()).aiMessagesPerMonth).toBe(200); // unknown → free caps
    });
  });
});
