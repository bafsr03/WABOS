import { none, one, many } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { logger } from '../logger.js';

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
  | 'broadcast.sent';

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
  revenue: number;              // sum of paid charges in range
  chargesCreated: number;
  chargesPaid: number;
  conversionPct: number | null; // paid / created
  messagesIn: number;
  aiReplies: number;
  handoffs: number;
  medianResponseSeconds: number | null; // median AI response latency
  revenueByDay: { day: string; amount: number }[];
  messagesByDay: { day: string; incoming: number; outgoing: number }[];
  topSearches: { query: string; count: number }[];
}

const DAY = 86_400;

// Count events of a given type in the window (business-scoped).
async function countEvents(type: EventType, since: number): Promise<number> {
  const row = await one<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM events WHERE business_id = $1 AND type = $2 AND created_at >= $3',
    [currentBusinessId(), type, since],
  );
  return Number(row?.n ?? 0);
}

export async function getAnalytics(rangeDays = 30): Promise<AnalyticsSummary> {
  const biz = currentBusinessId();
  const now = Math.floor(Date.now() / 1000);
  const since = now - rangeDays * DAY;

  const revenueRow = await one<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM events WHERE business_id = $1 AND type = 'charge.paid' AND created_at >= $2`,
    [biz, since],
  );
  const [chargesCreated, chargesPaid, messagesIn, aiReplies, handoffs] = await Promise.all([
    countEvents('charge.created', since),
    countEvents('charge.paid', since),
    countEvents('message.in', since),
    countEvents('ai.reply', since),
    countEvents('handoff', since),
  ]);

  // Daily revenue: bucket paid amounts by local day.
  const revenueByDay = await many<{ day: string; amount: number }>(
    `SELECT to_char(to_timestamp(created_at), 'YYYY-MM-DD') AS day, COALESCE(SUM(amount),0)::float8 AS amount
     FROM events WHERE business_id = $1 AND type = 'charge.paid' AND created_at >= $2
     GROUP BY day ORDER BY day`,
    [biz, since],
  );

  // Daily message volume, incoming vs outgoing.
  const messagesByDay = await many<{ day: string; incoming: number; outgoing: number }>(
    `SELECT to_char(to_timestamp(created_at), 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE type = 'message.in')::int  AS incoming,
            COUNT(*) FILTER (WHERE type = 'message.out')::int AS outgoing
     FROM events WHERE business_id = $1 AND type IN ('message.in','message.out') AND created_at >= $2
     GROUP BY day ORDER BY day`,
    [biz, since],
  );

  // Popular products proxy: most frequent catalog searches.
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

  return {
    rangeDays,
    revenue: Number(revenueRow?.total ?? 0),
    chargesCreated,
    chargesPaid,
    conversionPct: chargesCreated > 0 ? Math.round((chargesPaid / chargesCreated) * 100) : null,
    messagesIn,
    aiReplies,
    handoffs,
    medianResponseSeconds: respRow?.median != null ? Math.round(respRow.median) : null,
    revenueByDay,
    messagesByDay,
    topSearches,
  };
}
