-- Inventory: optional per-product stock tracking + a catalog image.
-- stock NULL = untracked (always available). track_stock gates whether the AI
-- treats stock<=0 as "agotado" and stops offering it.
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock       integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_path  text;
