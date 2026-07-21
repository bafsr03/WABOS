import { describe, it, expect } from 'vitest';
import { verifyReceipt, decideOutcome, matchCharge, namesMatch, parseReceiptDate, type ReceiptExtraction } from './verification.js';
import type { Charge, PaymentSettings } from './charges.js';

const NOW = new Date('2026-07-09T12:00:00-05:00');

const settings: PaymentSettings = {
  yapeName: 'Maria Fernanda Quispe Alvarez',
  yapePhone: '987654789',
  plinName: 'Maria Quispe',
  plinPhone: '987654789',
  autoConfirm: true,
  amountTolerance: 0.1,
  dateWindowHours: 48,
  confidenceThreshold: 0.85,
  downloadPolicy: 'pending_charge',
  confirmationTemplate: '¡Pago de {{currency}} {{amount}} confirmado!',
  requireBankMatch: false,
  groundTruthSource: 'off',
  matchWindowMinutes: 180,
  recheckIntervalSeconds: 45,
  recheckMaxTries: 4,
  webhookSecret: '',
  handoffOnReview: true,
  remindersEnabled: false,
  reminderOffsetsHours: '24,72',
  overdueAfterHours: 168,
  reminderTemplate: 'Recordatorio: {{currency}} {{amount}}',
};

const charge: Charge = {
  id: 1, contact_id: 1, amount: 150, currency: 'PEN', concept: 'Pedido #12',
  status: 'pending', created_by: 'dashboard', due_at: null, paid_at: null, receipt_id: null,
  last_reminded_at: null, reminder_count: 0,
  created_at: Math.floor(NOW.getTime() / 1000),
};

const goodExtraction: ReceiptExtraction = {
  is_receipt: true,
  provider: 'yape',
  amount: 150,
  currency: 'PEN',
  date: '09 jul. 2026 - 10:23 am',
  operation_number: '01234567',
  sender_name: 'Juan Perez',
  recipient_name: 'Maria F. Quispe A.',
  recipient_phone_suffix: '789',
  confidence: 0.95,
};

describe('verifyReceipt', () => {
  it('auto-verifies a consistent receipt when auto-confirm is on', () => {
    const result = verifyReceipt(goodExtraction, charge, settings, false, NOW);
    expect(result).toEqual({ outcome: 'auto_verified', reasons: [] });
  });

  it('caps to review when auto-confirm is disabled', () => {
    const result = verifyReceipt(goodExtraction, charge, { ...settings, autoConfirm: false }, false, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toEqual(['auto_confirm_disabled']);
  });

  it('flags non-receipts', () => {
    const result = verifyReceipt({ ...goodExtraction, is_receipt: false }, charge, settings, false, NOW);
    expect(result.outcome).toBe('not_receipt');
  });

  it('treats very low confidence as not a receipt', () => {
    const result = verifyReceipt({ ...goodExtraction, confidence: 0.2 }, charge, settings, false, NOW);
    expect(result.outcome).toBe('not_receipt');
  });

  it('sends amount mismatches to review', () => {
    const result = verifyReceipt({ ...goodExtraction, amount: 100 }, charge, settings, false, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('amount_mismatch');
  });

  it('tolerates rounding within the configured tolerance', () => {
    const result = verifyReceipt({ ...goodExtraction, amount: 150.05 }, charge, settings, false, NOW);
    expect(result.outcome).toBe('auto_verified');
  });

  it('sends reused operation numbers to review (fraud gate)', () => {
    const result = verifyReceipt(goodExtraction, charge, settings, true, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('operation_number_reused');
  });

  it('sends wrong recipients to review', () => {
    const result = verifyReceipt(
      { ...goodExtraction, recipient_name: 'Pedro G. Lopez R.', recipient_phone_suffix: '111' },
      charge, settings, false, NOW,
    );
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('recipient_mismatch');
  });

  it('accepts a matching phone suffix even when the name is unreadable', () => {
    const result = verifyReceipt({ ...goodExtraction, recipient_name: null }, charge, settings, false, NOW);
    expect(result.outcome).toBe('auto_verified');
  });

  it('sends stale receipts to review', () => {
    const result = verifyReceipt({ ...goodExtraction, date: '01 jul. 2026 - 10:23 am' }, charge, settings, false, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('date_out_of_window');
  });

  it('sends receipts without a pending charge to review', () => {
    const result = verifyReceipt(goodExtraction, null, settings, false, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('no_pending_charge');
  });

  it('sends low-confidence extractions to review', () => {
    const result = verifyReceipt({ ...goodExtraction, confidence: 0.7 }, charge, settings, false, NOW);
    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('low_confidence');
  });

  it('collects multiple failure reasons', () => {
    const result = verifyReceipt(
      { ...goodExtraction, amount: 90, operation_number: null, date: null },
      charge, settings, false, NOW,
    );
    expect(result.reasons).toEqual(
      expect.arrayContaining(['amount_mismatch', 'operation_number_missing', 'date_not_readable']),
    );
  });
});

describe('decideOutcome (bank-match)', () => {
  const strict: PaymentSettings = { ...settings, requireBankMatch: true };

  it('auto-verifies on a real bank match', () => {
    const d = decideOutcome({ extraction: goodExtraction, charge, settings: strict, opNumberUsed: false, hasBankMatch: true, tryCount: 0, now: NOW });
    expect(d).toEqual({ outcome: 'auto_verified', reasons: [], method: 'bank_match' });
  });

  it('asks for a re-check while no notification has arrived yet', () => {
    const d = decideOutcome({ extraction: goodExtraction, charge, settings: strict, opNumberUsed: false, hasBankMatch: false, tryCount: 0, now: NOW });
    expect(d.outcome).toBe('recheck');
  });

  it('falls to review after the re-check window with no bank match', () => {
    const d = decideOutcome({ extraction: goodExtraction, charge, settings: strict, opNumberUsed: false, hasBankMatch: false, tryCount: 4, now: NOW });
    expect(d.outcome).toBe('review');
    expect(d.reasons).toContain('no_bank_match');
  });

  it('never waits on the bank for an inconsistent screenshot (forgery with wrong amount)', () => {
    const d = decideOutcome({ extraction: { ...goodExtraction, amount: 999 }, charge, settings: strict, opNumberUsed: false, hasBankMatch: false, tryCount: 0, now: NOW });
    expect(d.outcome).toBe('review');
    expect(d.reasons).toContain('amount_mismatch');
  });

  it('screenshot-only mode auto-confirms a clean screenshot without a bank match', () => {
    const d = decideOutcome({ extraction: goodExtraction, charge, settings, opNumberUsed: false, hasBankMatch: false, tryCount: 0, now: NOW });
    expect(d.outcome).toBe('auto_verified');
    expect(d.method).toBe('screenshot_only');
  });
});

describe('matchCharge', () => {
  const other: Charge = { ...charge, id: 2, amount: 80 };

  it('prefers an exact amount match', () => {
    expect(matchCharge(goodExtraction, [other, charge], 0.1)?.id).toBe(1);
  });

  it('falls back to a single open charge', () => {
    expect(matchCharge({ ...goodExtraction, amount: null }, [other], 0.1)?.id).toBe(2);
  });

  it('returns null when several charges are open and none matches the amount', () => {
    expect(matchCharge({ ...goodExtraction, amount: 999 }, [other, charge], 0.1)).toBeNull();
  });
});

describe('namesMatch', () => {
  it('matches Yape-style abbreviated names', () => {
    expect(namesMatch('Maria F. Quispe A.', 'Maria Fernanda Quispe Alvarez')).toBe(true);
    expect(namesMatch('MARIA F. Q.', 'María Fernanda Quispe')).toBe(true);
  });

  it('rejects different names', () => {
    expect(namesMatch('Pedro G. Lopez', 'Maria Fernanda Quispe')).toBe(false);
  });
});

describe('parseReceiptDate', () => {
  it('parses Peru-style dates', () => {
    expect(parseReceiptDate('09 jul. 2026 - 10:23 am')?.getMonth()).toBe(6);
    expect(parseReceiptDate('09/07/2026 10:23')?.getDate()).toBe(9);
    expect(parseReceiptDate('9 de julio de 2026')?.getFullYear()).toBe(2026);
  });

  it('returns null for garbage', () => {
    expect(parseReceiptDate('no date here')).toBeNull();
  });
});
