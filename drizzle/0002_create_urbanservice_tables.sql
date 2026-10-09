CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  base_price REAL NOT NULL,
  photo_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  rating REAL NOT NULL,
  total_reviews INTEGER NOT NULL,
  is_available INTEGER NOT NULL,
  is_verified INTEGER NOT NULL,
  profile_image_url TEXT NOT NULL,
  service_ids TEXT NOT NULL,
  certifications TEXT NOT NULL,
  experience_years INTEGER NOT NULL,
  bio TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  provider_id INTEGER,
  status TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  scheduled_slot TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_ref TEXT,
  visiting_fee REAL NOT NULL,
  final_price REAL NOT NULL,
  start_otp TEXT,
  otp_verified INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  review TEXT,
  requested_at INTEGER NOT NULL,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS entries;
