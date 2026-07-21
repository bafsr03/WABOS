-- Collections: payment reminders + overdue tracking.
-- Charges already carry due_at and an 'expired' status; these columns let the
-- reminder scheduler remember how far it has chased each unpaid charge.
ALTER TABLE charges ADD COLUMN IF NOT EXISTS last_reminded_at bigint;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS reminder_count   integer NOT NULL DEFAULT 0;

-- The scheduler sweeps pending charges by due date; index the hot predicate.
CREATE INDEX IF NOT EXISTS idx_charges_due ON charges(status, due_at) WHERE due_at IS NOT NULL;
