import { config } from '../../config.js';

// Provider-agnostic billing seam. Routes/metering/UI depend only on this
// interface; the concrete rail (Lemon Squeezy today) is chosen in index.ts.

// The self-serve plans a customer can check out into. 'enterprise' is a manual
// contact-us tier (no checkout), so it is intentionally not a CheckoutTier.
export type CheckoutTier = 'basico' | 'avanzado' | 'pro';
export type BillingInterval = 'month' | 'year';

export interface BillingProvider {
  // False when the provider isn't configured → routes return 503 and the UI
  // shows "billing not configured".
  isAvailable(): boolean;
  // Hosted checkout URL to redirect the browser to (for a NEW subscription).
  createCheckoutUrl(tier: CheckoutTier, interval: BillingInterval): Promise<string>;
  // Switch the current business's EXISTING subscription to another plan/interval
  // (proration handled by the provider). No new subscription is created.
  changePlan(tier: CheckoutTier, interval: BillingInterval): Promise<void>;
  // Cancel the current subscription (stays active until the period ends).
  cancelSubscription(): Promise<void>;
  // Undo a pending cancellation before the period ends.
  resumeSubscription(): Promise<void>;
  // Customer-portal URL (manage payment method / invoices) for the current business.
  createPortalUrl(): Promise<string>;
  // Pull the current business's subscription straight from the provider's API and
  // apply it — a webhook-independent reconcile (used after checkout + as a manual
  // "refresh"). Returns true if a subscription was found and applied.
  syncFromProvider(): Promise<boolean>;
  // Verify + apply an incoming webhook (signature check inside).
  handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<void>;
}

export function billingDisabled(): Error {
  return Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
}

export function badPlan(): Error {
  return Object.assign(new Error('Ese plan no está disponible'), { code: 'BAD_PLAN' });
}

// Every variant id for a tier (monthly + annual). Blank entries are ignored.
function variantsForTier(tier: CheckoutTier): Record<BillingInterval, string> {
  return {
    basico: { month: config.lemonSqueezyVariantBasico, year: config.lemonSqueezyVariantBasicoAnnual },
    avanzado: { month: config.lemonSqueezyVariantAvanzado, year: config.lemonSqueezyVariantAvanzadoAnnual },
    pro: { month: config.lemonSqueezyVariantPro, year: config.lemonSqueezyVariantProAnnual },
  }[tier];
}

// Map a variant id back to the plan tier it grants (null = unknown). Both the
// monthly and annual variants of a plan resolve to the same tier — the billing
// interval doesn't change entitlements.
export function tierForVariant(variantId: string): CheckoutTier | null {
  if (!variantId) return null;
  for (const tier of ['basico', 'avanzado', 'pro'] as const) {
    const v = variantsForTier(tier);
    if (variantId === v.month || variantId === v.year) return tier;
  }
  return null;
}

export function variantForTier(tier: CheckoutTier, interval: BillingInterval): string {
  return variantsForTier(tier)[interval];
}
