import { one, many } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { recordEvent } from './analytics.js';
import { getSalesSettings, dayExpr } from './sales.js';

// The cash ledger: non-sale money movements (daily expenses like water/transport,
// and extra income). Sales live in `sales` and are never mirrored here, so the two
// never double-count. The day's cash position unions cash sales with these.

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
}): Promise<CashMovement> {
  const row = (await one<CashMovement>(
    `INSERT INTO cash_movements (business_id, kind, amount, method, category, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [currentBusinessId(), input.kind, Math.abs(input.amount), input.method ?? 'cash',
     input.category ?? '', input.note ?? '', input.createdBy ?? 'dashboard'],
  ))!;
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
  cashSales: number;    // sales paid in cash
  income: number;       // extra income movements
  expenses: number;     // expense movements
  adjustments: number;  // signed net of adjustments (kept as income-positive)
  net: number;          // cashSales + income - expenses + adjustments
}

// The cash in the drawer for a day: cash sales + extra income - expenses (+/- adjustments).
export async function getCashPosition(day: string): Promise<CashPosition> {
  const biz = currentBusinessId();
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
  return {
    day, cashSales, income, expenses, adjustments,
    net: Math.round((cashSales + income - expenses + adjustments) * 100) / 100,
  };
}
