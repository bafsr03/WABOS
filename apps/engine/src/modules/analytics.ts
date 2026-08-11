import { none, one, many } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { logger } from '../logger.js';

// The cash-movement category a recepción posts its total under. Defined here
// rather than in inventory.ts so this module stays free of import cycles —
// inventory.ts re-exports it, which is where it reads naturally from.
export const PURCHASE_CATEGORY = 'Compra de mercadería';

// Append-only analytics event log. recordEvent is fire-and-forget: instrumentation
// must never break a real flow, so failures are swallowed (logged only). Every
// event is scoped to the current business context.

export type EventType =
  | 'message.in'
  | 'message.out'
  | 'ai.reply'
  | 'catalog.search'
  | 'handoff'
  | 'charge.created'
  | 'charge.paid'
  | 'receipt.verified'
  | 'receipt.review'
  | 'broadcast.sent'
  | 'sale.recorded'
  | 'expense.recorded'
  | 'stock.entry';

export function recordEvent(
  type: EventType,
  data: { contactId?: number | null; amount?: number | null; meta?: Record<string, unknown> } = {},
): void {
  void none(
    'INSERT INTO events (business_id, type, contact_id, amount, meta) VALUES ($1, $2, $3, $4, $5)',
    [currentBusinessId(), type, data.contactId ?? null, data.amount ?? null, JSON.stringify(data.meta ?? {})],
  ).catch((err) => logger.warn({ err, type }, 'recordEvent failed'));
}

// ---- dashboard aggregation --------------------------------------------------

export interface AnalyticsSummary {
  rangeDays: number;
  revenue: number;              // gross sales (POS + WhatsApp), unified from the sales table
  netSales: number;             // gross - card/processor fees
  fees: number;                 // total processor fees paid
  cogs: number;                 // cost of goods sold (from cost snapshots)
  expenses: number;             // cash-ledger expenses in range (incl. merchandise purchases)
  purchases: number;            // of those, merchandise bought via a recepción
  netProfit: number;            // netSales - cogs - (expenses - purchases): see below
  channel: SalesChannel | 'all';
  chargesCreated: number;
  chargesPaid: number;
  conversionPct: number | null; // paid / created
  messagesIn: number;
  aiReplies: number;
  handoffs: number;
  medianResponseSeconds: number | null; // median AI response latency
  revenueByDay: { day: string; amount: number }[];
  messagesByDay: { day: string; incoming: number; outgoing: number }[];
  topProducts: { name: string; qty: number; revenue: number }[]; // real best-sellers from sale line items
  salesByMethod: { method: string; total: number; net: number; fees: number; count: number }[];
  salesByChannel: { channel: string; total: number; net: number; count: number }[];
  linelessSales: number; // completed sales with no line items — they never moved stock
  topSearches: { query: string; count: number }[];
}

export type SalesChannel = 'pos' | 'whatsapp' | 'ai';

const DAY = 86_400;

// Local-day bucket in the business timezone (default America/Lima), so daily
// charts and "today" match the shopkeeper's clock, not UTC. tz is sanitized
// before interpolation (never free user text).
async function bizTimezone(): Promise<string> {
  const row = await one<{ value: string }>(
    "SELECT value FROM settings WHERE business_id = $1 AND key = 'business_timezone'",
    [currentBusinessId()],
  );
  return row?.value || 'America/Lima';
}
const dayBucket = (col: string, tz: string) =>
  `to_char(to_timestamp(${col}) AT TIME ZONE '${tz.replace(/[^A-Za-z0-9_/+-]/g, '')}', 'YYYY-MM-DD')`;

// Count events of a given type in the window (business-scoped).
async function countEvents(type: EventType, since: number): Promise<number> {
  const row = await one<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM events WHERE business_id = $1 AND type = $2 AND created_at >= $3',
    [currentBusinessId(), type, since],
  );
  return Number(row?.n ?? 0);
}

export async function getAnalytics(rangeDays = 30, opts: { channel?: SalesChannel } = {}): Promise<AnalyticsSummary> {
  const biz = currentBusinessId();
  const now = Math.floor(Date.now() / 1000);
  const since = now - rangeDays * DAY;

  const tz = await bizTimezone();

  // Optional origin filter, so "lo que vendí en el mostrador" and "lo que cerró la
  // IA por WhatsApp" can be read apart. Prefixed variants exist because some of
  // these queries alias the sales table and some don't.
  const ch = opts.channel;
  const chSql = ch ? ' AND channel = $3' : '';
  const chSqlS = ch ? ' AND s.channel = $3' : '';
  const p = ch ? [biz, since, ch] : [biz, since];

  // Money is read from the register (sales/cash_movements), not the event log, so
  // the numbers are truthful. Sales unify POS + WhatsApp (a paid charge becomes a
  // sale), so revenue is a single figure with no double counting.
  const salesRow = await one<{ gross: number; net: number; fees: number; cogs: number }>(
    `SELECT COALESCE(SUM(total),0)::float8 AS gross, COALESCE(SUM(net),0)::float8 AS net,
            COALESCE(SUM(fee_amount),0)::float8 AS fees, COALESCE(SUM(cost_total),0)::float8 AS cogs
     FROM sales WHERE business_id = $1 AND status = 'completed' AND sold_at >= $2${chSql}`,
    p,
  );
  const expensesRow = await one<{ total: number; purchases: number }>(
    `SELECT COALESCE(SUM(amount),0)::float8 AS total,
            COALESCE(SUM(amount) FILTER (WHERE category = $3),0)::float8 AS purchases
     FROM cash_movements
     WHERE business_id = $1 AND kind = 'expense' AND sold_at >= $2`,
    [biz, since, PURCHASE_CATEGORY],
  );

  const [chargesCreated, chargesPaid, messagesIn, aiReplies, handoffs] = await Promise.all([
    countEvents('charge.created', since),
    countEvents('charge.paid', since),
    countEvents('message.in', since),
    countEvents('ai.reply', since),
    countEvents('handoff', since),
  ]);

  // Daily revenue: bucket completed sales by local (business-timezone) day.
  const revenueByDay = await many<{ day: string; amount: number }>(
    `SELECT ${dayBucket('sold_at', tz)} AS day, COALESCE(SUM(total),0)::float8 AS amount
     FROM sales WHERE business_id = $1 AND status = 'completed' AND sold_at >= $2${chSql}
     GROUP BY day ORDER BY day`,
    p,
  );

  // Real best-sellers from actual line items (replaces the old search proxy).
  const topProducts = await many<{ name: string; qty: number; revenue: number }>(
    `SELECT si.name AS name, SUM(si.qty)::float8 AS qty, SUM(si.line_total)::float8 AS revenue
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.business_id = $1 AND s.status = 'completed' AND s.sold_at >= $2${chSqlS}
     GROUP BY si.name ORDER BY qty DESC LIMIT 8`,
    p,
  );

  // Payment-method breakdown, incl. fees paid per method (makes card cost visible).
  const salesByMethod = await many<{ method: string; total: number; net: number; fees: number; count: number }>(
    `SELECT payment_method AS method, COALESCE(SUM(total),0)::float8 AS total,
            COALESCE(SUM(net),0)::float8 AS net, COALESCE(SUM(fee_amount),0)::float8 AS fees, COUNT(*)::int AS count
     FROM sales WHERE business_id = $1 AND status = 'completed' AND sold_at >= $2${chSql}
     GROUP BY payment_method ORDER BY total DESC`,
    p,
  );

  // Origin split. Deliberately NOT channel-filtered — this is the card that shows
  // the split, so it always shows every channel.
  const salesByChannel = await many<{ channel: string; total: number; net: number; count: number }>(
    `SELECT channel, COALESCE(SUM(total),0)::float8 AS total,
            COALESCE(SUM(net),0)::float8 AS net, COUNT(*)::int AS count
     FROM sales WHERE business_id = $1 AND status = 'completed' AND sold_at >= $2
     GROUP BY channel ORDER BY total DESC`,
    [biz, since],
  );

  // Sales the AI closed over WhatsApp carry no line items: they never decremented
  // stock and contribute no COGS. Surfaced so the gap is stated, never guessed at.
  const linelessRow = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sales s
     WHERE s.business_id = $1 AND s.status = 'completed' AND s.sold_at >= $2${chSqlS}
       AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)`,
    p,
  );

  // Daily message volume, incoming vs outgoing.
  const messagesByDay = await many<{ day: string; incoming: number; outgoing: number }>(
    `SELECT ${dayBucket('created_at', tz)} AS day,
            COUNT(*) FILTER (WHERE type = 'message.in')::int  AS incoming,
            COUNT(*) FILTER (WHERE type = 'message.out')::int AS outgoing
     FROM events WHERE business_id = $1 AND type IN ('message.in','message.out') AND created_at >= $2
     GROUP BY day ORDER BY day`,
    [biz, since],
  );

  // What customers ask about (kept as a demand signal, no longer masquerading as sales).
  const topSearches = await many<{ query: string; count: number }>(
    `SELECT lower(meta->>'query') AS query, COUNT(*)::int AS count
     FROM events WHERE business_id = $1 AND type = 'catalog.search' AND created_at >= $2
       AND COALESCE(meta->>'query','') <> ''
     GROUP BY query ORDER BY count DESC LIMIT 8`,
    [biz, since],
  );

  // Median AI response latency: for each AI-sent outbound message, the gap to the
  // most recent inbound before it in the same conversation.
  const respRow = await one<{ median: number | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS median FROM (
       SELECT m.timestamp - (
         SELECT MAX(p.timestamp) FROM messages p
         WHERE p.conversation_id = m.conversation_id AND p.direction = 'in' AND p.timestamp <= m.timestamp
       ) AS gap
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.business_id = $1 AND m.direction = 'out' AND m.from_ai = 1 AND m.timestamp >= $2
     ) t WHERE gap IS NOT NULL AND gap >= 0 AND gap <= 3600`,
    [biz, since],
  );

  const gross = salesRow?.gross ?? 0;
  const netSales = salesRow?.net ?? 0;
  const cogs = salesRow?.cogs ?? 0;
  const expenses = expensesRow?.total ?? 0;
  const purchases = expensesRow?.purchases ?? 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Merchandise bought via a recepción is deliberately excluded from profit.
  // Those soles are already subtracted as COGS when the goods sell; counting the
  // purchase too would subtract the same money twice. It still shows in
  // `expenses` and in the cash view, where it is real money out of the drawer.
  return {
    rangeDays,
    channel: ch ?? 'all',
    revenue: round2(gross),
    netSales: round2(netSales),
    fees: round2(salesRow?.fees ?? 0),
    cogs: round2(cogs),
    expenses: round2(expenses),
    purchases: round2(purchases),
    netProfit: round2(netSales - cogs - (expenses - purchases)),
    chargesCreated,
    chargesPaid,
    conversionPct: chargesCreated > 0 ? Math.round((chargesPaid / chargesCreated) * 100) : null,
    messagesIn,
    aiReplies,
    handoffs,
    medianResponseSeconds: respRow?.median != null ? Math.round(respRow.median) : null,
    revenueByDay,
    messagesByDay,
    topProducts,
    salesByMethod,
    salesByChannel,
    linelessSales: linelessRow?.n ?? 0,
    topSearches,
  };
}
