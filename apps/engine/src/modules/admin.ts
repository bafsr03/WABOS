import { one, many } from '../db/index.js';
import { config } from '../config.js';
import { currentPeriod } from './usage.js';

// Owner-only ops console. These are the ONLY cross-tenant reads in the app: they
// deliberately ignore the per-business scoping to aggregate the whole platform.
// Access is gated by isAdminUser() (email ∈ config.adminEmails) on the route.

export async function isAdminUser(uid: number | undefined | null): Promise<boolean> {
  if (!uid || config.adminEmails.length === 0) return false;
  const row = await one<{ email: string }>('SELECT email FROM users WHERE id = $1', [uid]);
  return !!row && config.adminEmails.includes(row.email.trim().toLowerCase());
}

const nowEpoch = () => Math.floor(Date.now() / 1000);

export interface AdminBusinessRow {
  id: number; name: string; plan_tier: string; created_at: number;
  wa_phone: string | null; owner_email: string | null;
  contacts: number; products: number; sales: number; revenue: number;
  ai_messages_month: number; ai_cost_month_usd: number; last_activity: number | null;
}

export interface AdminOverview {
  generatedAt: number;
  users: { total: number; new7d: number; new30d: number };
  businesses: { total: number; waConnected: number; byTier: Record<string, number> };
  activity: { messagesTotal: number; messages24h: number; messages7d: number; aiMessages30d: number };
  commerce: { contacts: number; products: number; sales: number; revenue: number; revenue30d: number };
  // Claude API spend estimate. Cost is derived from token counts × configurable
  // prices (ai_usage doesn't record which model produced the tokens), so it's an
  // estimate, not an invoice.
  ai: {
    model: string; priceInputPerM: number; priceOutputPerM: number;
    messagesMonth: number; tokensInMonth: number; tokensOutMonth: number;
    tokensInAll: number; tokensOutAll: number;
    estCostMonthUsd: number; estCostAllUsd: number; businessesAtCap: number;
  };
  subscriptions: { paying: number; byStatus: Record<string, number> };
  list: AdminBusinessRow[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const now = nowEpoch();
  const d7 = now - 7 * 86400;
  const d30 = now - 30 * 86400;
  const d1 = now - 86400;

  const period = currentPeriod();                 // 'YYYY-MM' for the AI-usage rows
  const priceIn = config.aiPriceInputPerM;
  const priceOut = config.aiPriceOutputPerM;
  const cost = (inTok: number, outTok: number) => (inTok / 1e6) * priceIn + (outTok / 1e6) * priceOut;

  const count = async (q: string, p: any[] = []) => (await one<{ n: number }>(q, p))?.n ?? 0;
  const sum = async (q: string, p: any[] = []) => (await one<{ s: number }>(q, p))?.s ?? 0;

  const [
    usersTotal, usersNew7d, usersNew30d,
    bizTotal, waConnected,
    messagesTotal, messages24h, messages7d, aiMessages30d,
    contacts, products, sales, revenue, revenue30d,
    tokensInMonth, tokensOutMonth, messagesMonth, tokensInAll, tokensOutAll,
    businessesAtCap, paying,
  ] = await Promise.all([
    count('SELECT COUNT(*)::int AS n FROM users'),
    count('SELECT COUNT(*)::int AS n FROM users WHERE created_at >= $1', [d7]),
    count('SELECT COUNT(*)::int AS n FROM users WHERE created_at >= $1', [d30]),
    count('SELECT COUNT(*)::int AS n FROM businesses'),
    count("SELECT COUNT(*)::int AS n FROM businesses WHERE wa_phone IS NOT NULL AND wa_phone <> ''"),
    count('SELECT COUNT(*)::int AS n FROM messages'),
    count('SELECT COUNT(*)::int AS n FROM messages WHERE timestamp >= $1', [d1]),
    count('SELECT COUNT(*)::int AS n FROM messages WHERE timestamp >= $1', [d7]),
    count('SELECT COUNT(*)::int AS n FROM messages WHERE from_ai = 1 AND timestamp >= $1', [d30]),
    count('SELECT COUNT(*)::int AS n FROM contacts WHERE is_test = 0'),
    count('SELECT COUNT(*)::int AS n FROM products'),
    count("SELECT COUNT(*)::int AS n FROM sales WHERE status = 'completed'"),
    sum("SELECT COALESCE(SUM(total),0)::float AS s FROM sales WHERE status = 'completed'"),
    sum("SELECT COALESCE(SUM(total),0)::float AS s FROM sales WHERE status = 'completed' AND sold_at >= $1", [d30]),
    // AI usage: this month (by period) and all-time
    sum('SELECT COALESCE(SUM(input_tokens),0)::float8 AS s FROM ai_usage WHERE period = $1', [period]),
    sum('SELECT COALESCE(SUM(output_tokens),0)::float8 AS s FROM ai_usage WHERE period = $1', [period]),
    sum('SELECT COALESCE(SUM(messages),0)::float8 AS s FROM ai_usage WHERE period = $1', [period]),
    sum('SELECT COALESCE(SUM(input_tokens),0)::float8 AS s FROM ai_usage'),
    sum('SELECT COALESCE(SUM(output_tokens),0)::float8 AS s FROM ai_usage'),
    // Businesses that hit their tier's monthly AI-message cap this period (caps
    // mirror entitlements.LIMITS.aiMessagesPerMonth; enterprise = ∞ so excluded).
    count(`SELECT COUNT(*)::int AS n FROM businesses b
             JOIN ai_usage au ON au.business_id = b.id AND au.period = $1
            WHERE b.plan_tier IN ('free','basico','avanzado','pro')
              AND au.messages >= CASE b.plan_tier
                WHEN 'free' THEN 200 WHEN 'basico' THEN 1000
                WHEN 'avanzado' THEN 3000 WHEN 'pro' THEN 6000 END`, [period]),
    count("SELECT COUNT(*)::int AS n FROM businesses WHERE plan_tier IN ('basico','avanzado','pro')"),
  ]);

  const tierRows = await many<{ plan_tier: string; n: number }>(
    'SELECT plan_tier, COUNT(*)::int AS n FROM businesses GROUP BY plan_tier');
  const byTier: Record<string, number> = {};
  for (const t of tierRows) byTier[t.plan_tier] = t.n;

  const statusRows = await many<{ subscription_status: string | null; n: number }>(
    'SELECT subscription_status, COUNT(*)::int AS n FROM businesses GROUP BY subscription_status');
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.subscription_status ?? 'ninguno'] = r.n;

  const list = await many<AdminBusinessRow>(
    `SELECT b.id, b.name, b.plan_tier, b.created_at, b.wa_phone,
       (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
          WHERE m.business_id = b.id ORDER BY m.created_at LIMIT 1) AS owner_email,
       (SELECT COUNT(*)::int FROM contacts c WHERE c.business_id = b.id AND c.is_test = 0) AS contacts,
       (SELECT COUNT(*)::int FROM products p WHERE p.business_id = b.id) AS products,
       (SELECT COUNT(*)::int FROM sales s WHERE s.business_id = b.id AND s.status = 'completed') AS sales,
       (SELECT COALESCE(SUM(total),0)::float FROM sales s WHERE s.business_id = b.id AND s.status = 'completed') AS revenue,
       COALESCE(au.messages, 0)::int AS ai_messages_month,
       (COALESCE(au.input_tokens,0) / 1e6 * $2 + COALESCE(au.output_tokens,0) / 1e6 * $3)::float AS ai_cost_month_usd,
       GREATEST(
         (SELECT MAX(s.sold_at) FROM sales s WHERE s.business_id = b.id),
         (SELECT MAX(c.last_message_at) FROM conversations c WHERE c.business_id = b.id)
       ) AS last_activity
     FROM businesses b
     LEFT JOIN ai_usage au ON au.business_id = b.id AND au.period = $1
     ORDER BY b.created_at DESC`, [period, priceIn, priceOut]);

  return {
    generatedAt: now,
    users: { total: usersTotal, new7d: usersNew7d, new30d: usersNew30d },
    businesses: { total: bizTotal, waConnected, byTier },
    activity: { messagesTotal, messages24h, messages7d, aiMessages30d },
    commerce: { contacts, products, sales, revenue, revenue30d },
    ai: {
      model: config.aiModel, priceInputPerM: priceIn, priceOutputPerM: priceOut,
      messagesMonth, tokensInMonth, tokensOutMonth, tokensInAll, tokensOutAll,
      estCostMonthUsd: cost(tokensInMonth, tokensOutMonth),
      estCostAllUsd: cost(tokensInAll, tokensOutAll),
      businessesAtCap,
    },
    subscriptions: { paying, byStatus },
    list,
  };
}
