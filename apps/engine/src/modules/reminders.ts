import type { Charge } from './charges.js';

// Pure collections rules engine: given a pending charge, the reminder schedule
// and the current time, decide what to do next. No I/O — unit-testable in
// isolation (mirrors verification.ts).
//
// Model: `offsetsHours` are hours *after* due_at at which to nudge, in order.
// The Nth reminder (0-indexed by reminder_count) fires once now has passed
// due_at + offsets[reminder_count]. Once every offset is spent the charge just
// waits; past overdueAfterHours it flips to 'expired'.

export interface ReminderPolicy {
  enabled: boolean;
  offsetsHours: number[];   // e.g. [24, 72]
  overdueAfterHours: number; // e.g. 168 (7d)
}

export type ReminderAction =
  | { action: 'none' }
  | { action: 'remind'; nextCount: number }
  | { action: 'expire' };

// Parse "24,72" (or "0, 24 , 72") into a sorted, de-duped, non-negative list.
export function parseOffsets(raw: string): number[] {
  const nums = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

export function decideReminder(
  charge: Pick<Charge, 'status' | 'due_at' | 'reminder_count'>,
  policy: ReminderPolicy,
  now: Date = new Date(),
): ReminderAction {
  if (charge.status !== 'pending' || charge.due_at === null) return { action: 'none' };
  const nowSec = Math.floor(now.getTime() / 1000);

  // Overdue takes precedence: stop chasing and expire.
  if (nowSec >= charge.due_at + policy.overdueAfterHours * 3600) return { action: 'expire' };

  if (!policy.enabled) return { action: 'none' };

  const count = charge.reminder_count;
  if (count >= policy.offsetsHours.length) return { action: 'none' }; // all nudges spent
  const dueThreshold = charge.due_at + policy.offsetsHours[count] * 3600;
  if (nowSec >= dueThreshold) return { action: 'remind', nextCount: count + 1 };
  return { action: 'none' };
}

// Fill the reminder template with the charge's fields (same tokens as the
// payment confirmation template).
export function renderReminder(template: string, charge: Charge): string {
  return template
    .replaceAll('{{amount}}', charge.amount.toFixed(2))
    .replaceAll('{{currency}}', charge.currency === 'PEN' ? 'S/' : charge.currency)
    .replaceAll('{{concept}}', charge.concept || 'tu pago');
}
