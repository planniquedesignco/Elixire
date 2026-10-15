-- Only run this if you already created a D1 database using V2 schema.
-- Do NOT run this on a fresh V3 database.
ALTER TABLE products ADD COLUMN sku TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'Uncategorised';
ALTER TABLE products ADD COLUMN compare_at_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN weight_g INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
