import webpush from 'web-push';
import { one, many, none } from '../db/index.js';
import { currentBusinessId, runWithBusiness } from '../context.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { sendFcm, isFcmConfigured } from './fcm.js';

// Web Push (VAPID) delivery + subscription storage. Disabled cleanly when no
// VAPID keys are configured — subscribe returns 503 and sends are no-ops.

let configured = false;
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  configured = true;
}

export function isPushConfigured(): boolean {
  return configured;
}

// True when at least one push transport (web or native) can deliver.
export function isAnyPushConfigured(): boolean {
  return configured || isFcmConfigured();
}

export function vapidPublicKey(): string {
  return config.vapidPublicKey;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(sub: PushSubscriptionInput): Promise<void> {
  await none(
    `INSERT INTO push_subscriptions (business_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET business_id = EXCLUDED.business_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [currentBusinessId(), sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await none('DELETE FROM push_subscriptions WHERE endpoint = $1 AND business_id = $2', [endpoint, currentBusinessId()]);
}

// ---- native device tokens (Capacitor iOS/Android via FCM) -------------------

export async function saveDeviceToken(platform: 'ios' | 'android', token: string): Promise<void> {
  await none(
    `INSERT INTO device_tokens (business_id, platform, token) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET business_id = EXCLUDED.business_id, platform = EXCLUDED.platform`,
    [currentBusinessId(), platform, token],
  );
}

export async function removeDeviceToken(token: string): Promise<void> {
  await none('DELETE FROM device_tokens WHERE token = $1 AND business_id = $2', [token, currentBusinessId()]);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Fan out a notification to all of a business's devices across both transports:
// browser web-push subscriptions and native (FCM) device tokens. Prunes anything
// the push service reports as gone.
export async function sendPush(businessId: number, payload: PushPayload): Promise<void> {
  await Promise.all([sendWebPush(businessId, payload), sendNativePush(businessId, payload)]);
}

async function sendWebPush(businessId: number, payload: PushPayload): Promise<void> {
  if (!configured) return;
  const subs = await many<{ id: number; endpoint: string; p256dh: string; auth: string }>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE business_id = $1',
    [businessId],
  );
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await none('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
      } else {
        logger.warn({ err, subId: s.id }, 'push send failed');
      }
    }
  }));
}

async function sendNativePush(businessId: number, payload: PushPayload): Promise<void> {
  if (!isFcmConfigured()) return;
  const tokens = await many<{ id: number; token: string }>(
    'SELECT id, token FROM device_tokens WHERE business_id = $1',
    [businessId],
  );
  await Promise.all(tokens.map(async (t) => {
    const result = await sendFcm(t.token, { title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
    if (result === 'gone') await none('DELETE FROM device_tokens WHERE id = $1', [t.id]).catch(() => {});
  }));
}

// Bridge bus events to push notifications. Registered once at startup. Events
// already carry businessId, so pushes route to the right tenant's devices.
export function startPushDispatcher(): void {
  if (!isAnyPushConfigured()) {
    logger.info('push not configured (no VAPID keys, no FCM) — dispatcher idle');
    return;
  }
  bus.on('event', (event: any) => {
    const businessId: number | undefined = event.businessId;
    if (!businessId) return;
    void runWithBusiness(businessId, async () => {
      try {
        if (event.type === 'receipt.review_needed') {
          const name = event.receipt?.contact_name || event.receipt?.contact_phone || 'un cliente';
          await sendPush(businessId, { title: 'Comprobante por revisar', body: `Un pago de ${name} necesita tu revisión.`, url: '/payments', tag: 'receipt-review' });
        } else if (event.type === 'charge.updated' && event.charge?.status === 'paid') {
          const c = event.charge;
          const cur = c.currency === 'PEN' ? 'S/' : c.currency;
          await sendPush(businessId, { title: 'Pago confirmado ✅', body: `${cur} ${Number(c.amount).toFixed(2)} de ${c.contact_name || c.contact_phone}.`, url: '/payments', tag: `charge-${c.id}` });
        } else if (event.type === 'message.new' && event.message?.direction === 'in') {
          await sendPush(businessId, { title: 'Nuevo mensaje', body: String(event.message?.text ?? '').slice(0, 120) || 'Tienes un mensaje nuevo.', url: '/inbox', tag: `chat-${event.conversationId}` });
        }
      } catch (err) {
        logger.warn({ err, type: event.type }, 'push dispatch failed');
      }
    });
  });
  logger.info('web push dispatcher started');
}
