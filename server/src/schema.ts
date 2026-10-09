import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const services = sqliteTable("services", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  basePrice: real("base_price").notNull(),
  photoUrl: text("photo_url").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  rating: real("rating").notNull(),
  totalReviews: integer("total_reviews").notNull(),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull(),
  isVerified: integer("is_verified", { mode: "boolean" }).notNull(),
  profileImageUrl: text("profile_image_url").notNull(),
  serviceIds: text("service_ids").notNull(), // JSON number[]
  certifications: text("certifications").notNull(), // JSON string[]
  experienceYears: integer("experience_years").notNull(),
  bio: text("bio").notNull(),
  kycStatus: text("kyc_status").notNull().default("approved"), // pending | approved | rejected | not_submitted
  kycAadhaar: text("kyc_aadhaar"),
  kycPan: text("kyc_pan"),
  kycBankAccount: text("kyc_bank_account"),
  kycRejectionReason: text("kyc_rejection_reason"),
  accountStatus: text("account_status").notNull().default("active"), // active | suspended | deactivated | removed
  serviceRadiusKm: real("service_radius_km").notNull().default(8),
  serviceAreaLabel: text("service_area_label"),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  password: text("password").notNull(), // demo-only store; never returned to the client
  role: text("role").notNull(), // customer | provider | admin
  providerId: integer("provider_id"),
  address: text("address").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const bookings = sqliteTable("bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceId: integer("service_id").notNull(),
  providerId: integer("provider_id"),
  status: text("status").notNull(),
  description: text("description").notNull().default(""),
  address: text("address").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  scheduledDate: text("scheduled_date").notNull(),
  scheduledSlot: text("scheduled_slot").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  paymentRef: text("payment_ref"),
  visitingFee: real("visiting_fee").notNull(),
  finalPrice: real("final_price").notNull(),
  startOtp: text("start_otp"),
  otpVerified: integer("otp_verified", { mode: "boolean" }).notNull().default(false),
  rating: integer("rating"),
  review: text("review"),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const bookingItems = sqliteTable("booking_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookingId: integer("booking_id").notNull(),
  serviceId: integer("service_id").notNull(),
  serviceName: text("service_name").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
});
