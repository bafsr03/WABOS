import { one, many, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';
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

export async function insertNotification(input: {
  source: 'email' | 'webhook' | 'manual';
  provider?: string | null;
  amount?: number | null;
  currency?: string;
  operationNumber?: string | null;
  senderName?: string | null;
  rawText?: string | null;
  receivedAt?: number | null;
  externalId: string;
}): Promise<PaymentNotification | null> {
  const row = await one<PaymentNotification>(`
    INSERT INTO payment_notifications
      (business_id, source, provider, amount, currency, operation_number, sender_name, raw_text, received_at, external_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (source, external_id) DO NOTHING
    RETURNING *
  `, [
    currentBusinessId(),
    input.source,
    input.provider ?? null,
    input.amount ?? null,
    input.currency ?? 'PEN',
    input.operationNumber ?? null,
    input.senderName ?? null,
    input.rawText ?? null,
    input.receivedAt ?? Math.floor(Date.now() / 1000),
    input.externalId,
  ]);
  if (!row) return null; // duplicate (source, external_id)
  bus.emitEvent({ type: 'payment.notification', notification: row });
  return row;
}

function normOp(op: string): string {
  return op.replace(/\D/g, ''); // Yape/Plin op numbers vary in spacing/prefix
}

// Find an unconsumed real notification that corresponds to this screenshot.
// Primary key is the operation number (strongest); when the notification has
// no op number, fall back to amount + time window (+ optional provider).
export async function findMatchingNotification(input: {
  provider?: string | null;
  operationNumber?: string | null;
  amount: number | null;
  tolerance: number;
  windowStart: number;
}): Promise<PaymentNotification | null> {
  const candidates = await many<PaymentNotification>(`
    SELECT * FROM payment_notifications
    WHERE business_id = $1 AND consumed_by_receipt_id IS NULL AND received_at >= $2
    ORDER BY received_at DESC
  `, [currentBusinessId(), input.windowStart]);

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
export async function consumeNotification(notificationId: number, receiptId: number): Promise<boolean> {
  const row = await one(`
    UPDATE payment_notifications SET consumed_by_receipt_id = $1
    WHERE id = $2 AND consumed_by_receipt_id IS NULL
    RETURNING id
  `, [receiptId, notificationId]);
  return row !== undefined;
}

export async function listNotifications(limit = 50): Promise<PaymentNotification[]> {
  return many<PaymentNotification>('SELECT * FROM payment_notifications WHERE business_id = $1 ORDER BY received_at DESC LIMIT $2',
    [currentBusinessId(), limit]);
}

export async function lastNotificationAt(): Promise<number | null> {
  const row = await one<{ t: number | null }>('SELECT MAX(received_at) AS t FROM payment_notifications WHERE business_id = $1', [currentBusinessId()]);
  return row?.t ?? null;
}
