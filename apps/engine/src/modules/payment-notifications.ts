import { db } from '../db/index.js';
import { bus } from '../events.js';

// The ground-truth ledger. Real Yape/Plin/bank alerts land here from any
// source (email poller, webhook, manual). The receipt verifier matches a
// screenshot against an unconsumed row before auto-confirming a payment.

export interface PaymentNotification {
  id: number;
  source: 'email' | 'webhook' | 'manual';
  provider: string | null;
  amount: number | null;
  currency: string;
  operation_number: string | null;
  sender_name: string | null;
  raw_text: string | null;
  received_at: number;
  ingested_at: number;
  consumed_by_receipt_id: number | null;
  external_id: string;
}

export function insertNotification(input: {
  source: 'email' | 'webhook' | 'manual';
  provider?: string | null;
  amount?: number | null;
  currency?: string;
  operationNumber?: string | null;
  senderName?: string | null;
  rawText?: string | null;
  receivedAt?: number | null;
  externalId: string;
}): PaymentNotification | null {
  const info = db.prepare(`
    INSERT OR IGNORE INTO payment_notifications
      (source, provider, amount, currency, operation_number, sender_name, raw_text, received_at, external_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.source,
    input.provider ?? null,
    input.amount ?? null,
    input.currency ?? 'PEN',
    input.operationNumber ?? null,
    input.senderName ?? null,
    input.rawText ?? null,
    input.receivedAt ?? Math.floor(Date.now() / 1000),
    input.externalId,
  );
  if (info.changes === 0) return null; // duplicate (source, external_id)
  const row = db.prepare('SELECT * FROM payment_notifications WHERE id = ?')
    .get(info.lastInsertRowid) as PaymentNotification;
  bus.emitEvent({ type: 'payment.notification', notification: row });
  return row;
}

function normOp(op: string): string {
  return op.replace(/\D/g, ''); // Yape/Plin op numbers vary in spacing/prefix
}

// Find an unconsumed real notification that corresponds to this screenshot.
// Primary key is the operation number (strongest); when the notification has
// no op number, fall back to amount + time window (+ optional provider).
export function findMatchingNotification(input: {
  provider?: string | null;
  operationNumber?: string | null;
  amount: number | null;
  tolerance: number;
  windowStart: number;
}): PaymentNotification | null {
  const candidates = db.prepare(`
    SELECT * FROM payment_notifications
    WHERE consumed_by_receipt_id IS NULL AND received_at >= ?
    ORDER BY received_at DESC
  `).all(input.windowStart) as PaymentNotification[];

  const op = input.operationNumber ? normOp(input.operationNumber) : '';

  // 1) Operation-number match (also require amount agreement as a guard).
  if (op) {
    const byOp = candidates.find((n) =>
      n.operation_number && normOp(n.operation_number) === op &&
      (input.amount === null || n.amount === null || Math.abs(n.amount - input.amount) <= input.tolerance),
    );
    if (byOp) return byOp;
  }

  // 2) Fallback: amount within tolerance, only for notifications lacking an op number.
  if (input.amount !== null) {
    const byAmount = candidates.find((n) =>
      !n.operation_number && n.amount !== null && Math.abs(n.amount - input.amount!) <= input.tolerance &&
      (!input.provider || !n.provider || n.provider === input.provider),
    );
    if (byAmount) return byAmount;
  }

  return null;
}

// Consume atomically: only succeeds if still unconsumed. Returns true on claim.
export function consumeNotification(notificationId: number, receiptId: number): boolean {
  const info = db.prepare(`
    UPDATE payment_notifications SET consumed_by_receipt_id = ?
    WHERE id = ? AND consumed_by_receipt_id IS NULL
  `).run(receiptId, notificationId);
  return info.changes > 0;
}

export function listNotifications(limit = 50): PaymentNotification[] {
  return db.prepare('SELECT * FROM payment_notifications ORDER BY received_at DESC LIMIT ?')
    .all(limit) as PaymentNotification[];
}

export function lastNotificationAt(): number | null {
  const row = db.prepare('SELECT MAX(received_at) AS t FROM payment_notifications').get() as { t: number | null };
  return row.t ?? null;
}
