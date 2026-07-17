import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

// Pure-logic coverage for the Lemon Squeezy provider: variant→tier mapping,
// subscription status→tier rules, and webhook signature verification. No DB is
// touched (the happy path uses a non-subscription event that returns early).

const SECRET = 'whsec_unit_test';
let prov: typeof import('./provider.js');
let ls: typeof import('./lemonsqueezy.js');

beforeAll(async () => {
  // Set config env BEFORE the first import of config (dynamic import below).
  process.env.LEMONSQUEEZY_API_KEY = 'test_key';
  process.env.LEMONSQUEEZY_STORE_ID = '1';
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = SECRET;
  process.env.LEMONSQUEEZY_VARIANT_PRO = 'var_pro';
  process.env.LEMONSQUEEZY_VARIANT_ENTERPRISE = 'var_ent';
  prov = await import('./provider.js');
  ls = await import('./lemonsqueezy.js');
});

describe('variant → tier', () => {
  it('maps configured variants and rejects unknown ones', () => {
    expect(prov.tierForVariant('var_pro')).toBe('pro');
    expect(prov.tierForVariant('var_ent')).toBe('enterprise');
    expect(prov.tierForVariant('nope')).toBeNull();
  });
});

describe('subscription status → tier', () => {
  const future = Math.floor(Date.now() / 1000) + 86400;
  const past = Math.floor(Date.now() / 1000) - 86400;
  it('grants the tier while active/on_trial/past_due', () => {
    expect(ls.tierForSubscription('active', 'var_pro', null)).toBe('pro');
    expect(ls.tierForSubscription('on_trial', 'var_ent', null)).toBe('enterprise');
    expect(ls.tierForSubscription('past_due', 'var_pro', null)).toBe('pro');
  });
  it('keeps the tier for a cancelled sub until the period ends, then drops to free', () => {
    expect(ls.tierForSubscription('cancelled', 'var_pro', future)).toBe('pro');
    expect(ls.tierForSubscription('cancelled', 'var_pro', past)).toBe('free');
  });
  it('drops to free on terminal statuses', () => {
    expect(ls.tierForSubscription('expired', 'var_pro', future)).toBe('free');
    expect(ls.tierForSubscription('unpaid', 'var_pro', future)).toBe('free');
    expect(ls.tierForSubscription('paused', 'var_pro', future)).toBe('free');
  });
});

describe('webhook signature', () => {
  const body = Buffer.from(JSON.stringify({ meta: { event_name: 'order_created' }, data: { type: 'orders' } }));
  const sign = (b: Buffer) => crypto.createHmac('sha256', SECRET).update(b).digest('hex');

  it('accepts a correctly signed (non-subscription) event without touching the DB', async () => {
    await expect(ls.lemonSqueezyProvider.handleWebhook(body, { 'x-signature': sign(body) })).resolves.toBeUndefined();
  });
  it('rejects a bad signature', async () => {
    await expect(ls.lemonSqueezyProvider.handleWebhook(body, { 'x-signature': 'deadbeef' }))
      .rejects.toMatchObject({ code: 'BAD_SIGNATURE' });
  });
});
