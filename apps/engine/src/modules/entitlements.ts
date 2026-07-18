import { one } from '../db/index.js';
import { currentBusinessId } from '../context.js';
import { getUsageRow } from './usage.js';

// Thin premium-tier seam. The tier is the businesses.plan_tier column, kept in
// sync with the billing provider by its webhook. New signups start on 'free'
// (a limited trial); the paid ladder is basico → avanzado → pro; 'enterprise'
// is a manual contact-us tier (no self-serve checkout). Premium features
// (Voice DNA / style analysis) unlock at avanzado+. Feature call sites use
// isFeatureEnabled()/assertWithinLimit() and need no per-tier changes.
const FEATURE_MATRIX: Record<string, string[]> = {
  free: [],
  basico: [],
  avanzado: ['*'],
  pro: ['*'],
  enterprise: ['*'],
};

export type PlanTier = keyof typeof FEATURE_MATRIX;

// Structural per-tier caps. `contacts`/`agents` are enforced on the create
// endpoints; `aiMessagesPerMonth` is the hard cap on auto-replies; `numbers` is
// informational (a WhatsApp number == a workspace/subscription, not enforced here).
export interface PlanLimits { numbers: number; contacts: number; agents: number; aiMessagesPerMonth: number }
const INF = Number.POSITIVE_INFINITY;
const LIMITS: Record<string, PlanLimits> = {
  free: { numbers: 1, contacts: 100, agents: 1, aiMessagesPerMonth: 200 },
  basico: { numbers: 1, contacts: 1000, agents: 1, aiMessagesPerMonth: 1000 },
  avanzado: { numbers: 1, contacts: 5000, agents: 3, aiMessagesPerMonth: 3000 },
  pro: { numbers: 2, contacts: 20000, agents: 5, aiMessagesPerMonth: 6000 },
  enterprise: { numbers: INF, contacts: INF, agents: INF, aiMessagesPerMonth: INF },
};

export async function getLimits(): Promise<PlanLimits> {
  // Unknown tier → the most restrictive caps (safest for cost).
  return LIMITS[await getPlanTier()] ?? LIMITS.free;
}

// Throws a 402-flavored error when creating another row of `kind` would exceed
// the tier cap. Call before an INSERT on a capped resource.
export async function assertWithinLimit(kind: 'contacts' | 'agents'): Promise<void> {
  const limit = (await getLimits())[kind];
  if (limit === INF) return;
  // Test contacts don't count against the plan (they're not real CRM contacts).
  const testFilter = kind === 'contacts' ? ' AND is_test = 0' : '';
  const row = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${kind} WHERE business_id = $1${testFilter}`, [currentBusinessId()]);
  if ((row?.n ?? 0) >= limit) {
    throw Object.assign(new Error(`Alcanzaste el límite de tu plan (${limit} ${kind}). Actualiza para agregar más.`), { code: 'PLAN_LIMIT' });
  }
}

export async function getPlanTier(): Promise<string> {
  const row = await one<{ plan_tier: string }>('SELECT plan_tier FROM businesses WHERE id = $1', [currentBusinessId()]);
  return row?.plan_tier ?? 'free';
}

export interface AiUsage { messages: number; limit: number; period: string; inputTokens: number; outputTokens: number }

// Current business's AI-message usage this period alongside its tier cap. Feeds
// the hard-cap check and the dashboard usage meter (/api/status).
export async function getAiUsage(): Promise<AiUsage> {
  const [row, limits] = await Promise.all([getUsageRow(), getLimits()]);
  return {
    messages: row.messages,
    limit: limits.aiMessagesPerMonth,
    period: row.period,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
  };
}

// True while the business is under its monthly AI-message allotment. Consulted
// before the AI auto-replies; at the cap the AI pauses (hard cap) until the
// period rolls over or the plan is upgraded. ∞ tiers are always within limit.
export async function isAiWithinLimit(): Promise<boolean> {
  const { messages, limit } = await getAiUsage();
  return limit === INF || messages < limit;
}

export async function isFeatureEnabled(feature: string): Promise<boolean> {
  const allowed = FEATURE_MATRIX[await getPlanTier()] ?? ['*'];
  return allowed.includes('*') || allowed.includes(feature);
}

// Features the dashboard cares about, resolved for the current tier. Sent on
// /api/status so the UI can gray out gated actions.
export const GATED_FEATURES = ['style_analysis'] as const;

export async function featureFlags(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(GATED_FEATURES.map(async (f) => [f, await isFeatureEnabled(f)] as const));
  return Object.fromEntries(entries);
}
