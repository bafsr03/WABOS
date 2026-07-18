import { config } from '../../config.js';
import { type BillingProvider, type CheckoutTier } from './provider.js';
import { lemonSqueezyProvider } from './lemonsqueezy.js';

// Pick the active billing rail from config. Adding Paddle / Mercado Pago later is
// just another entry here — routes, metering, the hard cap, and the UI are all
// provider-agnostic and unchanged.
const PROVIDERS: Record<string, BillingProvider> = {
  lemonsqueezy: lemonSqueezyProvider,
};

function provider(): BillingProvider | null {
  return PROVIDERS[config.billingProvider] ?? null;
}

export function isBillingAvailable(): boolean {
  return provider()?.isAvailable() ?? false;
}

export function createCheckoutSession(tier: CheckoutTier): Promise<string> {
  const p = provider();
  if (!p) throw Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
  return p.createCheckoutUrl(tier);
}

export function createPortalSession(): Promise<string> {
  const p = provider();
  if (!p) throw Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
  return p.createPortalUrl();
}

export function handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<void> {
  const p = provider();
  if (!p) throw Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
  return p.handleWebhook(rawBody, headers);
}
