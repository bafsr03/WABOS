import type { PoolClient } from 'pg';
import { one, many, pool } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { recordEvent } from './analytics.js';
import { getSalesSettings, dayExpr } from './sales.js';

// The cash ledger: non-sale money movements (daily expenses like water/transport,
// and extra income). Sales live in `sales` and are never mirrored here, so the two
// never double-count. The day's cash position unions cash sales with these.
//
// On top of it sits the cash session: "con cuánto se inicia en efectivo" each day.
// Without it the drawer silently assumed it started empty every morning, so
// whatever was carried over from yesterday simply didn't exist.

const round2 = (n: number) => Math.round(n * 100) / 100;

// The calendar day before a YYYY-MM-DD label. Pure date arithmetic on the label
// itself — no timezone involved, the label is already local.
function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface CashMovement {
  id: number;
  kind: 'expense' | 'income' | 'adjustment';
  amount: number;
  method: string;
  category: string;
  note: string;
  created_by: string;
  sold_at: number;
  created_at: number;
}

export async function addCashMovement(input: {
  kind: 'expense' | 'income' | 'adjustment';
  amount: number;
  method?: string;
  category?: string;
  note?: string;
  createdBy?: string;
}, client?: PoolClient): Promise<CashMovement> {
  const run = client ? client.query.bind(client) : pool.query.bind(pool);
  const row = (await run(
    `INSERT INTO cash_movements (business_id, kind, amount, method, category, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [currentBusinessId(), input.kind, Math.abs(input.amount), input.method ?? 'cash',
     input.category ?? '', input.note ?? '', input.createdBy ?? 'dashboard'],
  )).rows[0] as CashMovement;
  if (input.kind === 'expense') recordEvent('expense.recorded', { amount: row.amount, meta: { category: row.category } });
  return row;
}

export async function listCashMovements(day: string): Promise<CashMovement[]> {
  const { timezone } = await getSalesSettings();
  return many<CashMovement>(
    `SELECT * FROM cash_movements
     WHERE business_id = $1 AND ${dayExpr('sold_at', timezone)} = $2
     ORDER BY sold_at DESC`,
    [currentBusinessId(), day],
  );
}

export interface CashPosition {
  day: string;
  opening: number;      // what the drawer started the day with (0 when never opened)
  hasSession: boolean;
  status: 'none' | 'open' | 'closed';
  cashSales: number;    // sales paid in cash
  income: number;       // extra income movements
  expenses: number;     // expense movements
  adjustments: number;  // signed net of adjustments (kept as income-positive)
  net: number;          // opening + cashSales + income - expenses + adjustments
  counted: number | null;    // what was physically counted at close
  expected: number | null;   // what we expected at close — frozen at that moment
  difference: number | null; // counted - expected: positive sobra, negative falta
}

// The cash in the drawer for a day: what it opened with, plus cash sales and
// extra income, minus expenses (+/- adjustments).
// Note the backward-compatible shape: with no session row `opening` is 0, so
// `net` is exactly what it was before cash sessions existed. A business that
// never opens a caja keeps its old numbers by construction, not by a flag.
export async function getCashPosition(day: string): Promise<CashPosition> {
  const biz = currentBusinessId();
  const session = await getCashSession(day);
  const { timezone } = await getSalesSettings();
  const cashRow = await one<{ total: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS total FROM sales s
     WHERE s.business_id = $1 AND s.status = 'completed' AND s.payment_method = 'cash'
       AND ${dayExpr('s.sold_at', timezone)} = $2`,
    [biz, day],
  );
  const mov = await one<{ income: number; expenses: number; adjustments: number }>(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='income'),0)::float8 AS income,
            COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0)::float8 AS expenses,
            COALESCE(SUM(amount) FILTER (WHERE kind='adjustment'),0)::float8 AS adjustments
     FROM cash_movements WHERE business_id = $1 AND ${dayExpr('sold_at', timezone)} = $2`,
    [biz, day],
  );
  const cashSales = cashRow?.total ?? 0;
  const income = mov?.income ?? 0;
  const expenses = mov?.expenses ?? 0;
  const adjustments = mov?.adjustments ?? 0;
  const opening = session?.opening_amount ?? 0;
  return {
    day, opening,
    hasSession: session !== null,
    status: session ? session.status : 'none',
    cashSales, income, expenses, adjustments,
    net: round2(opening + cashSales + income - expenses + adjustments),
    counted: session?.closing_counted ?? null,
    expected: session?.expected_closing ?? null,
    difference: session?.difference ?? null,
  };
}

// ---- the cash day: apertura / cierre ----------------------------------------

export interface CashSession {
  id: number;
  day: string;
  status: 'open' | 'closed';
  opening_amount: number;
  opened_at: number;
  opened_by: string;
  closing_counted: number | null;
  expected_closing: number | null;
  difference: number | null;
  closed_at: number | null;
  closed_by: string | null;
  note: string;
}

export async function getCashSession(day: string): Promise<CashSession | null> {
  return (await one<CashSession>(
    'SELECT * FROM cash_sessions WHERE business_id = $1 AND day = $2',
    [currentBusinessId(), day],
  )) ?? null;
}

// What to prefill the apertura with: yesterday's counted close if it was closed,
// otherwise yesterday's computed cash. Exactly one day back — a shop that skipped
// a week should get 0 and count for itself, not a number invented from old data.
export async function suggestOpeningAmount(day: string): Promise<number> {
  const yesterday = previousDay(day);
  const prev = await getCashSession(yesterday);
  if (prev?.status === 'closed' && prev.closing_counted != null) return round2(prev.closing_counted);
  const position = await getCashPosition(yesterday);
  return Math.max(0, round2(position.net));
}

export async function openCashDay(input: { day: string; amount: number; createdBy?: string }):
  Promise<{ ok: true; session: CashSession } | { ok: false; error: string }> {
  const existing = await getCashSession(input.day);
  if (existing?.status === 'closed') {
    return { ok: false, error: 'La caja de ese día ya fue cerrada. Reábrela para cambiar el inicio.' };
  }
  const session = (await one<CashSession>(
    `INSERT INTO cash_sessions (business_id, day, opening_amount, opened_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (business_id, day) DO UPDATE
       SET opening_amount = EXCLUDED.opening_amount, opened_by = EXCLUDED.opened_by
     RETURNING *`,
    [currentBusinessId(), input.day, Math.max(0, round2(input.amount)), input.createdBy ?? 'dashboard'],
  ))!;
  return { ok: true, session };
}

// Close the day against a physical count. `expected` and `difference` are frozen
// here on purpose: a sale recorded later must not retroactively rewrite what the
// descuadre was when somebody actually counted the drawer.
export async function closeCashDay(input: { day: string; counted: number; note?: string; createdBy?: string }):
  Promise<{ ok: true; session: CashSession } | { ok: false; error: string }> {
  const existing = await getCashSession(input.day);
  if (!existing) return { ok: false, error: 'Primero abre la caja de ese día' };
  if (existing.status === 'closed') return { ok: false, error: 'La caja de ese día ya está cerrada' };

  const expected = (await getCashPosition(input.day)).net;
  const counted = round2(input.counted);
  const session = (await one<CashSession>(
    `UPDATE cash_sessions
        SET status = 'closed', closing_counted = $1, expected_closing = $2, difference = $3,
            closed_at = extract(epoch from now())::bigint, closed_by = $4, note = $5
      WHERE business_id = $6 AND day = $7 RETURNING *`,
    [counted, expected, round2(counted - expected), input.createdBy ?? 'dashboard',
     input.note ?? '', currentBusinessId(), input.day],
  ))!;
  return { ok: true, session };
}

// Reopen a closed day. The previous snapshot is cleared — once the day is live
// again, a stale "esperado" from an earlier close would only mislead.
export async function reopenCashDay(day: string): Promise<{ ok: boolean; error?: string }> {
  const existing = await getCashSession(day);
  if (!existing) return { ok: false, error: 'Esa caja no existe' };
  if (existing.status === 'open') return { ok: false, error: 'La caja ya está abierta' };
  await one(
    `UPDATE cash_sessions
        SET status = 'open', closing_counted = NULL, expected_closing = NULL,
            difference = NULL, closed_at = NULL, closed_by = NULL
      WHERE business_id = $1 AND day = $2 RETURNING id`,
    [currentBusinessId(), day],
  );
  return { ok: true };
}
