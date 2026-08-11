import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// getAnalytics runs non-trivial SQL (percentile_cont, jsonb ->>, FILTER). This
// exercises it against a real schema with seeded events + messages.

let schema: string;
let db: typeof import('../db/index.js');
let analytics: typeof import('./analytics.js');
let store: typeof import('./store.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  analytics = await import('./analytics.js');
  store = await import('./store.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM events');
  await db.none('DELETE FROM sale_items');
  await db.none('DELETE FROM sales');
  await db.none('DELETE FROM cash_movements');
  await db.none('DELETE FROM messages');
  await db.none('DELETE FROM conversations');
  await db.none('DELETE FROM contacts');
});

const insertEvent = (type: string, amount: number | null, meta: object = {}) =>
  db.none('INSERT INTO events (business_id, type, amount, meta) VALUES (1, $1, $2, $3)', [type, amount, JSON.stringify(meta)]);

describe('getAnalytics', () => {
  it('aggregates revenue from the register, conversion, searches and response time', async () => {
    await insertEvent('charge.created', 100);
    await insertEvent('charge.created', 50);
    await insertEvent('charge.paid', 100, { method: 'bank_match' });
    await insertEvent('catalog.search', null, { query: 'polo azul' });
    await insertEvent('catalog.search', null, { query: 'polo azul' });
    await insertEvent('catalog.search', null, { query: 'gorra' });

    // Revenue now comes from the register: a real sale of 100 (POS), with line items.
    const sale = (await db.one<{ id: number }>(
      `INSERT INTO sales (business_id, total, subtotal, net, cost_total, payment_method, status) VALUES (1,100,100,100,40,'cash','completed') RETURNING id`,
    ))!;
    await db.none(`INSERT INTO sale_items (sale_id, name, qty, unit_price, unit_cost, line_total) VALUES ($1,'Polo azul',3,20,10,60)`, [sale.id]);
    await db.none(`INSERT INTO cash_movements (business_id, kind, amount) VALUES (1,'expense',15)`);

    // Seed a conversation with an inbound then an AI reply 30s later.
    const contact = await store.upsertContactByJid('51999000009@s.whatsapp.net', 'C');
    const convo = await store.getOrCreateConversation(contact.id);
    const t0 = Math.floor(Date.now() / 1000) - 100;
    await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'hola', timestamp: t0 });
    await store.insertMessage({ conversationId: convo.id, direction: 'out', text: 'buenas', fromAi: true, timestamp: t0 + 30 });

    const a = await analytics.getAnalytics(30);
    expect(a.revenue).toBe(100);
    expect(a.cogs).toBe(40);
    expect(a.expenses).toBe(15);
    expect(a.netProfit).toBe(45); // netSales 100 - cogs 40 - expenses 15
    expect(a.topProducts[0]).toEqual({ name: 'Polo azul', qty: 3, revenue: 60 });
    expect(a.salesByMethod[0].method).toBe('cash');
    expect(a.chargesCreated).toBe(2);
    expect(a.chargesPaid).toBe(1);
    expect(a.conversionPct).toBe(50);
    expect(a.topSearches[0]).toEqual({ query: 'polo azul', count: 2 });
    expect(a.medianResponseSeconds).toBe(30);
    expect(a.revenueByDay.reduce((s, d) => s + d.amount, 0)).toBe(100);
  });

  it('returns nulls/zeros with no data', async () => {
    const a = await analytics.getAnalytics(7);
    expect(a.revenue).toBe(0);
    expect(a.conversionPct).toBeNull();
    expect(a.medianResponseSeconds).toBeNull();
    expect(a.topSearches).toEqual([]);
  });

  describe('origin split', () => {
    const seedTwoChannels = async () => {
      await db.none(`INSERT INTO sales (business_id, channel, total, subtotal, net, cost_total, payment_method, status) VALUES (1,'pos',100,100,100,40,'cash','completed')`);
      await db.none(`INSERT INTO sales (business_id, channel, total, subtotal, net, cost_total, payment_method, status) VALUES (1,'whatsapp',60,60,60,0,'yape','completed')`);
    };

    it('reports every channel and lets one be isolated', async () => {
      await seedTwoChannels();
      const all = await analytics.getAnalytics(30);
      expect(all.revenue).toBe(160);
      expect(all.channel).toBe('all');
      expect(all.salesByChannel.find((c) => c.channel === 'pos')!.total).toBe(100);
      expect(all.salesByChannel.find((c) => c.channel === 'whatsapp')!.total).toBe(60);

      const pos = await analytics.getAnalytics(30, { channel: 'pos' });
      expect(pos.revenue).toBe(100);
      expect(pos.channel).toBe('pos');
      // The split card itself stays unfiltered — it's what shows the comparison.
      expect(pos.salesByChannel).toHaveLength(2);
    });

    it('counts sales with no products as lineless', async () => {
      await seedTwoChannels();
      const a = await analytics.getAnalytics(30);
      expect(a.linelessSales).toBe(2); // neither seeded sale has line items
    });
  });

  // Merchandise bought on a recepción is cash out today, but the same soles are
  // already subtracted as COGS when the goods sell. Counting both halves the
  // shopkeeper's apparent profit for no reason.
  it('keeps merchandise purchases out of netProfit but still reports them', async () => {
    await db.none(`INSERT INTO sales (business_id, total, subtotal, net, cost_total, payment_method, status) VALUES (1,100,100,100,40,'cash','completed')`);
    await db.none(`INSERT INTO cash_movements (business_id, kind, amount, category) VALUES (1,'expense',15,'Agua')`);
    await db.none(`INSERT INTO cash_movements (business_id, kind, amount, category) VALUES (1,'expense',200,$1)`, [analytics.PURCHASE_CATEGORY]);

    const a = await analytics.getAnalytics(30);
    expect(a.expenses).toBe(215);  // the drawer really did lose 215
    expect(a.purchases).toBe(200);
    expect(a.netProfit).toBe(45);  // 100 − 40 − (215 − 200)
  });
});
