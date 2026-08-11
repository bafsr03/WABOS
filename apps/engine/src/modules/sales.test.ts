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
  await db.none('DELETE FROM stock_movements');
  await db.none('DELETE FROM stock_entry_items');
  await db.none('DELETE FROM stock_entries');
  await db.none('DELETE FROM cash_sessions');
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

  it('logs exactly one stock movement per tracked line, tagged to the sale', async () => {
    const p = (await newProduct())!;
    const sale = await sales.createSale({
      items: [{ productId: p.id, name: p.name, qty: 2, unitPrice: 10, unitCost: 4 }],
      paymentMethod: 'cash',
    });
    const moves = await db.many<any>('SELECT * FROM stock_movements');
    expect(moves).toHaveLength(1);
    expect(moves[0].kind).toBe('sale');
    expect(moves[0].origin).toBe('pos');
    expect(moves[0].qty_delta).toBe(-2);
    expect(moves[0].stock_after).toBe(18);
    expect(moves[0].ref_type).toBe('sale');
    expect(Number(moves[0].ref_id)).toBe(Number(sale.id));
    expect(moves[0].product_name).toBe(p.name);
  });

  it('logs nothing for ad-hoc lines or untracked products', async () => {
    const untracked = (await newProduct({ track: 0 }))!;
    await sales.createSale({
      items: [
        { productId: null, name: 'Servicio', qty: 1, unitPrice: 30 },
        { productId: untracked.id, name: untracked.name, qty: 1, unitPrice: 10 },
      ],
      paymentMethod: 'cash',
    });
    expect(await db.many('SELECT * FROM stock_movements')).toHaveLength(0);
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

  it('mirrors the sale movement with a void movement', async () => {
    const p = (await newProduct())!;
    const sale = await sales.createSale({ items: [{ productId: p.id, name: p.name, qty: 3, unitPrice: 10, unitCost: 4 }], paymentMethod: 'cash' });
    await sales.voidSale(sale.id);
    const moves = await db.many<any>('SELECT * FROM stock_movements ORDER BY id');
    expect(moves).toHaveLength(2);
    expect(moves[1].kind).toBe('void');
    expect(moves[1].qty_delta).toBe(3);
    expect(moves[1].stock_after).toBe(20);
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

  // A charge knows an amount, not what was sold. This asserts the gap on purpose:
  // a WhatsApp sale carries no line items and moves no stock. Do NOT "fix" this by
  // guessing products — the honest fix is attachSaleItems, tested below.
  it('records no line items and no stock movement (known gap)', async () => {
    const contact = await store.upsertContactByJid('51999000009@s.whatsapp.net', 'Cli');
    const charge = (await db.one<{ id: number }>(
      `INSERT INTO charges (business_id, contact_id, amount, currency, concept) VALUES (1,$1,50,'PEN','x') RETURNING id`,
      [contact.id],
    ))!;
    await sales.createSaleFromCharge(charge.id, 'yape');
    const sale = (await db.one<{ id: number }>('SELECT id FROM sales WHERE charge_id = $1', [charge.id]))!;
    expect(await db.many('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id])).toHaveLength(0);
    expect(await db.many('SELECT * FROM stock_movements')).toHaveLength(0);
  });
});

describe('attachSaleItems', () => {
  const linelessSale = async () => {
    const contact = await store.upsertContactByJid('51999000010@s.whatsapp.net', 'Cli');
    const charge = (await db.one<{ id: number }>(
      `INSERT INTO charges (business_id, contact_id, amount, currency, concept) VALUES (1,$1,50,'PEN','x') RETURNING id`,
      [contact.id],
    ))!;
    await sales.createSaleFromCharge(charge.id, 'yape');
    return (await db.one<{ id: number }>('SELECT id FROM sales WHERE charge_id = $1', [charge.id]))!;
  };

  it('attaches items, recomputes cost and discounts stock as the AI', async () => {
    const p = (await newProduct())!;
    const sale = await linelessSale();
    const res = await sales.attachSaleItems(sale.id, [{ productId: p.id, name: p.name, qty: 2, unitPrice: 25, unitCost: 4 }]);
    expect(res.ok).toBe(true);

    expect((await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!.stock).toBe(18);
    expect((await db.one<{ cost_total: number }>('SELECT cost_total FROM sales WHERE id=$1', [sale.id]))!.cost_total).toBe(8);
    const moves = await db.many<any>('SELECT * FROM stock_movements');
    expect(moves).toHaveLength(1);
    expect(moves[0].origin).toBe('ai');
    expect(moves[0].kind).toBe('sale');
  });

  it('refuses a second assignment so stock is never double-discounted', async () => {
    const p = (await newProduct())!;
    const sale = await linelessSale();
    await sales.attachSaleItems(sale.id, [{ productId: p.id, name: p.name, qty: 2, unitPrice: 25, unitCost: 4 }]);
    const again = await sales.attachSaleItems(sale.id, [{ productId: p.id, name: p.name, qty: 2, unitPrice: 25, unitCost: 4 }]);
    expect(again.ok).toBe(false);
    expect((await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [p.id]))!.stock).toBe(18);
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
