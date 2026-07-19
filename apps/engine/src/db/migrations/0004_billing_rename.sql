-- Reconcile billing columns for databases that applied an earlier version of
-- 0003 (which used `stripe_customer_id` and lacked the subscription/provider
-- columns). Idempotent: a no-op on fresh databases where 0003 already created
-- the `billing_*` columns, a fixer on databases that predate the rename.

-- Rename stripe_customer_id → billing_customer_id only if the old column exists
-- and the new one doesn't (scoped to the current schema so tests stay isolated).
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'businesses' AND column_name = 'stripe_customer_id'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'businesses' AND column_name = 'billing_customer_id'
      )
  THEN
    ALTER TABLE businesses RENAME COLUMN stripe_customer_id TO billing_customer_id;
  END IF;
END $$;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_customer_id     text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_subscription_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_provider        text;

DROP INDEX IF EXISTS idx_businesses_stripe_customer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_billing_customer
  ON businesses (billing_customer_id) WHERE billing_customer_id IS NOT NULL;
