import { config } from '../../config.js';

// Provider-agnostic billing seam. Routes/metering/UI depend only on this
// interface; the concrete rail (Lemon Squeezy today) is chosen in index.ts.

export type Tier = 'pro' | 'enterprise';

export interface BillingProvider {
  // False when the provider isn't configured → routes return 503 and the UI
  // shows "billing not configured".
  isAvailable(): boolean;
  // Hosted checkout URL to redirect the browser to, for the current business.
  createCheckoutUrl(tier: Tier): Promise<string>;
  // Customer-portal URL (manage/cancel) for the current business.
  createPortalUrl(): Promise<string>;
  // Verify + apply an incoming webhook (signature check inside).
  handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<void>;
}

export function billingDisabled(): Error {
  return Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
}

export function badPlan(): Error {
  return Object.assign(new Error('Ese plan no está disponible'), { code: 'BAD_PLAN' });
}

// Map a provider price/variant id back to the plan tier it grants (null = unknown).
export function tierForVariant(variantId: string): Tier | null {
  if (variantId && variantId === config.lemonSqueezyVariantPro) return 'pro';
  if (variantId && variantId === config.lemonSqueezyVariantEnterprise) return 'enterprise';
  return null;
}

export function variantForTier(tier: Tier): string {
  return tier === 'pro' ? config.lemonSqueezyVariantPro : config.lemonSqueezyVariantEnterprise;
}
