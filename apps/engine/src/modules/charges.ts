import { db, getSetting } from '../db/index.js';
import { bus } from '../events.js';

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
  // Bank-notification ground truth (production)
  requireBankMatch: boolean;
  groundTruthSource: 'email' | 'webhook' | 'off';
  matchWindowMinutes: number;
  recheckIntervalSeconds: number;
  recheckMaxTries: number;
  webhookSecret: string;
  handoffOnReview: boolean;
}

export function getPaymentSettings(): PaymentSettings {
  return {
    yapeName: getSetting('payments_yape_name'),
    yapePhone: getSetting('payments_yape_phone'),
    plinName: getSetting('payments_plin_name'),
    plinPhone: getSetting('payments_plin_phone'),
    autoConfirm: getSetting('payments_auto_confirm', '0') === '1',
    amountTolerance: Number(getSetting('payments_amount_tolerance', '0.10')) || 0.1,
    dateWindowHours: Number(getSetting('payments_date_window_hours', '48')) || 48,
    confidenceThreshold: Number(getSetting('payments_confidence_threshold', '0.85')) || 0.85,
    downloadPolicy: getSetting('payments_download_policy', 'pending_charge') === 'always' ? 'always' : 'pending_charge',
    confirmationTemplate: getSetting(
      'payments_confirmation_template',
      '¡Pago de {{currency}} {{amount}} confirmado! ✅ Gracias por tu compra.',
    ),
    requireBankMatch: getSetting('payments_require_bank_match', '1') === '1',
    groundTruthSource: (() => {
      const v = getSetting('payments_ground_truth_source', 'off');
      return v === 'email' || v === 'webhook' ? v : 'off';
    })(),
    matchWindowMinutes: Number(getSetting('payments_match_window_minutes', '180')) || 180,
    recheckIntervalSeconds: Number(getSetting('payments_recheck_interval_seconds', '45')) || 45,
    recheckMaxTries: Number(getSetting('payments_recheck_max_tries', '4')) || 4,
    webhookSecret: getSetting('payments_webhook_secret', ''),
    handoffOnReview: getSetting('payments_handoff_on_review', '1') === '1',
  };
}

// ---- charges ---------------------------------------------------------------

function chargeWithContact(id: number) {
  return db.prepare(`
    SELECT ch.*, ct.name AS contact_name, ct.phone AS contact_phone
    FROM charges ch JOIN contacts ct ON ct.id = ch.contact_id
    WHERE ch.id = ?
  `).get(id) as (Charge & { contact_name: string; contact_phone: string }) | undefined;
}

export function emitChargeUpdated(id: number) {
  bus.emitEvent({ type: 'charge.updated', charge: chargeWithContact(id) });
}

export function createCharge(input: {
  contactId: number;
  amount: number;
  currency?: string;
  concept?: string;
  dueAt?: number | null;
  createdBy?: 'dashboard' | 'ai';
}): Charge {
  const info = db.prepare(`
    INSERT INTO charges (contact_id, amount, currency, concept, due_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.contactId, input.amount, input.currency ?? 'PEN', input.concept ?? '', input.dueAt ?? null, input.createdBy ?? 'dashboard');
  const charge = getCharge(Number(info.lastInsertRowid))!;
  emitChargeUpdated(charge.id);
  return charge;
}

export function getCharge(id: number): Charge | undefined {
  return db.prepare('SELECT * FROM charges WHERE id = ?').get(id) as Charge | undefined;
}

export function listCharges(status?: string) {
  const where = status ? 'WHERE ch.status = ?' : '';
  return db.prepare(`
    SELECT ch.*, ct.name AS contact_name, ct.phone AS contact_phone,
           r.verification_method AS method
    FROM charges ch
    JOIN contacts ct ON ct.id = ch.contact_id
    LEFT JOIN receipts r ON r.id = ch.receipt_id
    ${where}
    ORDER BY ch.created_at DESC
  `).all(...(status ? [status] : []));
}

export function listPendingCharges(contactId: number): Charge[] {
  return db.prepare(`
    SELECT * FROM charges WHERE contact_id = ? AND status IN ('pending','review') ORDER BY created_at DESC
  `).all(contactId) as Charge[];
}

export function setChargeStatus(id: number, status: Charge['status']) {
  db.prepare('UPDATE charges SET status = ? WHERE id = ?').run(status, id);
  emitChargeUpdated(id);
}

export function markChargePaid(chargeId: number, receiptId: number) {
  db.prepare(`UPDATE charges SET status = 'paid', paid_at = unixepoch(), receipt_id = ? WHERE id = ?`)
    .run(receiptId, chargeId);
  emitChargeUpdated(chargeId);
}

// ---- receipts ----------------------------------------------------------------

export function createReceipt(input: {
  mediaId: number;
  messageId: number;
  contactId: number;
  conversationId: number;
}): Receipt {
  const info = db.prepare(`
    INSERT INTO receipts (media_id, message_id, contact_id, conversation_id)
    VALUES (?, ?, ?, ?)
  `).run(input.mediaId, input.messageId, input.contactId, input.conversationId);
  return getReceipt(Number(info.lastInsertRowid))!;
}

export function getReceipt(id: number): Receipt | undefined {
  return db.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as Receipt | undefined;
}

export function getReceiptDetailed(id: number) {
  return db.prepare(`
    SELECT r.*, ct.name AS contact_name, ct.phone AS contact_phone,
           ch.amount AS charge_amount, ch.currency AS charge_currency, ch.concept AS charge_concept
    FROM receipts r
    JOIN contacts ct ON ct.id = r.contact_id
    LEFT JOIN charges ch ON ch.id = r.charge_id
    WHERE r.id = ?
  `).get(id) as any;
}

export function listReceipts(outcome?: string) {
  const where = outcome ? 'WHERE r.outcome = ?' : '';
  return db.prepare(`
    SELECT r.*, ct.name AS contact_name, ct.phone AS contact_phone,
           ch.amount AS charge_amount, ch.currency AS charge_currency, ch.concept AS charge_concept
    FROM receipts r
    JOIN contacts ct ON ct.id = r.contact_id
    LEFT JOIN charges ch ON ch.id = r.charge_id
    ${where}
    ORDER BY r.created_at DESC
  `).all(...(outcome ? [outcome] : []));
}

export function saveReceiptExtraction(id: number, ex: {
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
  db.prepare(`
    UPDATE receipts SET
      is_receipt = ?, provider = ?, amount = ?, currency = ?, date = ?,
      operation_number = ?, sender_name = ?, recipient_name = ?, recipient_phone_suffix = ?,
      confidence = ?, raw_extraction = ?
    WHERE id = ?
  `).run(
    ex.is_receipt ? 1 : 0, ex.provider, ex.amount, ex.currency, ex.date,
    ex.operation_number, ex.sender_name, ex.recipient_name, ex.recipient_phone_suffix,
    ex.confidence, JSON.stringify(ex), id,
  );
}

export function setReceiptOutcome(
  id: number,
  outcome: Receipt['outcome'],
  reasons: string[] = [],
  chargeId?: number | null,
  method?: string,
) {
  if (chargeId !== undefined) {
    db.prepare('UPDATE receipts SET outcome = ?, reasons = ?, charge_id = ?, verification_method = COALESCE(?, verification_method) WHERE id = ?')
      .run(outcome, JSON.stringify(reasons), chargeId, method ?? null, id);
  } else {
    db.prepare('UPDATE receipts SET outcome = ?, reasons = ?, verification_method = COALESCE(?, verification_method) WHERE id = ?')
      .run(outcome, JSON.stringify(reasons), method ?? null, id);
  }
}

export function setReceiptNotification(id: number, notificationId: number) {
  db.prepare('UPDATE receipts SET notification_id = ? WHERE id = ?').run(notificationId, id);
}

export function isOperationNumberUsed(provider: string, operationNumber: string, excludeReceiptId?: number): boolean {
  const row = db.prepare(`
    SELECT id FROM receipts
    WHERE provider = ? AND operation_number = ?
      AND outcome IN ('auto_verified','manual_verified')
      AND id != ?
    LIMIT 1
  `).get(provider, operationNumber, excludeReceiptId ?? -1);
  return row !== undefined;
}

export function getMedia(id: number): MediaRow | undefined {
  return db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow | undefined;
}
