import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The data-layer split is the exact logic behind the change-number flow that once
// wiped live business data. These tests lock down what survives vs. what clears.
// Everything runs as the default business (id 1).

let schema: string;
let db: typeof import('../db/index.js');
let store: typeof import('./store.js');
let reset: typeof import('./reset.js');

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  store = await import('./store.js');
  reset = await import('./reset.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  // Reset to a clean brand+connection state before each case.
  await reset.wipeAllData();
});

async function seed() {
  const contact = await store.upsertContactByJid('51999@s.whatsapp.net', 'Ana'); // brand/CRM
  const convo = await store.getOrCreateConversation(contact.id);                 // connection
  await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'hola' }); // connection
  await db.none("INSERT INTO products (name, price, currency) VALUES ('Polo', 50, 'PEN')"); // brand
  await db.none("INSERT INTO faqs (question, answer) VALUES ('Horario?', '9-6')");          // brand
  await db.none("INSERT INTO tags (name) VALUES ('interesado')");                            // brand/CRM
  await db.none("INSERT INTO broadcasts (name, message, total) VALUES ('promo', 'hola', 1)"); // connection
  await db.none("INSERT INTO jobs (type, payload) VALUES ('broadcast.send', '{}')");          // connection
  await db.setSetting('business_name', 'STAND 120'); // brand setting — must survive
  await db.setSetting('history_full_sync', '1');     // connection-transient — must reset to '0'
  return { contactId: contact.id };
}

const count = async (table: string) =>
  (await db.one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`))!.n;

describe('clearConnectionData', () => {
  it('clears connection tables but keeps brand + CRM, and resets the full-sync flag', async () => {
    await seed();
    await reset.clearConnectionData();

    expect(await count('messages')).toBe(0);
    expect(await count('conversations')).toBe(0);
    expect(await count('broadcasts')).toBe(0);
    expect(await count('jobs')).toBe(0);

    expect(await count('products')).toBe(1);
    expect(await count('faqs')).toBe(1);
    expect(await count('contacts')).toBe(1);
    expect(await count('tags')).toBe(1);
    expect(await db.getSetting('business_name', '')).toBe('STAND 120');

    expect(await db.getSetting('history_full_sync', '')).toBe('0');
  });
});

describe('the register layer', () => {
  // Seeds a business that has actually traded: a sale against a charge, a
  // recepción with its cash expense, and a cash session.
  async function seedRegister() {
    const { currentBusinessId } = await import('../context.js');
    const biz = currentBusinessId();
    const contact = await store.upsertContactByJid('51988@s.whatsapp.net', 'Beto');
    const charge = (await db.one<{ id: number }>(
      `INSERT INTO charges (business_id, contact_id, amount, currency, concept) VALUES ($1,$2,50,'PEN','x') RETURNING id`,
      [biz, contact.id],
    ))!;
    const sale = (await db.one<{ id: number }>(
      `INSERT INTO sales (business_id, charge_id, total, subtotal, net, payment_method) VALUES ($1,$2,50,50,50,'yape') RETURNING id`,
      [biz, charge.id],
    ))!;
    await db.none(`INSERT INTO sale_items (sale_id, name, qty, unit_price, line_total) VALUES ($1,'Polo',1,50,50)`, [sale.id]);
    const product = (await db.one<{ id: number }>(
      `INSERT INTO products (business_id, name, price, stock, track_stock) VALUES ($1,'Gorra',20,5,1) RETURNING id`,
      [biz],
    ))!;
    const inventory = await import('./inventory.js');
    await inventory.createStockEntry({ supplier: 'Prov', postExpense: true, items: [{ productId: product.id, qty: 3, unitCost: 8 }] });
    const ledger = await import('./ledger.js');
    await ledger.openCashDay({ day: '2026-01-15', amount: 40 });
  }

  it('survives a number change — revenue and stock history are not connection data', async () => {
    await seedRegister();
    await reset.clearConnectionData();

    expect(await count('sales')).toBe(1);
    expect(await count('sale_items')).toBe(1);
    expect(await count('stock_entries')).toBe(1);
    expect(await count('stock_movements')).toBe(1);
    expect(await count('cash_sessions')).toBe(1);
  });

  it('is wiped by wipeAllData without tripping a foreign key', async () => {
    await seedRegister();
    await reset.wipeAllData();

    expect(await count('sales')).toBe(0);
    expect(await count('sale_items')).toBe(0);
    expect(await count('stock_movements')).toBe(0);
    expect(await count('stock_entry_items')).toBe(0);
    expect(await count('stock_entries')).toBe(0);
    expect(await count('cash_sessions')).toBe(0);
    expect(await count('cash_movements')).toBe(0);
    expect(await count('products')).toBe(0);
  });

  // Regression: sales reference charges and events reference contacts, so a
  // business that had ever sold anything could not be deleted at all.
  it('lets a business that has traded be purged entirely', async () => {
    const biz = (await db.one<{ id: number }>(`INSERT INTO businesses (name) VALUES ('Purgable') RETURNING id`))!;
    const ctx = await import('../context.js');
    await ctx.runWithBusiness(biz.id, async () => {
      await seedRegister();
      await reset.purgeBusiness();
    });
    expect(await db.one('SELECT id FROM businesses WHERE id = $1', [biz.id])).toBeUndefined();
  });
});

describe('reconcileLinkedNumber', () => {
  it('sets account_phone on first link without clearing', async () => {
    await db.setSetting('account_phone', '');
    await db.setSetting('business_name', 'STAND 120');
    await reset.reconcileLinkedNumber('51111');
    expect(await db.getSetting('account_phone', '')).toBe('51111');
    expect(await db.getSetting('business_name', '')).toBe('STAND 120'); // untouched
  });

  it('is a no-op when the same number reconnects (keeps connection data)', async () => {
    await db.setSetting('account_phone', '51111');
    const convo = await store.getOrCreateConversation((await store.upsertContactByJid('51222@s.whatsapp.net')).id);
    await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'again' });
    const before = await count('messages');

    await reset.reconcileLinkedNumber('51111');

    expect(await count('messages')).toBe(before); // nothing cleared
    expect(await db.getSetting('account_phone', '')).toBe('51111');
  });

  it('clears the connection layer when a different number links', async () => {
    await db.setSetting('account_phone', '51111');
    const convo = await store.getOrCreateConversation((await store.upsertContactByJid('51222@s.whatsapp.net')).id);
    await store.insertMessage({ conversationId: convo.id, direction: 'in', text: 'again' });
    expect(await count('messages')).toBeGreaterThan(0);

    await reset.reconcileLinkedNumber('51999'); // different number

    expect(await count('messages')).toBe(0);            // connection cleared
    expect(await db.getSetting('account_phone', '')).toBe('51999'); // anchor updated
    expect(await count('contacts')).toBeGreaterThan(0); // CRM kept
  });
});
