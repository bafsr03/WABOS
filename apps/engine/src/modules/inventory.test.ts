import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// Inventory history: adjustStock is the only door into products.stock, and every
// pass through it leaves a movement. Receiving merchandise raises stock, remembers
// what it cost, and can post the money side to Caja.

let schema: string;
let db: typeof import('../db/index.js');
let inventory: typeof import('./inventory.js');
let ledger: typeof import('./ledger.js');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  inventory = await import('./inventory.js');
  ledger = await import('./ledger.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM stock_movements');
  await db.none('DELETE FROM stock_entry_items');
  await db.none('DELETE FROM stock_entries');
  await db.none('DELETE FROM cash_movements');
  await db.none('DELETE FROM cash_sessions');
  await db.none('DELETE FROM sale_items');
  await db.none('DELETE FROM sales');
  await db.none('DELETE FROM products');
  await db.none("DELETE FROM settings WHERE key = 'inventory_low_stock_threshold'");
});

const newProduct = (over: Partial<{ name: string; price: number; cost: number; stock: number; track: number }> = {}) =>
  db.one<{ id: number; name: string; stock: number; cost: number; track_stock: number }>(
    `INSERT INTO products (business_id, name, price, cost, stock, track_stock) VALUES (1,$1,$2,$3,$4,$5) RETURNING *`,
    [over.name ?? 'Widget', over.price ?? 10, over.cost ?? 4, over.stock ?? 20, over.track ?? 1],
  );

const stockOf = async (id: number) =>
  (await db.one<{ stock: number }>('SELECT stock FROM products WHERE id=$1', [id]))!.stock;

describe('adjustStock', () => {
  it('moves stock and records one movement', async () => {
    const p = (await newProduct())!;
    const res = await inventory.adjustStock({ productId: p.id, qtyDelta: -2, kind: 'sale', origin: 'pos' });
    expect(res.tracked).toBe(true);
    expect(res.stockAfter).toBe(18);
    const moves = await db.many<any>('SELECT * FROM stock_movements');
    expect(moves).toHaveLength(1);
    expect(moves[0].qty_delta).toBe(-2);
    expect(moves[0].stock_after).toBe(18);
    expect(moves[0].origin).toBe('pos');
  });

  it('leaves untracked products alone and writes no history', async () => {
    const p = (await newProduct({ track: 0, stock: 5 }))!;
    const res = await inventory.adjustStock({ productId: p.id, qtyDelta: -2, kind: 'sale' });
    expect(res.tracked).toBe(false);
    expect(await stockOf(p.id)).toBe(5);
    expect(await db.many('SELECT * FROM stock_movements')).toHaveLength(0);
  });

  it('derives the delta from an absolute count', async () => {
    const p = (await newProduct({ stock: 20 }))!;
    await inventory.adjustStock({ productId: p.id, setTo: 7, kind: 'count' });
    expect(await stockOf(p.id)).toBe(7);
    const move = (await db.one<any>('SELECT * FROM stock_movements'))!;
    expect(move.qty_delta).toBe(-13);
    expect(move.stock_after).toBe(7);
  });

  it('refuses fractional quantities rather than silently rounding the cache', async () => {
    const p = (await newProduct())!;
    await expect(inventory.adjustStock({ productId: p.id, qtyDelta: -1.5, kind: 'sale' })).rejects.toThrow();
    expect(await stockOf(p.id)).toBe(20);
  });

  it('ignores products from another business', async () => {
    const p = (await db.one<{ id: number }>(
      `INSERT INTO businesses (name) VALUES ('Otro') RETURNING id`,
    ))!;
    const foreign = (await db.one<{ id: number }>(
      `INSERT INTO products (business_id, name, price, stock, track_stock) VALUES ($1,'Ajeno',5,10,1) RETURNING id`,
      [p.id],
    ))!;
    const res = await inventory.adjustStock({ productId: foreign.id, qtyDelta: -1, kind: 'sale' });
    expect(res.tracked).toBe(false);
    expect(await stockOf(foreign.id)).toBe(10);
  });
});

describe('createStockEntry', () => {
  it('raises stock, remembers the unit cost and logs one movement per line', async () => {
    const a = (await newProduct({ name: 'A', stock: 5, cost: 2 }))!;
    const b = (await newProduct({ name: 'B', stock: 0, cost: 1 }))!;
    const entry = await inventory.createStockEntry({
      supplier: 'Distribuidora X',
      items: [
        { productId: a.id, qty: 10, unitCost: 3 },
        { productId: b.id, qty: 4, unitCost: 2.5 },
      ],
    });

    expect(entry.total).toBe(40); // 10×3 + 4×2.5
    expect(await db.many('SELECT * FROM stock_entry_items WHERE entry_id=$1', [entry.id])).toHaveLength(2);
    expect(await stockOf(a.id)).toBe(15);
    expect(await stockOf(b.id)).toBe(4);

    const costA = (await db.one<{ cost: number }>('SELECT cost FROM products WHERE id=$1', [a.id]))!.cost;
    expect(costA).toBe(3); // the entry is what finally makes margin real

    const moves = await db.many<any>('SELECT * FROM stock_movements ORDER BY id');
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.kind === 'entry')).toBe(true);
    expect(moves.every((m) => Number(m.ref_id) === Number(entry.id))).toBe(true);
  });

  it('starts tracking a product that was not tracked before', async () => {
    const p = (await newProduct({ track: 0, stock: 0 }))!;
    await inventory.createStockEntry({ items: [{ productId: p.id, qty: 6, unitCost: 1 }] });
    const row = (await db.one<{ stock: number; track_stock: number }>('SELECT stock, track_stock FROM products WHERE id=$1', [p.id]))!;
    expect(row.track_stock).toBe(1);
    expect(row.stock).toBe(6);
  });

  it('posts exactly one cash expense when asked, and it lands in the day position', async () => {
    const p = (await newProduct())!;
    const entry = await inventory.createStockEntry({
      supplier: 'Prov', postExpense: true,
      items: [{ productId: p.id, qty: 10, unitCost: 3 }],
    });
    const movs = await db.many<any>('SELECT * FROM cash_movements');
    expect(movs).toHaveLength(1);
    expect(movs[0].kind).toBe('expense');
    expect(movs[0].category).toBe(inventory.PURCHASE_CATEGORY);
    expect(movs[0].amount).toBe(30);
    expect(Number(entry.cash_movement_id)).toBe(Number(movs[0].id));
    expect((await ledger.getCashPosition(today())).expenses).toBe(30);
  });

  it('does not touch the cash ledger by default', async () => {
    const p = (await newProduct())!;
    await inventory.createStockEntry({ items: [{ productId: p.id, qty: 10, unitCost: 3 }] });
    expect(await db.many('SELECT * FROM cash_movements')).toHaveLength(0);
  });
});

describe('voidStockEntry', () => {
  it('reverses the stock and compensates the cash instead of deleting it', async () => {
    const p = (await newProduct({ stock: 5 }))!;
    const entry = await inventory.createStockEntry({
      postExpense: true, items: [{ productId: p.id, qty: 10, unitCost: 3 }],
    });
    expect(await stockOf(p.id)).toBe(15);

    const res = await inventory.voidStockEntry(entry.id);
    expect(res.ok).toBe(true);
    expect(await stockOf(p.id)).toBe(5);

    const reversal = (await db.one<any>(`SELECT * FROM stock_movements WHERE kind = 'adjustment'`))!;
    expect(reversal.origin).toBe('system');
    expect(reversal.qty_delta).toBe(-10);

    // The original expense stays; a compensating income cancels it out.
    const movs = await db.many<any>('SELECT * FROM cash_movements ORDER BY id');
    expect(movs).toHaveLength(2);
    expect(movs[1].kind).toBe('income');
    expect(movs[1].amount).toBe(30);
    expect((await ledger.getCashPosition(today())).net).toBe(0);
  });

  it('cannot be applied twice', async () => {
    const p = (await newProduct({ stock: 5 }))!;
    const entry = await inventory.createStockEntry({ items: [{ productId: p.id, qty: 10, unitCost: 3 }] });
    await inventory.voidStockEntry(entry.id);
    const again = await inventory.voidStockEntry(entry.id);
    expect(again.ok).toBe(false);
    expect(await stockOf(p.id)).toBe(5);
  });
});

describe('listStockMovements', () => {
  it('filters by kind and origin', async () => {
    const p = (await newProduct())!;
    await inventory.adjustStock({ productId: p.id, qtyDelta: -1, kind: 'sale', origin: 'pos' });
    await inventory.adjustStock({ productId: p.id, qtyDelta: 5, kind: 'entry', origin: 'dashboard' });
    await inventory.adjustStock({ productId: p.id, qtyDelta: -2, kind: 'sale', origin: 'ai' });

    expect(await inventory.listStockMovements({})).toHaveLength(3);
    expect(await inventory.listStockMovements({ kind: 'sale' })).toHaveLength(2);
    expect(await inventory.listStockMovements({ origin: 'ai' })).toHaveLength(1);
    expect(await inventory.listStockMovements({ kind: 'entry', origin: 'ai' })).toHaveLength(0);
  });
});

describe('low stock + summary', () => {
  it('honours the configurable threshold', async () => {
    await newProduct({ name: 'Poco', stock: 2 });
    await newProduct({ name: 'Medio', stock: 6 });
    await newProduct({ name: 'Harto', stock: 40 });

    expect((await inventory.listLowStock()).map((r) => r.name)).toEqual(['Poco']); // default 3
    await db.setSetting('inventory_low_stock_threshold', '10');
    expect((await inventory.listLowStock()).map((r) => r.name)).toEqual(['Poco', 'Medio']);
  });

  it('values the shelf at cost and at retail', async () => {
    await newProduct({ name: 'A', stock: 10, cost: 2, price: 5 });
    await newProduct({ name: 'B', stock: 3, cost: 1, price: 4 });
    const s = await inventory.getInventorySummary();
    expect(s.tracked).toBe(2);
    expect(s.units).toBe(13);
    expect(s.stockValue).toBe(23);  // 10×2 + 3×1
    expect(s.retailValue).toBe(62); // 10×5 + 3×4
  });
});
