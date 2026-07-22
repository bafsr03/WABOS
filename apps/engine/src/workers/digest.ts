import { logger } from '../logger.js';
import { runWithBusiness, currentBusinessId } from '../context.js';
import { many, setSetting } from '../db/index.js';
import { sendOwnerText } from '../wa/outbound.js';
import { sendMail } from '../modules/mailer.js';
import { composeDigest, getDigestSettings, type DigestSettings, type Digest } from '../modules/digest.js';

// Daily-close scheduler: once per local day per business (after the configured
// hour), compose the register's close and deliver it — primarily over WhatsApp
// (business number → owner's personal number), with email as a fallback. Mirrors
// the collections sweep: a global tick that enters each tenant's context.

const SWEEP_INTERVAL_MS = 5 * 60_000; // every 5 min; the hour+lastSentDay gates dedupe

function localParts(timezone: string, now = new Date()): { day: string; hour: number } {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now));
  return { day, hour };
}

// Send a composed digest over the configured channel(s). Returns which channels
// actually delivered (WhatsApp needs a live socket + owner phone; email needs SMTP).
export async function deliverDigest(businessId: number, digest: Digest, settings: DigestSettings): Promise<string[]> {
  const delivered: string[] = [];
  const wantWa = settings.channel === 'whatsapp' || settings.channel === 'both';
  const wantEmail = settings.channel === 'email' || settings.channel === 'both';
  if (wantWa && settings.ownerPhone) {
    const ok = await sendOwnerText(businessId, settings.ownerPhone, digest.text).catch(() => false);
    if (ok) delivered.push('whatsapp');
  }
  if (wantEmail && settings.ownerEmail) {
    try {
      await sendMail({ to: settings.ownerEmail, subject: digest.subject, text: digest.text });
      delivered.push('email');
    } catch (err) { logger.warn({ err, businessId }, 'digest email failed'); }
  }
  return delivered;
}

async function sweepBusiness(businessId: number, now = new Date()): Promise<void> {
  const settings = await getDigestSettings();
  if (!settings.enabled) return;
  const { day, hour } = localParts(settings.timezone, now);
  if (hour < settings.hour) return;         // too early in the local day
  if (settings.lastSentDay === day) return; // already sent today

  const digest = await composeDigest(day);
  // Mark sent first (idempotency) even if delivery has no live channel — the same
  // close is always viewable in the dashboard, so we never silently retry-spam.
  await setSetting('digest_last_sent_day', day);
  const delivered = await deliverDigest(businessId, digest, settings);
  logger.info({ businessId, day, delivered, hasActivity: digest.hasActivity }, 'daily digest processed');
}

export async function sweepDigests(now = new Date()): Promise<void> {
  const rows = await many<{ business_id: number }>(
    "SELECT business_id FROM settings WHERE key = 'digest_enabled' AND value = '1'",
  );
  for (const { business_id } of rows) {
    try {
      await runWithBusiness(business_id, () => sweepBusiness(business_id, now));
    } catch (err) {
      logger.warn({ err, businessId: business_id }, 'digest sweep failed for business');
    }
  }
}

export function startDigestScheduler(): void {
  setInterval(() => void sweepDigests().catch((err) => logger.warn({ err }, 'digest sweep failed')), SWEEP_INTERVAL_MS).unref();
}

// Manual "send now" from the dashboard: compose + deliver today's close regardless
// of hour/dedupe. Assumes business context.
export async function sendDigestNow(): Promise<{ digest: Digest; delivered: string[] }> {
  const settings = await getDigestSettings();
  const businessId = currentBusinessId();
  const { day } = localParts(settings.timezone);
  const digest = await composeDigest(day);
  const delivered = await deliverDigest(businessId, digest, settings);
  await setSetting('digest_last_sent_day', day);
  return { digest, delivered };
}
