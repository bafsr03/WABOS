import { logger } from '../logger.js';
import { runWithBusiness } from '../context.js';
import { sendText } from '../wa/outbound.js';
import { getOrCreateConversation } from '../modules/store.js';
import {
  businessesWithDueCharges, listDueCharges, markReminded, setChargeStatus, getPaymentSettings, getCharge,
} from '../modules/charges.js';
import { decideReminder, renderReminder, parseOffsets, type ReminderPolicy } from '../modules/reminders.js';

// Collections scheduler: periodically chase unpaid, dated charges. Runs as a
// global sweep (mirrors the email poller's cadence) and enters each business's
// context before touching its data, so tenant isolation is preserved.

const SWEEP_INTERVAL_MS = 60_000;

// Process one business's due charges: send any reminder that has come due and
// expire anything past the overdue window. Runs inside the business context.
async function sweepBusiness(businessId: number, now = new Date()): Promise<void> {
  const settings = await getPaymentSettings();
  const policy: ReminderPolicy = {
    enabled: settings.remindersEnabled,
    offsetsHours: parseOffsets(settings.reminderOffsetsHours),
    overdueAfterHours: settings.overdueAfterHours,
  };
  // Nothing to do at all when reminders are off and the overdue window is absurd.
  const charges = await listDueCharges(businessId);
  for (const charge of charges) {
    const decision = decideReminder(charge, policy, now);
    if (decision.action === 'expire') {
      await setChargeStatus(charge.id, 'expired');
      logger.info({ chargeId: charge.id, businessId }, 'charge expired (overdue)');
    } else if (decision.action === 'remind') {
      const conversation = await getOrCreateConversation(charge.contact_id);
      const ok = await sendText({
        conversationId: conversation.id,
        text: renderReminder(settings.reminderTemplate, charge),
        fromAi: true,
      });
      if (ok) {
        await markReminded(charge.id);
        logger.info({ chargeId: charge.id, businessId, nextCount: decision.nextCount }, 'payment reminder sent');
      }
    }
  }
}

export async function sweepReminders(now = new Date()): Promise<void> {
  const businessIds = await businessesWithDueCharges();
  for (const businessId of businessIds) {
    try {
      await runWithBusiness(businessId, () => sweepBusiness(businessId, now));
    } catch (err) {
      logger.warn({ err, businessId }, 'reminder sweep failed for business');
    }
  }
}

export function startCollectionsScheduler(): void {
  setInterval(() => void sweepReminders().catch((err) => logger.warn({ err }, 'reminder sweep failed')), SWEEP_INTERVAL_MS).unref();
}

// Manual "send reminder now" from the dashboard: force one reminder for a charge
// regardless of schedule. Only pending charges can be nudged. Assumes business context.
export async function remindNow(chargeId: number): Promise<{ ok: boolean; error?: string }> {
  const charge = await getCharge(chargeId);
  if (!charge) return { ok: false, error: 'Charge not found' };
  if (charge.status !== 'pending') return { ok: false, error: `Charge is ${charge.status}` };
  const settings = await getPaymentSettings();
  const conversation = await getOrCreateConversation(charge.contact_id);
  const ok = await sendText({
    conversationId: conversation.id,
    text: renderReminder(settings.reminderTemplate, charge),
    fromAi: true,
  });
  if (!ok) return { ok: false, error: 'Could not send the reminder' };
  await markReminded(charge.id);
  return { ok: true };
}
