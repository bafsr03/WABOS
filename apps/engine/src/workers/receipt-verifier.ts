import fs from 'node:fs';
import { logger } from '../logger.js';
import { bus } from '../events.js';
import { db } from '../db/index.js';
import { sendText } from '../wa/outbound.js';
import { scheduleAiReply } from '../wa/inbound.js';
import { setConversationMode } from '../modules/store.js';
import { mediaAbsolutePath } from '../wa/media.js';
import { extractReceipt, isExtractorAvailable } from '../ai/receipt-extractor.js';
import { decideOutcome, matchCharge } from '../modules/verification.js';
import { enqueueJob, pokePoller } from '../jobs/queue.js';
import {
  getCharge, getReceipt, getReceiptDetailed, getMedia, getPaymentSettings,
  listPendingCharges, markChargePaid, setChargeStatus, setReceiptOutcome, setReceiptNotification,
  saveReceiptExtraction, isOperationNumberUsed,
  type Charge, type Receipt, type PaymentSettings,
} from '../modules/charges.js';
import { findMatchingNotification, consumeNotification } from '../modules/payment-notifications.js';

const ACK_MESSAGE = 'Recibimos tu comprobante, lo estamos validando ✅';

function renderTemplate(template: string, charge: Charge): string {
  return template
    .replaceAll('{{amount}}', charge.amount.toFixed(2))
    .replaceAll('{{currency}}', charge.currency === 'PEN' ? 'S/' : charge.currency)
    .replaceAll('{{concept}}', charge.concept);
}

function sendToReview(receipt: Receipt, reasons: string[], charge: Charge | null, settings: PaymentSettings) {
  setReceiptOutcome(receipt.id, 'review', reasons, charge ? charge.id : undefined);
  if (charge && charge.status === 'pending') setChargeStatus(charge.id, 'review');
  if (settings.handoffOnReview) setConversationMode(receipt.conversation_id, 'human'); // let the owner take over
  bus.emitEvent({ type: 'receipt.review_needed', receipt: getReceiptDetailed(receipt.id) });
}

export async function processReceiptJob(payload: { receiptId: number; tryCount?: number }): Promise<void> {
  const receipt = getReceipt(payload.receiptId);
  if (!receipt) return;
  if (receipt.outcome !== 'pending') return; // already resolved (idempotent across retries)
  const tryCount = payload.tryCount ?? 0;
  const firstPass = tryCount === 0;

  const media = getMedia(receipt.media_id);
  if (!media) throw new Error(`media ${receipt.media_id} not found`);

  const openCharges = listPendingCharges(receipt.contact_id).filter((c) => c.status === 'pending');
  const settings = getPaymentSettings();

  // Without an API key we degrade to manual handling: everything a human could
  // plausibly need to see lands in the review queue.
  if (!isExtractorAvailable()) {
    sendToReview(receipt, ['extraction_unavailable'], openCharges[0] ?? null, settings);
    await sendText({ conversationId: receipt.conversation_id, text: ACK_MESSAGE, fromAi: true });
    return;
  }

  // On the first pass, run the vision extraction and persist it. On re-checks we
  // reuse what we already extracted (no repeat AI cost) and only re-query the ledger.
  let extraction;
  if (firstPass) {
    const imgBase64 = fs.readFileSync(mediaAbsolutePath(media)).toString('base64');
    extraction = await extractReceipt(imgBase64, media.mime);
    saveReceiptExtraction(receipt.id, extraction);
  } else {
    extraction = extractionFromReceipt(receipt);
    if (!extraction) throw new Error(`receipt ${receipt.id} missing stored extraction on re-check`);
  }

  if (!extraction.is_receipt) {
    setReceiptOutcome(receipt.id, 'not_receipt', ['not_a_receipt']);
    scheduleAiReply(receipt.conversation_id); // let the AI employee answer the image normally
    return;
  }

  const charge = matchCharge(extraction, openCharges, settings.amountTolerance);
  const opUsed = Boolean(
    extraction.provider && extraction.operation_number &&
    isOperationNumberUsed(extraction.provider, extraction.operation_number, receipt.id),
  );
  const match = findMatchingNotification({
    provider: extraction.provider,
    operationNumber: extraction.operation_number,
    amount: extraction.amount,
    tolerance: settings.amountTolerance,
    windowStart: Math.floor(Date.now() / 1000) - settings.matchWindowMinutes * 60,
  });
  const decision = decideOutcome({
    extraction, charge, settings, opNumberUsed: opUsed, hasBankMatch: Boolean(match), tryCount,
  });
  logger.info({ receiptId: receipt.id, tryCount, outcome: decision.outcome, method: decision.method, reasons: decision.reasons }, 'receipt decision');

  if (decision.outcome === 'not_receipt') {
    setReceiptOutcome(receipt.id, 'not_receipt', decision.reasons);
    scheduleAiReply(receipt.conversation_id);
    return;
  }

  if (decision.outcome === 'recheck') {
    // The screenshot looks good but the merchant's alert hasn't arrived yet.
    // Ack once, then poll the ledger again shortly (reuses jobs.run_at).
    if (firstPass) await sendText({ conversationId: receipt.conversation_id, text: ACK_MESSAGE, fromAi: true });
    enqueueJob(
      'receipt.process',
      { receiptId: receipt.id, tryCount: tryCount + 1 },
      Math.floor(Date.now() / 1000) + settings.recheckIntervalSeconds,
    );
    return;
  }

  if (decision.outcome === 'auto_verified' && charge) {
    const paid = confirmPaymentAtomically(receipt, charge, match ? match.id : null, decision.method ?? 'screenshot_only');
    if (!paid.ok) {
      // Operation number / notification claimed concurrently → fall back to review.
      sendToReview(receipt, [paid.reason], charge, settings);
      if (firstPass) await sendText({ conversationId: receipt.conversation_id, text: ACK_MESSAGE, fromAi: true });
      return;
    }
    await sendText({
      conversationId: receipt.conversation_id,
      text: renderTemplate(settings.confirmationTemplate, charge),
      fromAi: true,
    });
    return;
  }

  sendToReview(receipt, decision.reasons, charge, settings);
  if (firstPass) await sendText({ conversationId: receipt.conversation_id, text: ACK_MESSAGE, fromAi: true });
}

// Rebuild the extraction shape from the stored receipt row for re-check passes.
function extractionFromReceipt(r: Receipt) {
  if (r.is_receipt === null) return null;
  return {
    is_receipt: r.is_receipt === 1,
    provider: r.provider as any,
    amount: r.amount,
    currency: r.currency,
    date: r.date,
    operation_number: r.operation_number,
    sender_name: r.sender_name,
    recipient_name: r.recipient_name,
    recipient_phone_suffix: r.recipient_phone_suffix,
    confidence: r.confidence ?? 0,
  };
}

// Consume the matched notification, mark the receipt verified and the charge
// paid — all or nothing, so a notification is never double-spent.
function confirmPaymentAtomically(
  receipt: Receipt,
  charge: Charge,
  notificationId: number | null,
  method: 'bank_match' | 'screenshot_only',
): { ok: true } | { ok: false; reason: string } {
  try {
    const run = db.transaction(() => {
      if (notificationId !== null) {
        if (!consumeNotification(notificationId, receipt.id)) throw new Error('NOTIFICATION_CONSUMED');
        setReceiptNotification(receipt.id, notificationId);
      }
      setReceiptOutcome(receipt.id, 'auto_verified', [], charge.id, method); // may throw on opnum UNIQUE
      markChargePaid(charge.id, receipt.id);
    });
    run();
    return { ok: true };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('NOTIFICATION_CONSUMED')) return { ok: false, reason: 'notification_already_used' };
    if (msg.includes('UNIQUE')) return { ok: false, reason: 'operation_number_reused' };
    throw err;
  }
}

// When a real notification arrives, immediately re-check any receipts that are
// waiting on a bank match instead of waiting for the next poll tick. Uses the
// stored extraction (tryCount>0 skips re-extraction and the ack). The pending
// guard in processReceiptJob makes the extra job harmless if the recheck loop
// resolves first.
export function rekickPendingReceipts() {
  const rows = db.prepare(
    `SELECT id FROM receipts WHERE outcome = 'pending' AND is_receipt = 1`,
  ).all() as { id: number }[];
  for (const r of rows) enqueueJob('receipt.process', { receiptId: r.id, tryCount: 1 });
  if (rows.length) pokePoller();
}

// A job that exhausted its retries must still surface to a human.
export function onReceiptJobDead(payload: { receiptId: number }) {
  const receipt = getReceipt(payload.receiptId);
  if (!receipt || receipt.outcome !== 'pending') return;
  setReceiptOutcome(receipt.id, 'review', ['processing_failed']);
  bus.emitEvent({ type: 'receipt.review_needed', receipt: getReceiptDetailed(receipt.id) });
}

// Manual review actions (called from the API).
export async function approveReceipt(receiptId: number): Promise<{ ok: boolean; error?: string }> {
  const receipt = getReceipt(receiptId);
  if (!receipt) return { ok: false, error: 'Receipt not found' };
  if (receipt.outcome === 'manual_verified' || receipt.outcome === 'auto_verified') return { ok: true };
  if (receipt.outcome !== 'review' && receipt.outcome !== 'pending') {
    return { ok: false, error: `Receipt is ${receipt.outcome}` };
  }

  const attached = receipt.charge_id ? getCharge(receipt.charge_id) : undefined;
  const charge = attached && attached.status !== 'paid'
    ? attached
    : listPendingCharges(receipt.contact_id)[0] ?? null;
  if (!charge) return { ok: false, error: 'No open charge to apply this receipt to' };

  try {
    setReceiptOutcome(receipt.id, 'manual_verified', [], charge.id, 'manual');
  } catch (err: any) {
    if (String(err?.message).includes('UNIQUE')) {
      return { ok: false, error: 'Operation number already used by another verified receipt' };
    }
    throw err;
  }
  markChargePaid(charge.id, receipt.id);
  await sendText({
    conversationId: receipt.conversation_id,
    text: renderTemplate(getPaymentSettings().confirmationTemplate, charge),
    fromAi: true,
  });
  return { ok: true };
}

export async function rejectReceipt(receiptId: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const receipt = getReceipt(receiptId);
  if (!receipt) return { ok: false, error: 'Receipt not found' };
  if (receipt.outcome === 'manual_rejected') return { ok: true };
  if (receipt.outcome !== 'review' && receipt.outcome !== 'pending') {
    return { ok: false, error: `Receipt is ${receipt.outcome}` };
  }

  setReceiptOutcome(receipt.id, 'manual_rejected', reason ? [reason] : []);
  if (receipt.charge_id) {
    setChargeStatus(receipt.charge_id, 'pending'); // back to awaiting a valid payment
  }
  await sendText({
    conversationId: receipt.conversation_id,
    text: 'No pudimos validar tu comprobante. Por favor verifica el pago o comunícate con nosotros 🙏',
    fromAi: true,
  });
  return { ok: true };
}
