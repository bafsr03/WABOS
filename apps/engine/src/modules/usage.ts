import { one, none } from '../db/index.js';
import { currentBusinessId } from '../context.js';

// Per-business AI-message metering. One row per business per calendar month
// ('YYYY-MM'); recordAiUsage increments it as the AI answers. The tier cap is
// applied in entitlements (getAiUsage) so this module has no dependency on it.

export function currentPeriod(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface UsageRow { period: string; messages: number; input_tokens: number; output_tokens: number }

// Increment the current period's counters for the current business. `messages`
// is how many delivered AI replies to count (usually 1); tokens accumulate for
// cost visibility. Upsert so the first write of the month creates the row.
export async function recordAiUsage(delta: { messages?: number; inputTokens?: number; outputTokens?: number }): Promise<void> {
  await none(`
    INSERT INTO ai_usage (business_id, period, messages, input_tokens, output_tokens)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (business_id, period) DO UPDATE SET
      messages      = ai_usage.messages + EXCLUDED.messages,
      input_tokens  = ai_usage.input_tokens + EXCLUDED.input_tokens,
      output_tokens = ai_usage.output_tokens + EXCLUDED.output_tokens
  `, [currentBusinessId(), currentPeriod(), delta.messages ?? 0, delta.inputTokens ?? 0, delta.outputTokens ?? 0]);
}

// Raw counters for the current business/period (zeros when nothing recorded yet).
export async function getUsageRow(): Promise<UsageRow> {
  const period = currentPeriod();
  const row = await one<UsageRow>(
    'SELECT period, messages, input_tokens, output_tokens FROM ai_usage WHERE business_id = $1 AND period = $2',
    [currentBusinessId(), period],
  );
  return row ?? { period, messages: 0, input_tokens: 0, output_tokens: 0 };
}
