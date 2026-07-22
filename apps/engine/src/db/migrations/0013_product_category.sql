-- Optional free-text category for catalog products (filter chips in Catálogo + POS).
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
