import type { Charge, PaymentSettings } from './charges.js';

// Pure rules engine: given an extraction, the matched charge and the business
// payment settings, decide the outcome. No I/O — unit-testable in isolation.
//
// Trust model: a passing verification means "the screenshot is consistent
// with the expected payment", never "the money arrived" (Yape/Plin have no
// verification API). That is why nothing is ever auto-rejected: every
// suspicious receipt goes to human review with machine-readable reasons.

export interface ReceiptExtraction {
  is_receipt: boolean;
  provider: 'yape' | 'plin' | 'transfer' | 'other' | null;
  amount: number | null;
  currency: string | null;
  date: string | null; // as printed on the receipt, ISO-ish when possible
  operation_number: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  recipient_phone_suffix: string | null; // Yape masks all but the last 3 digits
  confidence: number; // 0..1
}

export interface VerificationResult {
  outcome: 'auto_verified' | 'review' | 'not_receipt';
  reasons: string[];
}

const IS_RECEIPT_MIN_CONFIDENCE = 0.5;

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

// Yape/Plin show recipient names abbreviated ("Maria F. Quispe" / "Maria F. Q."),
// so compare token-by-token: every receipt token must match a configured-name
// token exactly or as its initial.
export function namesMatch(extracted: string, configured: string): boolean {
  const a = normalizeName(extracted).split(' ');
  const b = normalizeName(configured).split(' ');
  if (a.length === 0 || b.length === 0) return false;
  const remaining = [...b];
  for (const token of a) {
    const idx = remaining.findIndex((t) => t === token || (token.length === 1 && t.startsWith(token)));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}

export function parseReceiptDate(raw: string): Date | null {
  const trimmed = raw.trim();
  // Peru formats first — "05/07/2026" is day/month, which new Date() would
  // misparse as US month/day.
  const months: Record<string, number> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11,
  };
  const named = trimmed.toLowerCase().match(/(\d{1,2})\s*(?:de\s+)?([a-zñ]{3,})\.?\s*(?:de\s+)?(\d{4})/);
  if (named) {
    const month = months[named[2].slice(0, 3)];
    if (month !== undefined) return new Date(Number(named[3]), month, Number(named[1]));
  }
  const numeric = trimmed.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numeric) return new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
  const iso = new Date(trimmed);
  if (!Number.isNaN(iso.getTime())) return iso;
  return null;
}

// The screenshot-only checks: is the image internally consistent and does it
// match the expected charge/recipient? Returns [] when the screenshot looks
// clean. This proves nothing about money actually moving — that is the bank
// ledger's job (see decideOutcome).
export function screenshotSanityReasons(
  extraction: ReceiptExtraction,
  charge: Charge | null,
  settings: PaymentSettings,
  opNumberAlreadyUsed: boolean,
  now: Date = new Date(),
): string[] {
  const reasons: string[] = [];

  if (!charge) {
    reasons.push('no_pending_charge');
  } else if (extraction.amount === null) {
    reasons.push('amount_not_readable');
  } else if (Math.abs(extraction.amount - charge.amount) > settings.amountTolerance) {
    reasons.push('amount_mismatch');
  }

  if (charge && extraction.currency && charge.currency &&
      extraction.currency.toUpperCase() !== charge.currency.toUpperCase()) {
    reasons.push('currency_mismatch');
  }

  // Recipient: the money must have gone to *this* business's Yape/Plin.
  const configuredName = extraction.provider === 'plin' ? settings.plinName : settings.yapeName;
  const configuredPhone = extraction.provider === 'plin' ? settings.plinPhone : settings.yapePhone;
  const nameOk = Boolean(extraction.recipient_name && configuredName && namesMatch(extraction.recipient_name, configuredName));
  const phoneOk = Boolean(
    extraction.recipient_phone_suffix && configuredPhone &&
    configuredPhone.replace(/\D/g, '').endsWith(extraction.recipient_phone_suffix.replace(/\D/g, '')),
  );
  if (!nameOk && !phoneOk) reasons.push('recipient_mismatch');

  if (extraction.date) {
    const parsed = parseReceiptDate(extraction.date);
    if (!parsed) {
      reasons.push('date_not_readable');
    } else {
      const ageHours = (now.getTime() - parsed.getTime()) / 3_600_000;
      // Date-only receipts parse to midnight, so allow a small future skew.
      if (ageHours > settings.dateWindowHours || ageHours < -26) reasons.push('date_out_of_window');
    }
  } else {
    reasons.push('date_not_readable');
  }

  if (!extraction.operation_number) {
    reasons.push('operation_number_missing');
  } else if (opNumberAlreadyUsed) {
    reasons.push('operation_number_reused');
  }

  if (extraction.confidence < settings.confidenceThreshold) {
    reasons.push('low_confidence');
  }

  return reasons;
}

export function verifyReceipt(
  extraction: ReceiptExtraction,
  charge: Charge | null,
  settings: PaymentSettings,
  opNumberAlreadyUsed: boolean,
  now: Date = new Date(),
): VerificationResult {
  if (!extraction.is_receipt || extraction.confidence < IS_RECEIPT_MIN_CONFIDENCE) {
    return { outcome: 'not_receipt', reasons: ['not_a_receipt'] };
  }
  const reasons = screenshotSanityReasons(extraction, charge, settings, opNumberAlreadyUsed, now);
  if (reasons.length > 0) return { outcome: 'review', reasons };
  if (!settings.autoConfirm) return { outcome: 'review', reasons: ['auto_confirm_disabled'] };
  return { outcome: 'auto_verified', reasons: [] };
}

export interface Decision {
  outcome: 'not_receipt' | 'review' | 'auto_verified' | 'recheck';
  reasons: string[];
  method?: 'bank_match' | 'screenshot_only';
}

// Production decision: layer the bank-notification ground truth on top of the
// screenshot checks. With requireBankMatch on (the production default), a clean
// screenshot only auto-confirms once a real notification is matched; until then
// it asks to be re-checked, and after the window it goes to human review.
export function decideOutcome(input: {
  extraction: ReceiptExtraction;
  charge: Charge | null;
  settings: PaymentSettings;
  opNumberUsed: boolean;
  hasBankMatch: boolean;
  tryCount: number;
  now?: Date;
}): Decision {
  const { extraction, charge, settings, opNumberUsed, hasBankMatch, tryCount } = input;
  const now = input.now ?? new Date();

  if (!extraction.is_receipt || extraction.confidence < IS_RECEIPT_MIN_CONFIDENCE) {
    return { outcome: 'not_receipt', reasons: ['not_a_receipt'] };
  }

  // A screenshot that is internally inconsistent goes to review immediately —
  // no point waiting on the bank for something that already looks wrong.
  const sanity = screenshotSanityReasons(extraction, charge, settings, opNumberUsed, now);
  if (sanity.length > 0) return { outcome: 'review', reasons: sanity };

  if (settings.requireBankMatch) {
    if (hasBankMatch) return { outcome: 'auto_verified', reasons: [], method: 'bank_match' };
    if (tryCount < settings.recheckMaxTries) return { outcome: 'recheck', reasons: ['awaiting_bank_match'] };
    return { outcome: 'review', reasons: ['no_bank_match'] };
  }

  // Screenshot-only mode (bank match not required for this business).
  if (hasBankMatch) return { outcome: 'auto_verified', reasons: [], method: 'bank_match' };
  if (!settings.autoConfirm) return { outcome: 'review', reasons: ['auto_confirm_disabled'] };
  return { outcome: 'auto_verified', reasons: [], method: 'screenshot_only' };
}

// Pick which pending charge a receipt pays: an exact amount match wins,
// otherwise a single open charge is assumed to be the one.
export function matchCharge(extraction: ReceiptExtraction, pending: Charge[], tolerance: number): Charge | null {
  if (pending.length === 0) return null;
  if (extraction.amount !== null) {
    const exact = pending.find((c) => Math.abs(c.amount - extraction.amount!) <= tolerance);
    if (exact) return exact;
  }
  return pending.length === 1 ? pending[0] : null;
}
