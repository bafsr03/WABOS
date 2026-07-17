-- Platform billing (Merchant of Record) + AI-message metering + agent testing.
--
-- Adds subscription fields to businesses, a per-business/per-month AI usage
-- counter, and an is_test flag on contacts so test conversations can drive the
-- real AI pipeline without touching real WhatsApp data.

-- Subscription state on the tenant. plan_tier already exists (0001) and becomes
-- the source of truth for entitlements once billing lands. Columns are
-- provider-neutral (Lemon Squeezy today; swappable to Paddle/Mercado Pago).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_customer_id     text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_subscription_id text;   -- to fetch a fresh customer-portal URL
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_provider        text;   -- 'lemonsqueezy' | …
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_status     text;   -- active | on_trial | past_due | cancelled | expired | null
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS current_period_end      bigint; -- epoch; drives UI + monthly reset display
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_billing_customer
  ON businesses (billing_customer_id) WHERE billing_customer_id IS NOT NULL;

-- Per-business AI usage, bucketed by calendar month ('YYYY-MM'). Incremented
-- once per delivered AI reply; tokens accumulate for cost visibility.
CREATE TABLE IF NOT EXISTS ai_usage (
  business_id   bigint NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period        text   NOT NULL, -- 'YYYY-MM'
  messages      integer NOT NULL DEFAULT 0,
  input_tokens  bigint  NOT NULL DEFAULT 0,
  output_tokens bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, period)
);

-- Test contacts are flagged so their conversations can be exercised in the
-- Inbox without being counted as real CRM contacts, billed, or broadcast to.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_test integer NOT NULL DEFAULT 0;

-- Grandfather every existing tenant onto the top tier so switching the entitlement
-- source of truth from the 'plan_tier' setting (default 'pro') to the
-- businesses.plan_tier column (default 'free') doesn't suddenly gate the pilot.
-- New tenants created after this migration start on 'free' and are gated as designed.
UPDATE businesses SET plan_tier = 'enterprise' WHERE plan_tier = 'free';
