import { describe, it, expect } from 'vitest';
import { decideReminder, parseOffsets, renderReminder, type ReminderPolicy } from './reminders.js';
import type { Charge } from './charges.js';

const HOUR = 3600;
const DUE = 1_000_000; // arbitrary epoch seconds
const at = (offsetHours: number) => new Date((DUE + offsetHours * HOUR) * 1000);

const policy: ReminderPolicy = { enabled: true, offsetsHours: [24, 72], overdueAfterHours: 168 };

function charge(over: Partial<Pick<Charge, 'status' | 'due_at' | 'reminder_count'>> = {}) {
  return { status: 'pending' as const, due_at: DUE, reminder_count: 0, ...over };
}

describe('parseOffsets', () => {
  it('parses, sorts, de-dupes and drops junk', () => {
    expect(parseOffsets('72, 24 ,24, -5, abc, 0')).toEqual([0, 24, 72]);
  });
  it('handles empty input', () => {
    expect(parseOffsets('')).toEqual([]);
  });
});

describe('decideReminder', () => {
  it('does nothing before the first offset is due', () => {
    expect(decideReminder(charge(), policy, at(23)).action).toBe('none');
  });

  it('fires the first reminder once its offset passes', () => {
    expect(decideReminder(charge({ reminder_count: 0 }), policy, at(25))).toEqual({ action: 'remind', nextCount: 1 });
  });

  it('waits for the second offset after the first was sent', () => {
    expect(decideReminder(charge({ reminder_count: 1 }), policy, at(25)).action).toBe('none');
    expect(decideReminder(charge({ reminder_count: 1 }), policy, at(73))).toEqual({ action: 'remind', nextCount: 2 });
  });

  it('stops nudging once all offsets are spent', () => {
    expect(decideReminder(charge({ reminder_count: 2 }), policy, at(100)).action).toBe('none');
  });

  it('expires past the overdue window regardless of reminder state', () => {
    expect(decideReminder(charge({ reminder_count: 2 }), policy, at(169))).toEqual({ action: 'expire' });
  });

  it('still expires even when reminders are disabled', () => {
    const off: ReminderPolicy = { ...policy, enabled: false };
    expect(decideReminder(charge(), off, at(169))).toEqual({ action: 'expire' });
    expect(decideReminder(charge(), off, at(25)).action).toBe('none'); // but never reminds
  });

  it('ignores non-pending or undated charges', () => {
    expect(decideReminder(charge({ status: 'paid' }), policy, at(200)).action).toBe('none');
    expect(decideReminder(charge({ due_at: null }), policy, at(200)).action).toBe('none');
  });
});

describe('renderReminder', () => {
  it('fills amount, currency symbol and concept', () => {
    const c = { amount: 50, currency: 'PEN', concept: '2 polos' } as Charge;
    expect(renderReminder('Debes {{currency}} {{amount}} ({{concept}})', c)).toBe('Debes S/ 50.00 (2 polos)');
  });
  it('falls back for an empty concept', () => {
    const c = { amount: 20, currency: 'USD', concept: '' } as Charge;
    expect(renderReminder('{{currency}} {{amount}} - {{concept}}', c)).toBe('USD 20.00 - tu pago');
  });
});
