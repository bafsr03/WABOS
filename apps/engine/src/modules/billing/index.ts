import { config } from '../../config.js';
import { type BillingProvider, type CheckoutTier, type BillingInterval } from './provider.js';
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

function requireProvider(): BillingProvider {
  const p = provider();
  if (!p) throw Object.assign(new Error('El cobro no está configurado'), { code: 'BILLING_DISABLED' });
  return p;
}

export function createCheckoutSession(tier: CheckoutTier, interval: BillingInterval = 'month'): Promise<string> {
  return requireProvider().createCheckoutUrl(tier, interval);
}

export function changePlan(tier: CheckoutTier, interval: BillingInterval = 'month'): Promise<void> {
  return requireProvider().changePlan(tier, interval);
}

export function cancelSubscription(): Promise<void> {
  return requireProvider().cancelSubscription();
}

export function resumeSubscription(): Promise<void> {
  return requireProvider().resumeSubscription();
}

export function syncSubscriptionFromProvider(): Promise<boolean> {
  return requireProvider().syncFromProvider();
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
