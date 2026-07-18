import { config } from '../../config.js';

// Provider-agnostic billing seam. Routes/metering/UI depend only on this
// interface; the concrete rail (Lemon Squeezy today) is chosen in index.ts.

// The self-serve plans a customer can check out into. 'enterprise' is a manual
// contact-us tier (no checkout), so it is intentionally not a CheckoutTier.
export type CheckoutTier = 'basico' | 'avanzado' | 'pro';

export interface BillingProvider {
  // False when the provider isn't configured → routes return 503 and the UI
  // shows "billing not configured".
  isAvailable(): boolean;
  // Hosted checkout URL to redirect the browser to, for the current business.
  createCheckoutUrl(tier: CheckoutTier): Promise<string>;
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
export function tierForVariant(variantId: string): CheckoutTier | null {
  if (!variantId) return null;
  if (variantId === config.lemonSqueezyVariantBasico) return 'basico';
  if (variantId === config.lemonSqueezyVariantAvanzado) return 'avanzado';
  if (variantId === config.lemonSqueezyVariantPro) return 'pro';
  return null;
}

export function variantForTier(tier: CheckoutTier): string {
  return {
    basico: config.lemonSqueezyVariantBasico,
    avanzado: config.lemonSqueezyVariantAvanzado,
    pro: config.lemonSqueezyVariantPro,
  }[tier];
}
