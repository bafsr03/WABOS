import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The register: sales decrement stock and compute exact fees/net; voids restore
// stock; a paid WhatsApp charge becomes exactly one sale (idempotent). Money is
// read back from the tables, so the daily close is truthful.

let schema: string;
let db: typeof import('../db/index.js');
let sales: typeof import('./sales.js');
let ledger: typeof import('./ledger.js');
let store: typeof import('./store.js');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  sales = await import('./sales.js');
  ledger = await import('./ledger.js');
  store = await import('./store.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM sale_items');
  await db.none('DELETE FROM sales');
  await db.none('DELETE FROM cash_movements');
  await db.none('DELETE FROM charges');
  await db.none('DELETE FROM products');
  await db.none('DELETE FROM contacts');
});

const newProduct = (over: Partial<{ price: number; cost: number; stock: number; track: number }> = {}) =>
  db.one<{ id: number; name: string; price: number; cost: number; stock: number }>(
    `INSERT INTO products (business_id, name, price, cost, stock, track_stock) VALUES (1,'Widget',$1,$2,$3,$4) RETURNING *`,
    [over.price ?? 10, over.cost ?? 4, over.stock ?? 20, over.track ?? 1],
  );

describe('createSale', () => {
  it('decrements stock, snapshots cost, and computes fee/net', async () => {
    const p = (await newProduct())!;
    const sale = await sales.createSale({
      items: [{ productId: p.id, name: p.name, qty: 2, unitPrice: 10, unitCost: 4 }],
      paymentMethod: 'cash',
    });
    expect(sale.total).toBe(20);
    expect(sale.fee_amount).toBe(0);
    expect(sale.net).toBe(20);
    expect(sale.cost_total).toBe(8);
    const after = (await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!;
    expect(after.stock).toBe(18);
  });

  it('applies the exact card fee (0.35%)', async () => {
    const sale = await sales.createSale({
      items: [{ productId: null, name: 'Servicio', qty: 1, unitPrice: 100 }],
      paymentMethod: 'card',
    });
    expect(sale.fee_amount).toBe(0.35);
    expect(sale.net).toBe(99.65);
  });

  it('never drives tracked stock negative', async () => {
    const p = (await newProduct({ stock: 1 }))!;
    await sales.createSale({ items: [{ productId: p.id, name: p.name, qty: 5, unitPrice: 10, unitCost: 4 }], paymentMethod: 'cash' });
    const after = (await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!;
    expect(after.stock).toBe(0);
  });
});

describe('voidSale', () => {
  it('restores stock and drops the sale from the day summary', async () => {
    const p = (await newProduct())!;
    const sale = await sales.createSale({ items: [{ productId: p.id, name: p.name, qty: 3, unitPrice: 10, unitCost: 4 }], paymentMethod: 'cash' });
    expect((await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!.stock).toBe(17);
    const res = await sales.voidSale(sale.id);
    expect(res.ok).toBe(true);
    expect((await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!.stock).toBe(20);
    const sum = await sales.getDaySummary(today());
    expect(sum.count).toBe(0);
  });
});

describe('createSaleFromCharge', () => {
  it('creates exactly one whatsapp sale, idempotently', async () => {
    const contact = await store.upsertContactByJid('51999000001@s.whatsapp.net', 'Cli');
    const charge = (await db.one<{ id: number }>(
      `INSERT INTO charges (business_id, contact_id, amount, currency, concept) VALUES (1,$1,50,'PEN','x') RETURNING id`,
      [contact.id],
    ))!;
    await sales.createSaleFromCharge(charge.id, 'plin');
    await sales.createSaleFromCharge(charge.id, 'plin'); // re-verify must not duplicate
    const rows = await db.many<{ channel: string; payment_method: string; total: number; charge_id: number }>('SELECT * FROM sales WHERE charge_id = $1', [charge.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('whatsapp');
    expect(rows[0].payment_method).toBe('plin');
    expect(rows[0].total).toBe(50);
  });
});

describe('getDaySummary + cash position', () => {
  it('unifies revenue by method and computes the cash drawer', async () => {
    const p = (await newProduct())!;
    await sales.createSale({ items: [{ productId: p.id, name: p.name, qty: 2, unitPrice: 10, unitCost: 4 }], paymentMethod: 'cash' }); // 20 cash
    await sales.createSale({ items: [{ productId: null, name: 'Serv', qty: 1, unitPrice: 100 }], paymentMethod: 'card' });             // 100 card, fee .35
    await ledger.addCashMovement({ kind: 'expense', amount: 5, category: 'agua' });
    await ledger.addCashMovement({ kind: 'income', amount: 30 });

    const sum = await sales.getDaySummary(today());
    expect(sum.count).toBe(2);
    expect(sum.gross).toBe(120);
    expect(sum.fees).toBe(0.35);
    expect(sum.net).toBe(119.65);
    expect(sum.byMethod.find((m) => m.method === 'cash')!.total).toBe(20);
    expect(sum.byMethod.find((m) => m.method === 'card')!.total).toBe(100);

    const pos = await ledger.getCashPosition(today());
    expect(pos.cashSales).toBe(20);
    expect(pos.expenses).toBe(5);
    expect(pos.income).toBe(30);
    expect(pos.net).toBe(45); // 20 cash + 30 income - 5 expense
  });
});
