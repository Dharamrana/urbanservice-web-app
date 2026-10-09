CREATE TABLE IF NOT EXISTS commission_dues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL UNIQUE,
  provider_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  commission_percent REAL NOT NULL DEFAULT 10,
  commission_amount REAL NOT NULL,
  collection_method TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  status TEXT NOT NULL DEFAULT 'DUE',
  due_at INTEGER NOT NULL,
  paid_at INTEGER,
  payment_ref TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_commission_dues_provider_status ON commission_dues (provider_id, status, due_at);
