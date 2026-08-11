import type { PoolClient } from 'pg';
import { one, many, none, tx, getAllSettings } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { recordEvent } from './analytics.js';
import { adjustStock } from './inventory.js';
import { logger } from '../logger.js';

// The register: records completed sales (POS, WhatsApp, AI) and reads them back
// for the daily close. Money is stored on the tables (not derived from events) so
// analytics/digests are truthful. Stock is decremented inside the same transaction
// as the sale, and restored on void.

export interface PaymentMethod { id: string; label: string; fee_pct: number }

// Sensible Peru-first defaults. Card carries a small processor fee so nets are exact.
export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'cash', label: 'Efectivo', fee_pct: 0 },
  { id: 'yape', label: 'Yape', fee_pct: 0 },
  { id: 'plin', label: 'Plin', fee_pct: 0 },
  { id: 'card', label: 'Tarjeta', fee_pct: 0.35 },
];
export const DEFAULT_TIMEZONE = 'America/Lima';

export interface SalesSettings {
  paymentMethods: PaymentMethod[];
  timezone: string;
}

export async function getSalesSettings(): Promise<SalesSettings> {
  const s = await getAllSettings();
  let paymentMethods = DEFAULT_PAYMENT_METHODS;
  const raw = s['sales_payment_methods'];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        paymentMethods = parsed.map((m: any) => ({
          id: String(m.id), label: String(m.label ?? m.id), fee_pct: Number(m.fee_pct) || 0,
        }));
      }
    } catch { /* fall back to defaults on malformed JSON */ }
  }
  return { paymentMethods, timezone: s['business_timezone'] || DEFAULT_TIMEZONE };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function feePctFor(methods: PaymentMethod[], id: string): number {
  return methods.find((m) => m.id === id)?.fee_pct ?? 0;
}

export interface SaleItemInput {
  productId?: number | null;
  name: string;
  qty: number;
  unitPrice: number;
  unitCost?: number | null;
}

export interface CreateSaleInput {
  items: SaleItemInput[];
  paymentMethod: string;
  discount?: number;
  note?: string;
  contactId?: number | null;
  channel?: 'pos' | 'whatsapp' | 'ai';
  createdBy?: string;
  currency?: string;
}

export interface Sale {
  id: number;
  contact_id: number | null;
  channel: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  cost_total: number;
  payment_method: string;
  fee_pct: number;
  fee_amount: number;
  net: number;
  currency: string;
  note: string;
  charge_id: number | null;
  created_by: string;
  sold_at: number;
  created_at: number;
}

// Record a full sale (line items + payment) and decrement stock atomically.
export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const businessId = currentBusinessId();
  const { paymentMethods } = await getSalesSettings();
  const feePct = feePctFor(paymentMethods, input.paymentMethod);
  const discount = round2(input.discount ?? 0);

  const items = input.items.map((it) => ({
    ...it,
    qty: it.qty,
    unitPrice: it.unitPrice,
    unitCost: it.unitCost ?? 0,
    lineTotal: round2(it.qty * it.unitPrice),
  }));
  const subtotal = round2(items.reduce((a, it) => a + it.lineTotal, 0));
  const costTotal = round2(items.reduce((a, it) => a + it.qty * (it.unitCost ?? 0), 0));
  const total = round2(Math.max(0, subtotal - discount));
  const feeAmount = round2(total * feePct / 100);
  const net = round2(total - feeAmount);

  const sale = await tx(async (client) => {
    const row = (await client.query<Sale>(
      `INSERT INTO sales (business_id, contact_id, channel, subtotal, discount, total, cost_total,
         payment_method, fee_pct, fee_amount, net, currency, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        businessId, input.contactId ?? null, input.channel ?? 'pos', subtotal, discount, total, costTotal,
        input.paymentMethod, feePct, feeAmount, net, input.currency ?? 'PEN', input.note ?? '', input.createdBy ?? 'dashboard',
      ],
    )).rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [row.id, it.productId ?? null, it.name, it.qty, it.unitPrice, it.unitCost ?? 0, it.lineTotal],
      );
      // Decrement tracked stock and log the movement in the same transaction.
      // Untracked items and ad-hoc lines are left alone (adjustStock no-ops).
      if (it.productId != null) {
        await adjustStock({
          productId: it.productId,
          qtyDelta: -it.qty,
          kind: 'sale',
          origin: input.channel === 'ai' || input.createdBy === 'ai' ? 'ai' : 'pos',
          unitCost: it.unitCost ?? null,
          refType: 'sale',
          refId: row.id,
          createdBy: input.createdBy ?? 'dashboard',
        }, client);
      }
    }
    return row;
  });

  recordEvent('sale.recorded', {
    contactId: sale.contact_id, amount: sale.total,
    meta: { channel: sale.channel, method: sale.payment_method },
  });
  return sale;
}

// Auto-create a lineless sale when a WhatsApp charge is marked paid, so revenue has
// a single source of truth (POS + WhatsApp). Idempotent via the unique charge_id
// index — a re-verify of the same charge inserts nothing.
export async function createSaleFromCharge(chargeId: number, method: string): Promise<void> {
  const charge = await one<{ id: number; contact_id: number; amount: number; currency: string; business_id: number }>(
    'SELECT id, contact_id, amount, currency, business_id FROM charges WHERE id = $1',
    [chargeId],
  );
  if (!charge) return;
  // Map the receipt provider/verification method onto a payment method id.
  const paymentMethod = method === 'plin' ? 'plin' : method === 'card' ? 'card' : 'yape';
  const { paymentMethods } = await getSalesSettings();
  const feePct = feePctFor(paymentMethods, paymentMethod);
  const feeAmount = round2(charge.amount * feePct / 100);
  await none(
    `INSERT INTO sales (business_id, contact_id, channel, subtotal, total, payment_method, fee_pct, fee_amount, net, currency, charge_id, created_by)
     VALUES ($1,$2,'whatsapp',$3,$3,$4,$5,$6,$7,$8,$9,'ai')
     ON CONFLICT (charge_id) WHERE charge_id IS NOT NULL DO NOTHING`,
    [charge.business_id, charge.contact_id, charge.amount, paymentMethod, feePct, feeAmount, round2(charge.amount - feeAmount), charge.currency, chargeId],
  ).catch((err) => logger.warn({ err, chargeId }, 'createSaleFromCharge failed'));
}

// Void a completed sale and restore any stock it decremented.
export async function voidSale(id: number): Promise<{ ok: boolean; error?: string }> {
  const businessId = currentBusinessId();
  const sale = await one<Sale>('SELECT * FROM sales WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!sale) return { ok: false, error: 'Sale not found' };
  if (sale.status !== 'completed') return { ok: false, error: `Sale is ${sale.status}` };
  await tx(async (client) => {
    await client.query(`UPDATE sales SET status = 'void' WHERE id = $1`, [id]);
    const items = (await client.query<{ product_id: number | null; qty: number }>(
      'SELECT product_id, qty FROM sale_items WHERE sale_id = $1', [id],
    )).rows;
    for (const it of items) {
      if (it.product_id != null) {
        await adjustStock({
          productId: it.product_id,
          qtyDelta: it.qty,
          kind: 'void',
          origin: 'dashboard',
          refType: 'sale',
          refId: id,
          note: `Anulación de venta #${id}`,
        }, client);
      }
    }
  });
  return { ok: true };
}

// Hard-delete a sale. Only void sales are removable (completed sales stay so the
// daily close stays truthful); stock was already restored when it was voided, and
// sale_items cascade via ON DELETE CASCADE.
export async function deleteSale(id: number): Promise<{ ok: boolean; error?: string }> {
  const businessId = currentBusinessId();
  const sale = await one<Sale>('SELECT * FROM sales WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!sale) return { ok: false, error: 'Sale not found' };
  if (sale.status !== 'void') return { ok: false, error: 'Only voided sales can be deleted' };
  await none('DELETE FROM sales WHERE id = $1 AND business_id = $2', [id, businessId]);
  return { ok: true };
}

// A local-day predicate: buckets a timestamp column into the business timezone so
// "today" matches the shopkeeper's day, not UTC. tz is validated against the IANA
// list before it reaches SQL (interpolated, so it must never be user-free text).
export const dayExpr = (col: string, tz: string) =>
  `to_char(to_timestamp(${col}) AT TIME ZONE '${tz.replace(/[^A-Za-z0-9_/+-]/g, '')}', 'YYYY-MM-DD')`;

export async function listSales(day: string, opts: { channel?: 'pos' | 'whatsapp' | 'ai' } = {}): Promise<any[]> {
  const { timezone } = await getSalesSettings();
  const params: any[] = [currentBusinessId(), day];
  if (opts.channel) params.push(opts.channel);
  return many(
    `SELECT s.*, c.name AS contact_name,
            COALESCE(json_agg(json_build_object('name', si.name, 'qty', si.qty, 'unit_price', si.unit_price)
              ORDER BY si.id) FILTER (WHERE si.id IS NOT NULL), '[]') AS items
     FROM sales s
     LEFT JOIN contacts c ON c.id = s.contact_id
     LEFT JOIN sale_items si ON si.sale_id = s.id
     WHERE s.business_id = $1 AND ${dayExpr('s.sold_at', timezone)} = $2${opts.channel ? ' AND s.channel = $3' : ''}
     GROUP BY s.id, c.name
     ORDER BY s.sold_at DESC`,
    params,
  );
}

// Attach line items to a sale that has none. WhatsApp/AI charges become lineless
// sales — real revenue, but no products and therefore no stock movement and no
// cost. Rather than guessing what was sold, this lets the shopkeeper say so, and
// only then does the stock come off, tagged as the AI's doing.
export async function attachSaleItems(id: number, items: SaleItemInput[]): Promise<{ ok: boolean; error?: string }> {
  const businessId = currentBusinessId();
  const sale = await one<Sale>('SELECT * FROM sales WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!sale) return { ok: false, error: 'Venta no encontrada' };
  if (sale.status !== 'completed') return { ok: false, error: `La venta está ${sale.status}` };
  const existing = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM sale_items WHERE sale_id = $1', [id]);
  if ((existing?.n ?? 0) > 0) return { ok: false, error: 'Esta venta ya tiene productos asignados' };
  if (items.length === 0) return { ok: false, error: 'Indica al menos un producto' };

  const costTotal = round2(items.reduce((a, it) => a + it.qty * (it.unitCost ?? 0), 0));
  await tx(async (client) => {
    for (const it of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, qty, unit_price, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, it.productId ?? null, it.name, it.qty, it.unitPrice, it.unitCost ?? 0, round2(it.qty * it.unitPrice)],
      );
      if (it.productId != null) {
        await adjustStock({
          productId: it.productId, qtyDelta: -it.qty, kind: 'sale', origin: 'ai',
          unitCost: it.unitCost ?? null, refType: 'sale', refId: id,
          note: 'Productos asignados a una venta por WhatsApp', createdBy: 'dashboard',
        }, client);
      }
    }
    // The sale's money doesn't change — only what it cost us to fulfil it.
    await client.query('UPDATE sales SET cost_total = $1 WHERE id = $2', [costTotal, id]);
  });
  return { ok: true };
}

export interface DaySummary {
  day: string;
  count: number;
  gross: number;      // sum of totals (completed)
  net: number;        // gross - fees
  fees: number;
  cost: number;       // COGS
  margin: number;     // net - cost
  byMethod: { method: string; total: number; net: number; count: number }[];
  byChannel: { channel: string; total: number; net: number; count: number }[];
  linelessCount: number; // sales with no products attached (WhatsApp/AI charges)
}

export async function getDaySummary(day: string, opts: { channel?: 'pos' | 'whatsapp' | 'ai' } = {}): Promise<DaySummary> {
  const biz = currentBusinessId();
  const { timezone } = await getSalesSettings();
  const base = `s.business_id = $1 AND s.status = 'completed' AND ${dayExpr('s.sold_at', timezone)} = $2`;
  const where = base + (opts.channel ? ' AND s.channel = $3' : '');
  const params: any[] = opts.channel ? [biz, day, opts.channel] : [biz, day];
  const totals = await one<{ count: number; gross: number; net: number; fees: number; cost: number }>(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::float8 AS gross,
            COALESCE(SUM(net),0)::float8 AS net, COALESCE(SUM(fee_amount),0)::float8 AS fees,
            COALESCE(SUM(cost_total),0)::float8 AS cost
     FROM sales s WHERE ${where}`,
    params,
  );
  const byMethod = await many<{ method: string; total: number; net: number; count: number }>(
    `SELECT payment_method AS method, COALESCE(SUM(total),0)::float8 AS total,
            COALESCE(SUM(net),0)::float8 AS net, COUNT(*)::int AS count
     FROM sales s WHERE ${where} GROUP BY payment_method ORDER BY total DESC`,
    params,
  );
  // Unfiltered on purpose: this is the split itself, so it shows every origin.
  const byChannel = await many<{ channel: string; total: number; net: number; count: number }>(
    `SELECT channel, COALESCE(SUM(total),0)::float8 AS total,
            COALESCE(SUM(net),0)::float8 AS net, COUNT(*)::int AS count
     FROM sales s WHERE ${base} GROUP BY channel ORDER BY total DESC`,
    [biz, day],
  );
  const lineless = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sales s WHERE ${where}
       AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`,
    params,
  );
  const t = totals ?? { count: 0, gross: 0, net: 0, fees: 0, cost: 0 };
  return {
    day, count: t.count, gross: t.gross, net: t.net, fees: t.fees, cost: t.cost,
    margin: round2(t.net - t.cost), byMethod, byChannel, linelessCount: lineless?.n ?? 0,
  };
}
