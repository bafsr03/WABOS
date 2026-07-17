import crypto from 'node:crypto';
import { config } from '../../config.js';
import { one, none } from '../../db/index.js';
import { currentBusinessId } from '../../context.js';
import { logger } from '../../logger.js';
import { type BillingProvider, type Tier, billingDisabled, badPlan, tierForVariant, variantForTier } from './provider.js';

// Lemon Squeezy Merchant-of-Record billing. LS is the seller of record: it takes
// global cards/PayPal/wallets, handles tax, and pays out to Peru. We only create
// a hosted checkout, fetch a portal URL, and sync subscription state from webhooks.
// Uses fetch + node:crypto — no SDK, so no version coupling.

const API = 'https://api.lemonsqueezy.com/v1';

function configured(): boolean {
  return Boolean(config.lemonSqueezyApiKey && config.lemonSqueezyStoreId);
}

async function lsFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.lemonSqueezyApiKey}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Lemon Squeezy ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// The owner email prefills the checkout (optional; legacy-token businesses have none).
async function ownerEmail(): Promise<string | undefined> {
  const row = await one<{ email: string }>(
    `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.business_id = $1 ORDER BY m.created_at LIMIT 1`,
    [currentBusinessId()],
  );
  return row?.email;
}

// Access-granting statuses keep the tier; terminal ones drop to free. A cancelled
// sub still grants access until ends_at (LS keeps status 'cancelled' meanwhile).
export function tierForSubscription(status: string, variantId: string, endsAt: number | null): Tier | 'free' {
  if (status === 'expired' || status === 'unpaid' || status === 'paused') return 'free';
  if (status === 'cancelled' && endsAt != null && endsAt * 1000 < Date.now()) return 'free';
  return tierForVariant(variantId) ?? 'free';
}

function toEpoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// Apply a subscription object (from a webhook) to the owning business.
async function syncSubscription(businessId: number, sub: any): Promise<void> {
  const attrs = sub.attributes ?? {};
  const variantId = String(attrs.variant_id ?? '');
  const status = String(attrs.status ?? '');
  const endsAt = toEpoch(attrs.ends_at);
  const periodEnd = toEpoch(attrs.renews_at) ?? endsAt;
  const tier = tierForSubscription(status, variantId, endsAt);

  await none(
    `UPDATE businesses SET plan_tier = $1, subscription_status = $2, current_period_end = $3,
       billing_customer_id = $4, billing_subscription_id = $5, billing_provider = 'lemonsqueezy'
     WHERE id = $6`,
    [tier, status, periodEnd, String(attrs.customer_id ?? '') || null, String(sub.id ?? '') || null, businessId],
  );
  logger.info({ businessId, tier, status }, 'lemonsqueezy subscription synced');
}

export const lemonSqueezyProvider: BillingProvider = {
  isAvailable: configured,

  async createCheckoutUrl(tier: Tier): Promise<string> {
    if (!configured()) throw billingDisabled();
    const variantId = variantForTier(tier);
    if (!variantId) throw badPlan();
    const email = await ownerEmail();
    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            ...(email ? { email } : {}),
            custom: { business_id: String(currentBusinessId()) },
          },
          product_options: { redirect_url: `${config.dashboardUrl}/settings?billing=success` },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(config.lemonSqueezyStoreId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    };
    const json = await lsFetch('/checkouts', { method: 'POST', body: JSON.stringify(body) });
    const url = json?.data?.attributes?.url;
    if (!url) throw new Error('Lemon Squeezy no devolvió una URL de pago');
    return url;
  },

  async createPortalUrl(): Promise<string> {
    if (!configured()) throw billingDisabled();
    const row = await one<{ billing_subscription_id: string | null }>(
      'SELECT billing_subscription_id FROM businesses WHERE id = $1', [currentBusinessId()]);
    if (!row?.billing_subscription_id) {
      throw Object.assign(new Error('No hay una suscripción activa que gestionar'), { code: 'NO_SUBSCRIPTION' });
    }
    // Portal URLs are time-limited, so fetch a fresh one each time.
    const json = await lsFetch(`/subscriptions/${row.billing_subscription_id}`);
    const url = json?.data?.attributes?.urls?.customer_portal;
    if (!url) throw new Error('Lemon Squeezy no devolvió el portal del cliente');
    return url;
  },

  async handleWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<void> {
    if (!config.lemonSqueezyWebhookSecret) throw billingDisabled();
    // Verify X-Signature = HMAC-SHA256 hex of the raw body with the webhook secret.
    const signature = String(headers['x-signature'] ?? '');
    const expected = crypto.createHmac('sha256', config.lemonSqueezyWebhookSecret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw Object.assign(new Error('Invalid signature'), { code: 'BAD_SIGNATURE' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const name: string = event?.meta?.event_name ?? '';
    if (!name.startsWith('subscription_')) return; // ignore order/license events

    const sub = event.data;
    if (!sub || sub.type !== 'subscriptions') return;

    // Resolve the tenant: business_id sent as checkout custom_data, else by customer id.
    const customBiz = Number(event?.meta?.custom_data?.business_id);
    let businessId = Number.isFinite(customBiz) && customBiz > 0 ? customBiz : 0;
    if (!businessId) {
      const customerId = String(sub.attributes?.customer_id ?? '');
      const row = customerId
        ? await one<{ id: number }>('SELECT id FROM businesses WHERE billing_customer_id = $1', [customerId])
        : undefined;
      if (!row) { logger.warn({ event: name }, 'lemonsqueezy webhook for unknown business'); return; }
      businessId = row.id;
    }
    await syncSubscription(businessId, sub);
  },
};
