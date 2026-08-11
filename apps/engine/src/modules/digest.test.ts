import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The daily close is the one place most shopkeepers actually read their numbers,
// so what it says has to be exactly true — including staying quiet about things
// that didn't happen.

let schema: string;
let db: typeof import('../db/index.js');
let digest: typeof import('./digest.js');
let ledger: typeof import('./ledger.js');
let sales: typeof import('./sales.js');
let inventory: typeof import('./inventory.js');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  digest = await import('./digest.js');
  ledger = await import('./ledger.js');
  sales = await import('./sales.js');
  inventory = await import('./inventory.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM cash_sessions');
  await db.none('DELETE FROM cash_movements');
  await db.none('DELETE FROM sale_items');
  await db.none('DELETE FROM sales');
  await db.none('DELETE FROM stock_movements');
  await db.none('DELETE FROM stock_entry_items');
  await db.none('DELETE FROM stock_entries');
  await db.none('DELETE FROM products');
  await db.none("DELETE FROM settings WHERE key = 'inventory_low_stock_threshold'");
});

const cashSale = (amount: number) =>
  sales.createSale({ items: [{ productId: null, name: 'Serv', qty: 1, unitPrice: amount }], paymentMethod: 'cash' });

describe('composeDigest — caja', () => {
  it('says nothing about the apertura when the caja was never opened', async () => {
    await cashSale(20);
    const d = await digest.composeDigest(today());
    expect(d.text).not.toContain('Inicio de caja');
    expect(d.text).not.toContain('Conteo');
    expect(d.text).toContain('Efectivo en caja: *S/ 20.00*');
  });

  it('reports the opening float once the caja is open', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await cashSale(20);
    const d = await digest.composeDigest(today());
    expect(d.text).toContain('Inicio de caja: S/ 50.00');
    expect(d.text).toContain('Efectivo en caja: *S/ 70.00*');
  });

  it('reports a shortfall after a close that did not cuadrar', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await cashSale(20);
    await ledger.closeCashDay({ day: today(), counted: 65 });
    const d = await digest.composeDigest(today());
    expect(d.text).toContain('Efectivo en caja (esperado)');
    expect(d.text).toContain('Conteo: S/ 65.00');
    expect(d.text).toContain('falta S/ 5.00');
  });

  it('says cuadrado when the count matches', async () => {
    await ledger.openCashDay({ day: today(), amount: 10 });
    await ledger.closeCashDay({ day: today(), counted: 10 });
    expect((await digest.composeDigest(today())).text).toContain('cuadrado');
  });
});

describe('composeDigest — inventario', () => {
  it('respects the configured low-stock threshold', async () => {
    await db.none(`INSERT INTO products (business_id, name, price, stock, track_stock) VALUES (1,'Poco',5,2,1)`);
    await db.none(`INSERT INTO products (business_id, name, price, stock, track_stock) VALUES (1,'Medio',5,6,1)`);

    let d = await digest.composeDigest(today());
    expect(d.text).toContain('Poco (2)');
    expect(d.text).not.toContain('Medio');

    await db.setSetting('inventory_low_stock_threshold', '10');
    d = await digest.composeDigest(today());
    expect(d.text).toContain('Medio (6)');
  });

  it('reports the day\'s recepciones', async () => {
    const p = (await db.one<{ id: number }>(
      `INSERT INTO products (business_id, name, price, stock, track_stock) VALUES (1,'A',5,0,1) RETURNING id`,
    ))!;
    await inventory.createStockEntry({ supplier: 'Prov', items: [{ productId: p.id, qty: 10, unitCost: 3 }] });
    const d = await digest.composeDigest(today());
    expect(d.text).toContain('Entradas de hoy: 1 recepción (S/ 30.00)');
  });

  it('does not double-subtract a purchase from the day\'s profit', async () => {
    const p = (await db.one<{ id: number }>(
      `INSERT INTO products (business_id, name, price, cost, stock, track_stock) VALUES (1,'A',10,3,0,1) RETURNING id`,
    ))!;
    await inventory.createStockEntry({ postExpense: true, items: [{ productId: p.id, qty: 10, unitCost: 3 }] });
    await sales.createSale({ items: [{ productId: p.id, name: 'A', qty: 2, unitPrice: 10, unitCost: 3 }], paymentMethod: 'cash' });

    const d = await digest.composeDigest(today());
    // net 20 − cost 6 − (gastos 30 − compras 30) = 14
    expect(d.text).toContain('Ganancia (neto − costo − gastos): *S/ 14.00*');
    // …but the cash really did leave the drawer: 20 in sales − 30 spent.
    expect(d.text).toContain('Gastos: −S/ 30.00');
  });
});
