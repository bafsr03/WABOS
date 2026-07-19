import crypto from 'node:crypto';
import { config } from '../../config.js';
import { one, none } from '../../db/index.js';
import { currentBusinessId } from '../../context.js';
import { logger } from '../../logger.js';
import { type BillingProvider, type CheckoutTier, type BillingInterval, billingDisabled, badPlan, tierForVariant, variantForTier } from './provider.js';

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
// Never returns 'enterprise' — that tier is set manually, not via checkout.
export function tierForSubscription(status: string, variantId: string, endsAt: number | null): CheckoutTier | 'free' {
  if (status === 'expired' || status === 'unpaid' || status === 'paused') return 'free';
  if (status === 'cancelled' && endsAt != null && endsAt * 1000 < Date.now()) return 'free';
  return tierForVariant(variantId) ?? 'free';
}

function toEpoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// The current business's Lemon Squeezy subscription id, or a NO_SUBSCRIPTION error.
async function currentSubscriptionId(): Promise<string> {
  const row = await one<{ billing_subscription_id: string | null }>(
    'SELECT billing_subscription_id FROM businesses WHERE id = $1', [currentBusinessId()]);
  if (!row?.billing_subscription_id) {
    throw Object.assign(new Error('No hay una suscripción activa'), { code: 'NO_SUBSCRIPTION' });
  }
  return row.billing_subscription_id;
}

// PATCH a subscription and apply the returned object to the current business, so
// the plan reflects immediately without waiting for the (also-arriving) webhook.
async function patchSubscription(id: string, attributes: Record<string, unknown>): Promise<void> {
  const json = await lsFetch(`/subscriptions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: { type: 'subscriptions', id, attributes } }),
  });
  if (json?.data) await syncSubscription(currentBusinessId(), json.data);
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

  async createCheckoutUrl(tier: CheckoutTier, interval: BillingInterval): Promise<string> {
    if (!configured()) throw billingDisabled();
    const variantId = variantForTier(tier, interval);
    if (!variantId) throw badPlan(); // e.g. annual not configured for this plan
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

  // Switch the existing subscription to another plan/interval. Lemon Squeezy
  // prorates automatically — no new subscription, no double charge.
  async changePlan(tier: CheckoutTier, interval: BillingInterval): Promise<void> {
    if (!configured()) throw billingDisabled();
    const variantId = variantForTier(tier, interval);
    if (!variantId) throw badPlan();
    const id = await currentSubscriptionId();
    // variant_id switches the plan; cancelled:false un-cancels if it was pending.
    await patchSubscription(id, { variant_id: Number(variantId), cancelled: false });
  },

  // Cancel at period end (LS keeps the subscription 'cancelled' + active until ends_at).
  async cancelSubscription(): Promise<void> {
    if (!configured()) throw billingDisabled();
    const id = await currentSubscriptionId();
    const json = await lsFetch(`/subscriptions/${id}`, { method: 'DELETE' });
    if (json?.data) await syncSubscription(currentBusinessId(), json.data);
  },

  // Undo a pending cancellation before the period ends.
  async resumeSubscription(): Promise<void> {
    if (!configured()) throw billingDisabled();
    const id = await currentSubscriptionId();
    await patchSubscription(id, { cancelled: false });
  },

  // Webhook-independent reconcile: ask Lemon Squeezy for this business's
  // subscriptions (by stored customer id, else by the owner's email) and apply
  // the most relevant one. Lets a checkout reflect even if the webhook was missed.
  async syncFromProvider(): Promise<boolean> {
    if (!configured()) throw billingDisabled();
    let query = `filter[store_id]=${encodeURIComponent(String(config.lemonSqueezyStoreId))}`;
    // Match by the account email (always present + always on the subscription);
    // fall back to a previously-stored customer id for legacy-token businesses.
    const email = await ownerEmail();
    if (email) {
      query += `&filter[user_email]=${encodeURIComponent(email)}`;
    } else {
      const biz = await one<{ billing_customer_id: string | null }>(
        'SELECT billing_customer_id FROM businesses WHERE id = $1', [currentBusinessId()]);
      if (!biz?.billing_customer_id) return false; // nothing to match on
      query += `&filter[customer_id]=${encodeURIComponent(biz.billing_customer_id)}`;
    }
    const json = await lsFetch(`/subscriptions?${query}`);
    const subs: any[] = Array.isArray(json?.data) ? json.data : [];
    logger.info({ businessId: currentBusinessId(), match: email ? `email:${email}` : 'customer_id', found: subs.length }, 'billing reconcile');
    if (subs.length === 0) return false;
    // Prefer an access-granting sub, newest first (in case of leftover duplicates).
    const rank = (s: string) => ({ active: 0, on_trial: 0, past_due: 1, cancelled: 2, paused: 3 } as Record<string, number>)[s] ?? 9;
    subs.sort((a, b) =>
      rank(a.attributes?.status) - rank(b.attributes?.status) ||
      (Date.parse(b.attributes?.created_at ?? '') || 0) - (Date.parse(a.attributes?.created_at ?? '') || 0));
    await syncSubscription(currentBusinessId(), subs[0]);
    return true;
  },

  async createPortalUrl(): Promise<string> {
    if (!configured()) throw billingDisabled();
    const id = await currentSubscriptionId();
    // Portal URLs are time-limited, so fetch a fresh one each time.
    const json = await lsFetch(`/subscriptions/${id}`);
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
