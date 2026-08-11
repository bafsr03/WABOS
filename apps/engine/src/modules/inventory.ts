import type { PoolClient } from 'pg';
import { one, many, tx, pool, getAllSettings } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { recordEvent, PURCHASE_CATEGORY } from './analytics.js';
import { dayExpr, getSalesSettings } from './sales.js';

export { PURCHASE_CATEGORY };

// Inventory history. The rule this module establishes: nothing anywhere may run
// `UPDATE products SET stock` again — every change goes through adjustStock(),
// which mutates the cache and appends the movement in the same breath. Before
// this, six code paths moved stock silently and "¿de dónde salió?" had no answer.
//
// kind = what happened, origin = who did it. That pairing is what lets the
// shopkeeper separate his own work from the AI's.

export type StockKind = 'entry' | 'sale' | 'void' | 'adjustment' | 'count' | 'import';
export type StockOrigin = 'dashboard' | 'pos' | 'ai' | 'import' | 'system';
export type StockRefType = 'manual' | 'sale' | 'stock_entry' | 'import' | 'product';

const round2 = (n: number) => Math.round(n * 100) / 100;
const DEFAULT_LOW_STOCK = 3;

// Lets a caller join an in-flight transaction (createSale already runs inside
// tx()) or fly solo. Deliberately not error-swallowing: a sale whose stock
// movement vanished is silent corruption, so a failure here must roll the sale back.
type Q = (text: string, values?: any[]) => Promise<{ rows: any[] }>;
const q = (client?: PoolClient): Q =>
  client ? (t, v) => client.query(t, v) : (t, v) => pool.query(t, v);

export interface StockMovement {
  id: number;
  product_id: number | null;
  product_name: string;
  kind: StockKind;
  origin: StockOrigin;
  qty_delta: number;
  stock_after: number | null;
  unit_cost: number | null;
  ref_type: StockRefType;
  ref_id: number | null;
  note: string;
  created_by: string;
  moved_at: number;
}

export interface LogStockMovementInput {
  productId: number | null;
  productName?: string;
  kind: StockKind;
  origin?: StockOrigin;
  qtyDelta: number;
  stockAfter?: number | null;
  unitCost?: number | null;
  refType?: StockRefType;
  refId?: number | null;
  note?: string;
  createdBy?: string;
  movedAt?: number;
}

// Append a movement without touching products.stock. Only for cases where the
// stock value was established rather than changed (a product created with an
// opening quantity, a CSV insert).
export async function logStockMovement(input: LogStockMovementInput, client?: PoolClient): Promise<number | null> {
  if (input.qtyDelta === 0) return null; // the table rejects no-op rows
  const rows = (await q(client)(
    `INSERT INTO stock_movements
       (business_id, product_id, product_name, kind, origin, qty_delta, stock_after,
        unit_cost, ref_type, ref_id, note, created_by${input.movedAt ? ', moved_at' : ''})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12${input.movedAt ? ',$13' : ''}) RETURNING id`,
    [
      currentBusinessId(), input.productId, input.productName ?? '', input.kind,
      input.origin ?? 'dashboard', input.qtyDelta, input.stockAfter ?? null,
      input.unitCost ?? null, input.refType ?? 'manual', input.refId ?? null,
      input.note ?? '', input.createdBy ?? 'dashboard',
      ...(input.movedAt ? [input.movedAt] : []),
    ],
  )).rows;
  return rows[0]?.id ?? null;
}

export interface AdjustStockInput {
  productId: number;
  qtyDelta?: number;        // signed; sales pass negative
  setTo?: number;           // absolute count; the delta is derived from it
  kind: StockKind;
  origin?: StockOrigin;
  unitCost?: number | null; // recorded on the movement; written to products.cost only for entries
  enableTracking?: boolean; // receiving or counting goods means you're tracking them
  refType?: StockRefType;
  refId?: number | null;
  note?: string;
  createdBy?: string;
  movedAt?: number;
}

export interface AdjustStockResult {
  tracked: boolean;
  stockAfter: number | null;
  movementId: number | null;
}

// The only way stock changes.
export async function adjustStock(input: AdjustStockInput, client?: PoolClient): Promise<AdjustStockResult> {
  const businessId = currentBusinessId();
  const run = q(client);
  const untouched: AdjustStockResult = { tracked: false, stockAfter: null, movementId: null };

  const product = (await run(
    'SELECT id, name, stock, track_stock FROM products WHERE id = $1 AND business_id = $2',
    [input.productId, businessId],
  )).rows[0];
  if (!product) return untouched;

  const willTrack = product.track_stock === 1 || input.enableTracking === true;
  // An untracked product has no stock to move. Logging a movement for one would
  // be a history of imaginary units, which is worse than no history at all.
  if (!willTrack) return untouched;

  const before = product.stock ?? 0;
  const delta = input.setTo !== undefined ? input.setTo - before : (input.qtyDelta ?? 0);

  // products.stock is an integer: a fractional movement would round the cache and
  // desync it from this history. Refuse loudly instead.
  if (!Number.isInteger(delta)) {
    throw Object.assign(new Error('La cantidad debe ser un número entero para productos con inventario'), { code: 'FRACTIONAL_STOCK' });
  }

  const setsCost = input.kind === 'entry' && input.unitCost != null;
  const updated = (await run(
    `UPDATE products
        SET stock = GREATEST(0, COALESCE(stock, 0) + $1),
            track_stock = 1${setsCost ? ', cost = $4' : ''}
      WHERE id = $2 AND business_id = $3
      RETURNING stock`,
    setsCost
      ? [delta, input.productId, businessId, input.unitCost]
      : [delta, input.productId, businessId],
  )).rows[0];
  const stockAfter = updated?.stock ?? null;

  const movementId = await logStockMovement({
    productId: input.productId,
    productName: product.name,
    kind: input.kind,
    origin: input.origin,
    qtyDelta: delta,
    stockAfter,
    unitCost: input.unitCost,
    refType: input.refType,
    refId: input.refId,
    note: input.note,
    createdBy: input.createdBy,
    movedAt: input.movedAt,
  }, client);

  return { tracked: true, stockAfter, movementId };
}

// ---- movement history --------------------------------------------------------

export interface MovementFilter {
  productId?: number;
  kind?: StockKind;
  origin?: StockOrigin;
  from?: string; // YYYY-MM-DD, local business day
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listStockMovements(f: MovementFilter = {}): Promise<StockMovement[]> {
  const { timezone } = await getSalesSettings();
  const params: any[] = [currentBusinessId()];
  const where = ['m.business_id = $1'];
  const add = (clause: string, value: any) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

  if (f.productId !== undefined) add('m.product_id = ?', f.productId);
  if (f.kind) add('m.kind = ?', f.kind);
  if (f.origin) add('m.origin = ?', f.origin);
  if (f.from) add(`${dayExpr('m.moved_at', timezone)} >= ?`, f.from);
  if (f.to) add(`${dayExpr('m.moved_at', timezone)} <= ?`, f.to);

  params.push(Math.min(f.limit ?? 50, 200), f.offset ?? 0);
  return many<StockMovement>(
    `SELECT m.* FROM stock_movements m
      WHERE ${where.join(' AND ')}
      ORDER BY m.moved_at DESC, m.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
}

// ---- low stock ---------------------------------------------------------------

// Was hardcoded at 3 in both the digest and the catalog; now one setting.
export async function getLowStockThreshold(): Promise<number> {
  const raw = (await getAllSettings())['inventory_low_stock_threshold'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LOW_STOCK;
}

export async function listLowStock(threshold?: number): Promise<{ id: number; name: string; stock: number }[]> {
  const limit = threshold ?? (await getLowStockThreshold());
  return many<{ id: number; name: string; stock: number }>(
    `SELECT id, name, COALESCE(stock, 0)::int AS stock FROM products
      WHERE business_id = $1 AND active = 1 AND track_stock = 1 AND COALESCE(stock, 0) <= $2
      ORDER BY stock ASC, name ASC LIMIT 50`,
    [currentBusinessId(), limit],
  );
}

// ---- summary -----------------------------------------------------------------

export interface InventorySummary {
  tracked: number;
  untracked: number;
  units: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;   // Σ stock × cost — what the shelf cost you
  retailValue: number;  // Σ stock × price — what it's worth at the till
  threshold: number;
  linelessSales30d: number; // WhatsApp/AI sales with no line items: they never moved stock
}

export async function getInventorySummary(): Promise<InventorySummary> {
  const biz = currentBusinessId();
  const threshold = await getLowStockThreshold();
  const row = await one<any>(
    `SELECT
       COUNT(*) FILTER (WHERE track_stock = 1)::int AS tracked,
       COUNT(*) FILTER (WHERE track_stock <> 1)::int AS untracked,
       COALESCE(SUM(COALESCE(stock,0)) FILTER (WHERE track_stock = 1), 0)::float8 AS units,
       COUNT(*) FILTER (WHERE track_stock = 1 AND COALESCE(stock,0) <= $2)::int AS low_stock,
       COUNT(*) FILTER (WHERE track_stock = 1 AND COALESCE(stock,0) <= 0)::int AS out_of_stock,
       COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost,0)) FILTER (WHERE track_stock = 1), 0)::float8 AS stock_value,
       COALESCE(SUM(COALESCE(stock,0) * COALESCE(price,0)) FILTER (WHERE track_stock = 1), 0)::float8 AS retail_value
     FROM products WHERE business_id = $1 AND active = 1`,
    [biz, threshold],
  );
  // Sales the AI closed over WhatsApp carry no line items, so they never
  // decremented anything. Counted here so the UI can say so out loud.
  const lineless = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sales s
      WHERE s.business_id = $1 AND s.status = 'completed'
        AND s.sold_at >= extract(epoch from now())::bigint - 30 * 86400
        AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`,
    [biz],
  );
  return {
    tracked: row?.tracked ?? 0,
    untracked: row?.untracked ?? 0,
    units: row?.units ?? 0,
    lowStock: row?.low_stock ?? 0,
    outOfStock: row?.out_of_stock ?? 0,
    stockValue: round2(row?.stock_value ?? 0),
    retailValue: round2(row?.retail_value ?? 0),
    threshold,
    linelessSales30d: lineless?.n ?? 0,
  };
}

// ---- stock entries (recepción de mercadería) ---------------------------------

export interface StockEntryItem {
  id: number;
  product_id: number | null;
  name: string;
  qty: number;
  unit_cost: number;
  line_total: number;
}

export interface StockEntry {
  id: number;
  supplier: string;
  note: string;
  status: 'draft' | 'applied' | 'void';
  total: number;
  currency: string;
  post_expense: number;
  cash_movement_id: number | null;
  created_by: string;
  received_at: number;
}

export interface CreateStockEntryInput {
  supplier?: string;
  note?: string;
  receivedAt?: number;
  postExpense?: boolean;
  items: { productId: number; qty: number; unitCost: number }[];
  createdBy?: string;
}

// Receive merchandise: raise stock, remember what it cost, and leave a trace.
// Optionally posts the total as a cash expense — real money left the drawer today.
// That expense is excluded from netProfit (analytics.ts) because the same soles
// are already counted as COGS when the goods sell; counting both double-subtracts.
export async function createStockEntry(input: CreateStockEntryInput): Promise<StockEntry> {
  const businessId = currentBusinessId();
  if (input.items.length === 0) {
    throw Object.assign(new Error('La recepción no tiene productos'), { code: 'EMPTY_ENTRY' });
  }
  const receivedAt = input.receivedAt ?? Math.floor(Date.now() / 1000);
  const lines = input.items.map((it) => ({ ...it, lineTotal: round2(it.qty * it.unitCost) }));
  const total = round2(lines.reduce((a, l) => a + l.lineTotal, 0));

  const entry = await tx(async (client) => {
    const row = (await client.query<StockEntry>(
      `INSERT INTO stock_entries (business_id, supplier, note, total, post_expense, created_by, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [businessId, input.supplier ?? '', input.note ?? '', total, input.postExpense ? 1 : 0,
       input.createdBy ?? 'dashboard', receivedAt],
    )).rows[0];

    for (const l of lines) {
      const product = (await client.query<{ name: string }>(
        'SELECT name FROM products WHERE id = $1 AND business_id = $2', [l.productId, businessId],
      )).rows[0];
      if (!product) {
        throw Object.assign(new Error(`Producto ${l.productId} no encontrado`), { code: 'PRODUCT_NOT_FOUND' });
      }
      await client.query(
        `INSERT INTO stock_entry_items (entry_id, product_id, name, qty, unit_cost, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.id, l.productId, product.name, l.qty, l.unitCost, l.lineTotal],
      );
      await adjustStock({
        productId: l.productId,
        qtyDelta: l.qty,
        kind: 'entry',
        origin: 'dashboard',
        unitCost: l.unitCost,
        enableTracking: true, // receiving goods means you're counting them
        refType: 'stock_entry',
        refId: row.id,
        note: input.supplier ? `Recepción · ${input.supplier}` : 'Recepción',
        createdBy: input.createdBy,
        movedAt: receivedAt,
      }, client);
    }

    if (input.postExpense && total > 0) {
      const mov = (await client.query<{ id: number }>(
        `INSERT INTO cash_movements (business_id, kind, amount, method, category, note, created_by, sold_at)
         VALUES ($1,'expense',$2,'cash',$3,$4,$5,$6) RETURNING id`,
        [businessId, total, PURCHASE_CATEGORY, input.supplier || 'Recepción de mercadería',
         input.createdBy ?? 'dashboard', receivedAt],
      )).rows[0];
      await client.query('UPDATE stock_entries SET cash_movement_id = $1 WHERE id = $2', [mov.id, row.id]);
      row.cash_movement_id = mov.id;
    }
    return row;
  });

  recordEvent('stock.entry', { amount: total, meta: { supplier: input.supplier ?? '', lines: lines.length } });
  return entry;
}

// Reverse a recepción. Never deletes: the reversal is its own movement, and the
// cash side gets a compensating income row because cash_movements is a ledger.
export async function voidStockEntry(id: number): Promise<{ ok: boolean; error?: string }> {
  const businessId = currentBusinessId();
  const entry = await one<StockEntry>('SELECT * FROM stock_entries WHERE id = $1 AND business_id = $2', [id, businessId]);
  if (!entry) return { ok: false, error: 'Recepción no encontrada' };
  if (entry.status === 'void') return { ok: false, error: 'La recepción ya fue anulada' };

  await tx(async (client) => {
    await client.query(`UPDATE stock_entries SET status = 'void' WHERE id = $1`, [id]);
    const items = (await client.query<{ product_id: number | null; qty: number }>(
      'SELECT product_id, qty FROM stock_entry_items WHERE entry_id = $1', [id],
    )).rows;
    for (const it of items) {
      if (it.product_id == null) continue;
      await adjustStock({
        productId: it.product_id,
        qtyDelta: -it.qty,
        kind: 'adjustment',
        origin: 'system',
        refType: 'stock_entry',
        refId: id,
        note: `Anulación de recepción #${id}`,
      }, client);
    }
    if (entry.cash_movement_id) {
      await client.query(
        `INSERT INTO cash_movements (business_id, kind, amount, method, category, note, created_by)
         VALUES ($1,'income',$2,'cash',$3,$4,'system')`,
        [businessId, entry.total, PURCHASE_CATEGORY, `Anulación de recepción #${id}`],
      );
    }
  });
  return { ok: true };
}

export async function listStockEntries(opts: { limit?: number; offset?: number } = {}): Promise<(StockEntry & { item_count: number })[]> {
  return many(
    `SELECT e.*, COUNT(i.id)::int AS item_count
       FROM stock_entries e LEFT JOIN stock_entry_items i ON i.entry_id = e.id
      WHERE e.business_id = $1
      GROUP BY e.id
      ORDER BY e.received_at DESC, e.id DESC
      LIMIT $2 OFFSET $3`,
    [currentBusinessId(), Math.min(opts.limit ?? 50, 200), opts.offset ?? 0],
  );
}

export async function getStockEntry(id: number): Promise<(StockEntry & { items: StockEntryItem[] }) | null> {
  const entry = await one<StockEntry>('SELECT * FROM stock_entries WHERE id = $1 AND business_id = $2', [id, currentBusinessId()]);
  if (!entry) return null;
  const items = await many<StockEntryItem>('SELECT * FROM stock_entry_items WHERE entry_id = $1 ORDER BY id', [id]);
  return { ...entry, items };
}

// Total received today, for the daily close.
export async function getEntriesDaySummary(day: string): Promise<{ count: number; total: number }> {
  const { timezone } = await getSalesSettings();
  const row = await one<{ count: number; total: number }>(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::float8 AS total
       FROM stock_entries
      WHERE business_id = $1 AND status = 'applied' AND ${dayExpr('received_at', timezone)} = $2`,
    [currentBusinessId(), day],
  );
  return { count: row?.count ?? 0, total: round2(row?.total ?? 0) };
}
