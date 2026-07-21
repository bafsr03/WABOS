import { one, many, none, getAllSettings } from '../db/index.js';
import { bus } from '../events.js';
import { recordEvent } from './analytics.js';

export interface Charge {
  id: number;
  contact_id: number;
  amount: number;
  currency: string;
  concept: string;
  status: 'pending' | 'paid' | 'review' | 'rejected' | 'expired' | 'cancelled';
  created_by: string;
  due_at: number | null;
  paid_at: number | null;
  receipt_id: number | null;
  last_reminded_at: number | null;
  reminder_count: number;
  created_at: number;
}

export interface Receipt {
  id: number;
  media_id: number;
  message_id: number;
  contact_id: number;
  conversation_id: number;
  charge_id: number | null;
  is_receipt: number | null;
  provider: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  operation_number: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  recipient_phone_suffix: string | null;
  confidence: number | null;
  outcome: 'pending' | 'auto_verified' | 'review' | 'rejected' | 'not_receipt' | 'manual_verified' | 'manual_rejected';
  reasons: string;
  raw_extraction: string | null;
  notification_id: number | null;
  verification_method: string | null;
  created_at: number;
}

export interface MediaRow {
  id: number;
  message_id: number;
  mime: string;
  path: string;
  size_bytes: number;
  sha256: string;
  created_at: number;
}

export interface PaymentSettings {
  yapeName: string;
  yapePhone: string;
  plinName: string;
  plinPhone: string;
  autoConfirm: boolean;
  amountTolerance: number;
  dateWindowHours: number;
  confidenceThreshold: number;
  downloadPolicy: 'pending_charge' | 'always';
  confirmationTemplate: string;
  requireBankMatch: boolean;
  groundTruthSource: 'email' | 'webhook' | 'off';
  matchWindowMinutes: number;
  recheckIntervalSeconds: number;
  recheckMaxTries: number;
  webhookSecret: string;
  handoffOnReview: boolean;
  remindersEnabled: boolean;
  reminderOffsetsHours: string; // raw "24,72"; parsed by reminders.ts
  overdueAfterHours: number;
  reminderTemplate: string;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const s = await getAllSettings();
  const g = (k: string, fb = '') => s[k] ?? fb;
  return {
    yapeName: g('payments_yape_name'),
    yapePhone: g('payments_yape_phone'),
    plinName: g('payments_plin_name'),
    plinPhone: g('payments_plin_phone'),
    autoConfirm: g('payments_auto_confirm', '0') === '1',
    amountTolerance: Number(g('payments_amount_tolerance', '0.10')) || 0.1,
    dateWindowHours: Number(g('payments_date_window_hours', '48')) || 48,
    confidenceThreshold: Number(g('payments_confidence_threshold', '0.85')) || 0.85,
    downloadPolicy: g('payments_download_policy', 'pending_charge') === 'always' ? 'always' : 'pending_charge',
    confirmationTemplate: g('payments_confirmation_template', '¡Pago de {{currency}} {{amount}} confirmado! ✅ Gracias por tu compra.'),
    requireBankMatch: g('payments_require_bank_match', '1') === '1',
    groundTruthSource: (() => {
      const v = g('payments_ground_truth_source', 'off');
      return v === 'email' || v === 'webhook' ? v : 'off';
    })(),
    matchWindowMinutes: Number(g('payments_match_window_minutes', '180')) || 180,
    recheckIntervalSeconds: Number(g('payments_recheck_interval_seconds', '45')) || 45,
    recheckMaxTries: Number(g('payments_recheck_max_tries', '4')) || 4,
    webhookSecret: g('payments_webhook_secret', ''),
    handoffOnReview: g('payments_handoff_on_review', '1') === '1',
    remindersEnabled: g('payments_reminders_enabled', '0') === '1',
    reminderOffsetsHours: g('payments_reminder_offsets_hours', '24,72'),
    overdueAfterHours: Number(g('payments_overdue_after_hours', '168')) || 168,
    reminderTemplate: g('payments_reminder_template', 'Hola 👋 Te recordamos que tienes un pago pendiente de {{currency}} {{amount}} ({{concept}}). Cuando lo realices, envíanos tu comprobante por aquí. ¡Gracias!'),
  };
}

// ---- charges ---------------------------------------------------------------

async function chargeWithContact(id: number) {
  return one(`
    SELECT ch.*, ct.name AS contact_name, ct.phone AS contact_phone
    FROM charges ch JOIN contacts ct ON ct.id = ch.contact_id
    WHERE ch.id = $1
  `, [id]) as Promise<(Charge & { contact_name: string; contact_phone: string }) | undefined>;
}

export async function emitChargeUpdated(id: number) {
  bus.emitEvent({ type: 'charge.updated', charge: await chargeWithContact(id) });
}

export async function createCharge(input: {
  contactId: number;
  amount: number;
  currency?: string;
  concept?: string;
  dueAt?: number | null;
  createdBy?: 'dashboard' | 'ai';
}): Promise<Charge> {
  const charge = (await one<Charge>(`
    INSERT INTO charges (business_id, contact_id, amount, currency, concept, due_at, created_by)
    VALUES ((SELECT business_id FROM contacts WHERE id = $1), $1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [input.contactId, input.amount, input.currency ?? 'PEN', input.concept ?? '', input.dueAt ?? null, input.createdBy ?? 'dashboard']))!;
  recordEvent('charge.created', { contactId: charge.contact_id, amount: charge.amount, meta: { createdBy: charge.created_by } });
  await emitChargeUpdated(charge.id);
  return charge;
}

export async function getCharge(id: number): Promise<Charge | undefined> {
  return one<Charge>('SELECT * FROM charges WHERE id = $1', [id]);
}

export async function listCharges(status?: string) {
  const where = status ? 'WHERE ch.status = $1' : '';
  return many(`
    SELECT ch.*, ct.name AS contact_name, ct.phone AS contact_phone,
           r.verification_method AS method
    FROM charges ch
    JOIN contacts ct ON ct.id = ch.contact_id
    LEFT JOIN receipts r ON r.id = ch.receipt_id
    ${where}
    ORDER BY ch.created_at DESC
  `, status ? [status] : []);
}

export async function listPendingCharges(contactId: number): Promise<Charge[]> {
  return many<Charge>(`
    SELECT * FROM charges WHERE contact_id = $1 AND status IN ('pending','review') ORDER BY created_at DESC
  `, [contactId]);
}

export async function setChargeStatus(id: number, status: Charge['status']) {
  await none('UPDATE charges SET status = $1 WHERE id = $2', [status, id]);
  await emitChargeUpdated(id);
}

// Businesses that have at least one pending charge with a due date — the set the
// reminder scheduler needs to sweep. Global (no business scope) on purpose.
export async function businessesWithDueCharges(): Promise<number[]> {
  const rows = await many<{ business_id: number }>(
    `SELECT DISTINCT business_id FROM charges WHERE status = 'pending' AND due_at IS NOT NULL`,
  );
  return rows.map((r) => r.business_id);
}

// Pending, dated charges for the current business — candidates for a reminder or
// expiry. Scoped by business_id via the caller's context.
export async function listDueCharges(businessId: number): Promise<Charge[]> {
  return many<Charge>(
    `SELECT * FROM charges WHERE business_id = $1 AND status = 'pending' AND due_at IS NOT NULL ORDER BY due_at`,
    [businessId],
  );
}

export async function markReminded(id: number) {
  await none(
    `UPDATE charges SET reminder_count = reminder_count + 1, last_reminded_at = (extract(epoch from now())::bigint) WHERE id = $1`,
    [id],
  );
  await emitChargeUpdated(id);
}

export async function markChargePaid(chargeId: number, receiptId: number) {
  await none(`UPDATE charges SET status = 'paid', paid_at = (extract(epoch from now())::bigint), receipt_id = $1 WHERE id = $2`,
    [receiptId, chargeId]);
  const charge = await getCharge(chargeId);
  if (charge) recordEvent('charge.paid', { contactId: charge.contact_id, amount: charge.amount, meta: { method: 'manual' } });
  await emitChargeUpdated(chargeId);
}

// ---- receipts ----------------------------------------------------------------

export async function createReceipt(input: {
  mediaId: number;
  messageId: number;
  contactId: number;
  conversationId: number;
}): Promise<Receipt> {
  return (await one<Receipt>(`
    INSERT INTO receipts (business_id, media_id, message_id, contact_id, conversation_id)
    VALUES ((SELECT business_id FROM contacts WHERE id = $3), $1, $2, $3, $4)
    RETURNING *
  `, [input.mediaId, input.messageId, input.contactId, input.conversationId]))!;
}

export async function getReceipt(id: number): Promise<Receipt | undefined> {
  return one<Receipt>('SELECT * FROM receipts WHERE id = $1', [id]);
}

export async function getReceiptDetailed(id: number) {
  return one(`
    SELECT r.*, ct.name AS contact_name, ct.phone AS contact_phone,
           ch.amount AS charge_amount, ch.currency AS charge_currency, ch.concept AS charge_concept
    FROM receipts r
    JOIN contacts ct ON ct.id = r.contact_id
    LEFT JOIN charges ch ON ch.id = r.charge_id
    WHERE r.id = $1
  `, [id]);
}

export async function listReceipts(outcome?: string) {
  const where = outcome ? 'WHERE r.outcome = $1' : '';
  return many(`
    SELECT r.*, ct.name AS contact_name, ct.phone AS contact_phone,
           ch.amount AS charge_amount, ch.currency AS charge_currency, ch.concept AS charge_concept
    FROM receipts r
    JOIN contacts ct ON ct.id = r.contact_id
    LEFT JOIN charges ch ON ch.id = r.charge_id
    ${where}
    ORDER BY r.created_at DESC
  `, outcome ? [outcome] : []);
}

export async function saveReceiptExtraction(id: number, ex: {
  is_receipt: boolean;
  provider: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  operation_number: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  recipient_phone_suffix: string | null;
  confidence: number;
}) {
  await none(`
    UPDATE receipts SET
      is_receipt = $1, provider = $2, amount = $3, currency = $4, date = $5,
      operation_number = $6, sender_name = $7, recipient_name = $8, recipient_phone_suffix = $9,
      confidence = $10, raw_extraction = $11
    WHERE id = $12
  `, [
    ex.is_receipt ? 1 : 0, ex.provider, ex.amount, ex.currency, ex.date,
    ex.operation_number, ex.sender_name, ex.recipient_name, ex.recipient_phone_suffix,
    ex.confidence, JSON.stringify(ex), id,
  ]);
}

export async function setReceiptOutcome(
  id: number,
  outcome: Receipt['outcome'],
  reasons: string[] = [],
  chargeId?: number | null,
  method?: string,
) {
  if (chargeId !== undefined) {
    await none('UPDATE receipts SET outcome = $1, reasons = $2, charge_id = $3, verification_method = COALESCE($4, verification_method) WHERE id = $5',
      [outcome, JSON.stringify(reasons), chargeId, method ?? null, id]);
  } else {
    await none('UPDATE receipts SET outcome = $1, reasons = $2, verification_method = COALESCE($3, verification_method) WHERE id = $4',
      [outcome, JSON.stringify(reasons), method ?? null, id]);
  }
}

export async function setReceiptNotification(id: number, notificationId: number) {
  await none('UPDATE receipts SET notification_id = $1 WHERE id = $2', [notificationId, id]);
}

export async function isOperationNumberUsed(provider: string, operationNumber: string, excludeReceiptId?: number): Promise<boolean> {
  const row = await one(`
    SELECT id FROM receipts
    WHERE provider = $1 AND operation_number = $2
      AND outcome IN ('auto_verified','manual_verified')
      AND id <> $3
    LIMIT 1
  `, [provider, operationNumber, excludeReceiptId ?? -1]);
  return row !== undefined;
}

export async function getMedia(id: number): Promise<MediaRow | undefined> {
  return one<MediaRow>('SELECT * FROM media WHERE id = $1', [id]);
}
