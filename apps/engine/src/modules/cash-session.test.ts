import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { useTempSchema, dropTempSchema } from '../test-helpers/tempSchema.js';

// The cash day. The drawer used to assume it started empty every morning; now it
// starts with what the shopkeeper counted, and the close freezes the descuadre so
// a later sale can't rewrite history.

let schema: string;
let db: typeof import('../db/index.js');
let ledger: typeof import('./ledger.js');
let sales: typeof import('./sales.js');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const dayBefore = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  schema = await useTempSchema();
  db = await import('../db/index.js');
  await db.initDb();
  ledger = await import('./ledger.js');
  sales = await import('./sales.js');
});

afterAll(async () => { await db.pool.end(); await dropTempSchema(schema); });

beforeEach(async () => {
  await db.none('DELETE FROM cash_sessions');
  await db.none('DELETE FROM cash_movements');
  await db.none('DELETE FROM sale_items');
  await db.none('DELETE FROM sales');
  await db.none('DELETE FROM stock_movements');
  await db.none('DELETE FROM products');
});

const cashSale = (amount: number) =>
  sales.createSale({ items: [{ productId: null, name: 'Serv', qty: 1, unitPrice: amount }], paymentMethod: 'cash' });

describe('getCashPosition without a session', () => {
  // The non-regression assertion: a business that never opens a caja must see
  // exactly the numbers it saw before cash sessions existed.
  it('behaves exactly as before: opening 0, net unchanged', async () => {
    await cashSale(20);
    await ledger.addCashMovement({ kind: 'income', amount: 30 });
    await ledger.addCashMovement({ kind: 'expense', amount: 5 });

    const pos = await ledger.getCashPosition(today());
    expect(pos.hasSession).toBe(false);
    expect(pos.status).toBe('none');
    expect(pos.opening).toBe(0);
    expect(pos.net).toBe(45); // 20 cash + 30 income − 5 expense
    expect(pos.counted).toBeNull();
    expect(pos.difference).toBeNull();
  });
});

describe('openCashDay', () => {
  it('adds the opening float to the drawer', async () => {
    await cashSale(20);
    const before = await ledger.getCashPosition(today());
    await ledger.openCashDay({ day: today(), amount: 50 });
    const after = await ledger.getCashPosition(today());
    expect(after.hasSession).toBe(true);
    expect(after.status).toBe('open');
    expect(after.opening).toBe(50);
    expect(after.net).toBe(before.net + 50);
  });

  it('is idempotent per day: a second open corrects the amount', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await ledger.openCashDay({ day: today(), amount: 80 });
    expect(await db.many('SELECT * FROM cash_sessions')).toHaveLength(1);
    expect((await ledger.getCashSession(today()))!.opening_amount).toBe(80);
  });

  it('refuses to reopen a closed day implicitly', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await ledger.closeCashDay({ day: today(), counted: 50 });
    const res = await ledger.openCashDay({ day: today(), amount: 90 });
    expect(res.ok).toBe(false);
  });
});

describe('closeCashDay', () => {
  it('computes the descuadre against what was expected', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await cashSale(20);
    const res = await ledger.closeCashDay({ day: today(), counted: 65 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.session.expected_closing).toBe(70); // 50 + 20
    expect(res.session.closing_counted).toBe(65);
    expect(res.session.difference).toBe(-5); // falta 5
  });

  // The point of snapshotting: somebody counted the drawer at a moment in time,
  // and a sale rung up afterwards must not retroactively change what they found.
  it('freezes expected/difference against later sales', async () => {
    await ledger.openCashDay({ day: today(), amount: 50 });
    await cashSale(20);
    await ledger.closeCashDay({ day: today(), counted: 70 });

    await cashSale(100); // rung up after the close

    const pos = await ledger.getCashPosition(today());
    expect(pos.expected).toBe(70);   // snapshot, not recomputed
    expect(pos.difference).toBe(0);
    expect(pos.net).toBe(170);       // the live drawer did move
  });

  it('refuses to close a day that was never opened', async () => {
    const res = await ledger.closeCashDay({ day: today(), counted: 10 });
    expect(res.ok).toBe(false);
  });

  it('refuses to close twice', async () => {
    await ledger.openCashDay({ day: today(), amount: 10 });
    await ledger.closeCashDay({ day: today(), counted: 10 });
    expect((await ledger.closeCashDay({ day: today(), counted: 20 })).ok).toBe(false);
  });
});

describe('reopenCashDay', () => {
  it('clears the stale snapshot so a new count starts honest', async () => {
    await ledger.openCashDay({ day: today(), amount: 10 });
    await ledger.closeCashDay({ day: today(), counted: 4 });
    expect((await ledger.reopenCashDay(today())).ok).toBe(true);
    const pos = await ledger.getCashPosition(today());
    expect(pos.status).toBe('open');
    expect(pos.counted).toBeNull();
    expect(pos.difference).toBeNull();
  });
});

describe('suggestOpeningAmount', () => {
  it('uses yesterday\'s counted close when there is one', async () => {
    const y = dayBefore(today());
    await ledger.openCashDay({ day: y, amount: 0 });
    await ledger.closeCashDay({ day: y, counted: 120 });
    expect(await ledger.suggestOpeningAmount(today())).toBe(120);
  });

  it('falls back to yesterday\'s computed cash when it was never closed', async () => {
    const y = dayBefore(today());
    await db.none(
      `INSERT INTO cash_movements (business_id, kind, amount, sold_at)
       VALUES (1,'income',75, extract(epoch from now())::bigint - 86400)`,
    );
    expect(await ledger.suggestOpeningAmount(today())).toBe(75);
    expect(y).toBeTruthy();
  });

  it('suggests nothing when there is no yesterday to speak of', async () => {
    expect(await ledger.suggestOpeningAmount(today())).toBe(0);
  });
});
