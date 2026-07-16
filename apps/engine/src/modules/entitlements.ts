import { getSetting, one } from '../db/index.js';
import { currentBusinessId } from '../context.js';

// Thin premium-tier seam. The gate exists now but is a no-op this phase: the
// default tier is 'pro', which unlocks everything. When billing lands, set the
// 'plan_tier' setting (or expand the matrix) and feature call sites gate for
// free — no changes needed where isFeatureEnabled() is used.
const FEATURE_MATRIX: Record<string, string[]> = {
  free: [],
  pro: ['*'],
  enterprise: ['*'],
};

export type PlanTier = keyof typeof FEATURE_MATRIX;

// Structural per-tier caps. Enforced on the create endpoints (agents, contacts).
// AI-message metering needs billing/overage design and is deferred.
export interface PlanLimits { numbers: number; contacts: number; agents: number; aiMessagesPerMonth: number }
const INF = Number.POSITIVE_INFINITY;
const LIMITS: Record<string, PlanLimits> = {
  free: { numbers: 1, contacts: 500, agents: 2, aiMessagesPerMonth: 1000 },
  pro: { numbers: 3, contacts: 10000, agents: 10, aiMessagesPerMonth: 50000 },
  enterprise: { numbers: INF, contacts: INF, agents: INF, aiMessagesPerMonth: INF },
};

export async function getLimits(): Promise<PlanLimits> {
  return LIMITS[await getPlanTier()] ?? LIMITS.pro;
}

// Throws a 402-flavored error when creating another row of `kind` would exceed
// the tier cap. Call before an INSERT on a capped resource.
export async function assertWithinLimit(kind: 'contacts' | 'agents'): Promise<void> {
  const limit = (await getLimits())[kind];
  if (limit === INF) return;
  const row = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${kind} WHERE business_id = $1`, [currentBusinessId()]);
  if ((row?.n ?? 0) >= limit) {
    throw Object.assign(new Error(`Alcanzaste el límite de tu plan (${limit} ${kind}). Actualiza para agregar más.`), { code: 'PLAN_LIMIT' });
  }
}

export async function getPlanTier(): Promise<string> {
  return getSetting('plan_tier', 'pro');
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
