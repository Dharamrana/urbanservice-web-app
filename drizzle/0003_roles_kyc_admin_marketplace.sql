ALTER TABLE providers ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN kyc_aadhaar TEXT;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN kyc_pan TEXT;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN kyc_bank_account TEXT;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN kyc_rejection_reason TEXT;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN service_radius_km REAL NOT NULL DEFAULT 8;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN service_area_label TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  provider_id INTEGER,
  address TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
