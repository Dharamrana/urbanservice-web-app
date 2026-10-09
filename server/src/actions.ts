import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const VISITING_FEE = 49;
const DEFAULT_COMMISSION_PERCENT = 10;
// Commission a provider owes the platform when they collect a completed
// job's amount directly (cash or their own UPI QR): 10% of the job amount,
// payable within 24 hours of completion. Overdue dues pause new jobs.
const PROVIDER_COMMISSION_PERCENT = 10;
const COMMISSION_DUE_MS = 24 * 60 * 60 * 1000;
const PLATFORM_UPI_ID = "urbanservice@okaxis";
const ADMIN_INVITE_CODE = "ADMIN2026";
const DAILY_SLOTS = ["08:00-10:00","10:00-12:00","12:00-14:00","14:00-16:00","16:00-18:00","18:00-20:00"] as const;
const STATUSES = ["PENDING","ASSIGNED","IN_PROGRESS","COMPLETED","CANCELLED","REJECTED"] as const;
type Status = (typeof STATUSES)[number];

const TRANSITIONS: Record<Status, Status[]> = {
  PENDING: ["ASSIGNED","CANCELLED","REJECTED"],
  ASSIGNED: ["IN_PROGRESS","CANCELLED","REJECTED","ASSIGNED"],
  IN_PROGRESS: ["COMPLETED","CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: ["ASSIGNED"],
};

const SERVICES_SEED = [
  { id: 1, name: "Carpenter", description: "Furniture repair, installation, and custom woodwork", basePrice: 499, photoUrl: "https://www.designhubae.com/files/2026-05/carpentry-6.jpeg?6cb801a69f", sortOrder: 1 },
  { id: 2, name: "Electrician", description: "Electrical wiring, switch/socket repair, light fixture installation", basePrice: 399, photoUrl: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=600&h=400&fit=crop", sortOrder: 2 },
  { id: 3, name: "Plumber", description: "Pipe repair, leak fixing, bathroom fitting, and water line services", basePrice: 349, photoUrl: "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600&h=400&fit=crop", sortOrder: 3 },
  { id: 4, name: "Massage Therapist", description: "Professional massage therapy for relaxation and wellness", basePrice: 799, photoUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=400&fit=crop", sortOrder: 4 },
  { id: 5, name: "House Cleaning", description: "Deep cleaning, vacuuming, dusting, and mopping services", basePrice: 499, photoUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&h=400&fit=crop", sortOrder: 5 },
  { id: 6, name: "AC Repair", description: "Air conditioner servicing, installation, and repair", basePrice: 699, photoUrl: "https://www.nucleuspoint.ae/img_org/ac_service.jpg", sortOrder: 6 },
  { id: 7, name: "Appliance Repair", description: "Washing machine, refrigerator, microwave oven repair", basePrice: 599, photoUrl: "https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=600&h=400&fit=crop", sortOrder: 7 },
  { id: 8, name: "Painter", description: "Interior and exterior painting, wall texture, and finishing", basePrice: 449, photoUrl: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&h=400&fit=crop", sortOrder: 8 },
] as const;

const PROVIDERS_SEED = [
  { id: 1, name: "Amit Verma", email: "amit@example.com", phone: "9876501234", address: "Prem Nagar, Dehradun", latitude: 30.3435, longitude: 77.9632, rating: 4.8, totalReviews: 120, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face", serviceIds: [1,8], certifications: ["Certified Carpenter","Furniture Making"], experienceYears: 10, bio: "Experienced carpenter with 10+ years in furniture making and repair." },
  { id: 2, name: "Sneha Gupta", email: "sneha@example.com", phone: "9876501235", address: "Sudhowala, Dehradun", latitude: 30.3548, longitude: 77.9831, rating: 4.7, totalReviews: 95, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face", serviceIds: [2], certifications: ["Licensed Electrician","LED Specialist"], experienceYears: 7, bio: "Licensed electrician specializing in LED lighting and residential wiring." },
  { id: 3, name: "Rameshwar Das", email: "rameshwar@example.com", phone: "9876501236", address: "Kheri Gaon, Dehradun", latitude: 30.3291, longitude: 77.9485, rating: 4.6, totalReviews: 80, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face", serviceIds: [3], certifications: ["Certified Plumber"], experienceYears: 8, bio: "Plumber with expertise in bathroom fitting and water line repair." },
  { id: 4, name: "Pooja Srivastava", email: "pooja@example.com", phone: "9876501237", address: "Ballupur, Dehradun", latitude: 30.3342, longitude: 78.0131, rating: 4.9, totalReviews: 150, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face", serviceIds: [4], certifications: ["Certified Massage Therapist","Yoga Instructor"], experienceYears: 6, bio: "Certified massage therapist offering therapeutic and relaxation massages." },
  { id: 5, name: "Manoj Tiwari", email: "manoj@example.com", phone: "9876501238", address: "Rajpur Road, Dehradun", latitude: 30.3561, longitude: 78.0592, rating: 4.3, totalReviews: 65, isAvailable: false, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face", serviceIds: [5], certifications: ["Professional Cleaner"], experienceYears: 5, bio: "Professional cleaner with experience in residential and commercial cleaning." },
  { id: 6, name: "Deepak Chauhan", email: "deepak@example.com", phone: "9876501239", address: "Clement Town, Dehradun", latitude: 30.2725, longitude: 78.0428, rating: 4.5, totalReviews: 70, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face", serviceIds: [6], certifications: ["AC Certified Technician"], experienceYears: 9, bio: "AC technician certified with 9 years of experience in all major brands." },
  { id: 7, name: "Kavita Mishra", email: "kavita@example.com", phone: "9876501240", address: "Vasant Vihar, Dehradun", latitude: 30.3164, longitude: 77.9988, rating: 4.2, totalReviews: 55, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&h=200&fit=crop&crop=face", serviceIds: [7], certifications: ["Appliance Repair Specialist"], experienceYears: 6, bio: "Specialist in appliance repair with quick turnaround time." },
  { id: 8, name: "Anil Kumar", email: "anil@example.com", phone: "9876501241", address: "Sahastradhara Road, Dehradun", latitude: 30.3455, longitude: 78.0751, rating: 4.4, totalReviews: 90, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&h=200&fit=crop&crop=face", serviceIds: [8], certifications: ["Licensed Painter","Wall Texture Expert"], experienceYears: 12, bio: "Licensed painter with 12 years of experience in interior and exterior painting." },
  // Marketplace expansion (explicitly requested mock data): KYC queue + status variety for the admin console.
  { id: 9, name: "Rohit Sharma", email: "rohit.sharma@example.com", phone: "9811042109", address: "Prem Nagar, Dehradun", latitude: 30.3451, longitude: 77.9654, rating: 4.6, totalReviews: 38, isAvailable: true, isVerified: false, profileImageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face", serviceIds: [1,3], certifications: ["Certified Carpenter"], experienceYears: 6, bio: "Carpenter and plumbing assistant serving Prem Nagar and Sudhowala. KYC documents submitted and awaiting verification.", kycStatus: "pending", kycAadhaar: "XXXX-XXXX-4210", kycPan: "BXKPS4210R", kycBankAccount: "XXXXXX2109", accountStatus: "active", serviceRadiusKm: 10, serviceAreaLabel: "Prem Nagar, Dehradun" },
  { id: 10, name: "Neha Patel", email: "neha.patel@example.com", phone: "9811042110", address: "Sudhowala, Dehradun", latitude: 30.3529, longitude: 77.9798, rating: 4.8, totalReviews: 44, isAvailable: true, isVerified: false, profileImageUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop&crop=face", serviceIds: [5], certifications: ["Professional Cleaner","Deep-Clean Specialist"], experienceYears: 4, bio: "Home deep-cleaning specialist for homes in Sudhowala and Prem Nagar. KYC submitted for review.", kycStatus: "pending", kycAadhaar: "XXXX-XXXX-8841", kycPan: "CTAPP8841N", kycBankAccount: "XXXXXX8841", accountStatus: "active", serviceRadiusKm: 7, serviceAreaLabel: "Sudhowala, Dehradun" },
  { id: 11, name: "Arjun Mehta", email: "arjun.mehta@example.com", phone: "9811042111", address: "Kheri Gaon, Dehradun", latitude: 30.3268, longitude: 77.9502, rating: 4.1, totalReviews: 21, isAvailable: false, isVerified: false, profileImageUrl: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=200&h=200&fit=crop&crop=face", serviceIds: [6,7], certifications: ["AC Certified Technician"], experienceYears: 5, bio: "AC and appliance repair technician in Kheri Gaon and Prem Nagar. KYC was rejected once and needs clearer documents.", kycStatus: "rejected", kycAadhaar: "XXXX-XXXX-1093", kycPan: "DQWPM1093A", kycBankAccount: "XXXXXX1093", kycRejectionReason: "Aadhaar photo is blurry. Please re-upload a clear front image and a self-attested PAN copy.", accountStatus: "active", serviceRadiusKm: 9, serviceAreaLabel: "Kheri Gaon, Dehradun" },
  { id: 12, name: "Priya Nair", email: "priya.nair@example.com", phone: "9811042112", address: "Clement Town, Dehradun", latitude: 30.2749, longitude: 78.0395, rating: 4.7, totalReviews: 67, isAvailable: true, isVerified: true, profileImageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face", serviceIds: [4,5], certifications: ["Certified Massage Therapist"], experienceYears: 8, bio: "Wellness therapist and home-cleaning lead in Clement Town. Account is currently suspended pending a quality review.", kycStatus: "approved", kycAadhaar: "XXXX-XXXX-5520", kycPan: "ALWPN5520P", kycBankAccount: "XXXXXX5520", accountStatus: "suspended", serviceRadiusKm: 12, serviceAreaLabel: "Clement Town, Dehradun" },
] as const;

const USERS_SEED = [
  { name: "Platform Admin", email: "admin@urbanservice.in", phone: "9000000001", password: "admin123", role: "admin", providerId: null as number | null, address: "UrbanService HQ, Prem Nagar, Dehradun" },
  { name: "Rajesh Kumar", email: "rajesh@example.com", phone: "9876502001", password: "customer123", role: "customer", providerId: null as number | null, address: "B-42, Prem Nagar, Dehradun" },
  { name: "Amit Verma", email: "amit@example.com", phone: "9876501234", password: "provider123", role: "provider", providerId: 1 as number | null, address: "Prem Nagar, Dehradun" },
  { name: "Sneha Gupta", email: "sneha@example.com", phone: "9876501235", password: "provider123", role: "provider", providerId: 2 as number | null, address: "Sudhowala, Dehradun" },
] as const;

function ok<T>(data: T) { return { success: true as const, ...data, error: null as string | null }; }

// Demo-auth password storage: SHA-256 hashes only, never plaintext at rest.
// (The seeded demo passwords live only in this server module; clients never
// receive them — demo sign-in goes through the demoLogin action.)
async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`urbanservice:${password}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
const DEMO_EMAIL_BY_ROLE: Record<string, string> = {
  customer: "rajesh@example.com",
  provider: "amit@example.com",
  admin: "admin@urbanservice.in",
};

const errOnly = z.object({ success: z.boolean(), error: z.string().nullable() });

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function tomorrowIST(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}
function parseJsonArr<T>(s: string): T[] { try { const v = JSON.parse(s); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } }

type ProviderSeedRow = (typeof PROVIDERS_SEED)[number];
function providerInsert(p: ProviderSeedRow) {
  const extra = p as unknown as Record<string, unknown>;
  return {
    id: p.id, name: p.name, email: p.email, phone: p.phone, address: p.address,
    latitude: p.latitude, longitude: p.longitude, rating: p.rating, totalReviews: p.totalReviews,
    isAvailable: p.isAvailable, isVerified: p.isVerified, profileImageUrl: p.profileImageUrl,
    serviceIds: JSON.stringify(p.serviceIds), certifications: JSON.stringify(p.certifications),
    experienceYears: p.experienceYears, bio: p.bio,
    kycStatus: typeof extra.kycStatus === "string" ? extra.kycStatus : (p.isVerified ? "approved" : "not_submitted"),
    kycAadhaar: typeof extra.kycAadhaar === "string" ? extra.kycAadhaar : null,
    kycPan: typeof extra.kycPan === "string" ? extra.kycPan : null,
    kycBankAccount: typeof extra.kycBankAccount === "string" ? extra.kycBankAccount : null,
    kycRejectionReason: typeof extra.kycRejectionReason === "string" ? extra.kycRejectionReason : null,
    accountStatus: typeof extra.accountStatus === "string" ? extra.accountStatus : "active",
    serviceRadiusKm: typeof extra.serviceRadiusKm === "number" ? extra.serviceRadiusKm : 8,
    serviceAreaLabel: typeof extra.serviceAreaLabel === "string" ? extra.serviceAreaLabel : p.address,
  };
}

async function ensureSeeded(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  // Self-healing catalogue: the 8 core services must always exist, be active,
  // and carry the canonical name/description/price/photo. If rows were deleted
  // (partially or entirely), deactivated, or edited away, restore them here on
  // every load so Home / All Services never render an empty catalogue.
  const allServices = await db.select().from(schema.services);
  for (const seed of SERVICES_SEED) {
    const row = allServices.find((r) => r.id === seed.id);
    if (!row) {
      await db.insert(schema.services).values({ ...seed, isActive: true });
      continue;
    }
    const drifted =
      row.name !== seed.name ||
      row.description !== seed.description ||
      row.basePrice !== seed.basePrice ||
      row.photoUrl !== seed.photoUrl ||
      row.sortOrder !== seed.sortOrder ||
      row.isActive !== true;
    if (drifted) {
      await db.update(schema.services).set({
        name: seed.name, description: seed.description, basePrice: seed.basePrice,
        photoUrl: seed.photoUrl, sortOrder: seed.sortOrder, isActive: true,
      }).where(eq(schema.services.id, seed.id));
    }
  }
  const pExisting = await db.select().from(schema.providers).limit(1);
  if (pExisting.length === 0) {
    await db.insert(schema.providers).values(PROVIDERS_SEED.map((p) => providerInsert(p)));
  } else {
    // Backfill marketplace-expansion providers on databases created by earlier builds.
    const all = await db.select({ id: schema.providers.id }).from(schema.providers);
    const have = new Set(all.map((r) => r.id));
    const missing = PROVIDERS_SEED.filter((p) => p.id >= 9 && !have.has(p.id));
    if (missing.length > 0) {
      await db.insert(schema.providers).values(missing.map((p) => providerInsert(p)));
    }
    // Migrate legacy Delhi-centred rows to Dehradun (Prem Nagar / Sudhowala / Kheri Gaon...).
    // Only rows still sitting in the Delhi bbox are touched, so a provider's own
    // Dehradun service-area choice is never overwritten.
    const allProviders = await db.select().from(schema.providers);
    for (const seed of PROVIDERS_SEED) {
      const existing = allProviders.find((r) => r.id === seed.id);
      if (!existing) continue;
      const inDelhi = existing.latitude >= 28 && existing.latitude < 29.5 && existing.longitude >= 76.5 && existing.longitude < 78;
      if (inDelhi) {
        const ins = providerInsert(seed);
        await db.update(schema.providers).set({
          address: ins.address, latitude: ins.latitude, longitude: ins.longitude,
          serviceAreaLabel: ins.serviceAreaLabel, bio: ins.bio,
        }).where(eq(schema.providers.id, seed.id));
      }
    }
  }
  const uExisting = await db.select().from(schema.users).limit(1);
  if (uExisting.length === 0) {
    const hashed = await Promise.all(USERS_SEED.map(async (u) => ({ name: u.name, email: u.email, phone: u.phone, password: await hashPassword(u.password), role: u.role, providerId: u.providerId, address: u.address })));
    await db.insert(schema.users).values(hashed);
  } else {
    // Migrate any legacy plaintext demo passwords to hashes in place.
    const allUsers = await db.select().from(schema.users);
    for (const u of allUsers) {
      if (!u.password.startsWith("sha256:")) {
        await db.update(schema.users).set({ password: await hashPassword(u.password) }).where(eq(schema.users.id, u.id));
      }
    }
  }
  const sExisting = await db.select().from(schema.platformSettings).limit(1);
  if (sExisting.length === 0) {
    await db.insert(schema.platformSettings).values([
      { key: "visitingFee", value: String(VISITING_FEE) },
      { key: "commissionPercent", value: String(DEFAULT_COMMISSION_PERCENT) },
      { key: "supportEmail", value: "support@urbanservice.in" },
      { key: "supportPhone", value: "+91 90000 00001" },
      { key: "maintenanceMode", value: "false" },
    ]);
  }
}

async function getSettingsMap(ctx: Ctx): Promise<Record<string, string>> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.platformSettings);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function toISO(d: Date | number | null | undefined): string | null {
  if (d == null) return null;
  return (d instanceof Date ? d : new Date(d as unknown as number)).toISOString();
}

type CommissionDueRow = typeof schema.commissionDues.$inferSelect;

function expandDue(r: CommissionDueRow) {
  return {
    id: r.id, bookingId: r.bookingId, providerId: r.providerId,
    amount: r.amount, commissionPercent: r.commissionPercent, commissionAmount: r.commissionAmount,
    collectionMethod: r.collectionMethod, status: r.status,
    dueAt: toISO(r.dueAt) ?? new Date().toISOString(), paidAt: toISO(r.paidAt), paymentRef: r.paymentRef,
    overdue: r.status === "DUE" && (r.dueAt instanceof Date ? r.dueAt : new Date(r.dueAt as unknown as number)).getTime() < Date.now(),
  };
}
type CommissionDueOut = ReturnType<typeof expandDue>;

async function ensureCommissionDue(ctx: Ctx, b: typeof schema.bookings.$inferSelect): Promise<CommissionDueOut | null> {
  if (b.providerId == null || b.status !== "COMPLETED") return null;
  const db = ctx.db<typeof schema>();
  const [existing] = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.bookingId, b.id)).limit(1);
  if (existing) return expandDue(existing);
  const completedAt = b.completedAt instanceof Date ? b.completedAt : b.completedAt ? new Date(b.completedAt as unknown as number) : new Date();
  const paidOnline = b.paymentStatus === "PAID";
  const commissionAmount = Math.round(b.finalPrice * PROVIDER_COMMISSION_PERCENT) / 100;
  const [row] = await db.insert(schema.commissionDues).values({
    bookingId: b.id, providerId: b.providerId, amount: b.finalPrice,
    commissionPercent: PROVIDER_COMMISSION_PERCENT, commissionAmount,
    collectionMethod: paidOnline ? "ONLINE" : "UNCONFIRMED",
    status: paidOnline ? "PAID" : "DUE",
    dueAt: new Date(completedAt.getTime() + COMMISSION_DUE_MS),
    paidAt: paidOnline ? completedAt : null,
    paymentRef: paidOnline ? (b.paymentRef ?? "ONLINE") : null,
  }).returning();
  return row ? expandDue(row) : null;
}

async function getCommissionState(ctx: Ctx, providerId: number) {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.providerId, providerId)).orderBy(desc(schema.commissionDues.createdAt));
  const dues: (CommissionDueOut & { customerName: string; serviceName: string })[] = [];
  for (const r of rows) {
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, r.bookingId)).limit(1);
    const items = b ? await db.select().from(schema.bookingItems).where(eq(schema.bookingItems.bookingId, b.id)).limit(1) : [];
    dues.push({ ...expandDue(r), customerName: b?.customerName ?? "Customer", serviceName: items[0]?.serviceName ?? "Service" });
  }
  const open = dues.filter((d) => d.status === "DUE");
  const overdue = open.filter((d) => d.overdue);
  return {
    percent: PROVIDER_COMMISSION_PERCENT,
    platformUpiId: PLATFORM_UPI_ID,
    totalDue: Math.round(open.reduce((n, d) => n + d.commissionAmount, 0) * 100) / 100,
    overdueAmount: Math.round(overdue.reduce((n, d) => n + d.commissionAmount, 0) * 100) / 100,
    blocked: overdue.length > 0,
    dues,
  };
}

async function blockedProviderIds(ctx: Ctx): Promise<Set<number>> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.status, "DUE"));
  const now = Date.now();
  const out = new Set<number>();
  for (const r of rows) {
    const dueMs = (r.dueAt instanceof Date ? r.dueAt : new Date(r.dueAt as unknown as number)).getTime();
    if (dueMs < now) out.add(r.providerId);
  }
  return out;
}

async function expandBooking(ctx: Ctx, b: typeof schema.bookings.$inferSelect) {
  const db = ctx.db<typeof schema>();
  const items = await db.select().from(schema.bookingItems).where(eq(schema.bookingItems.bookingId, b.id)).orderBy(asc(schema.bookingItems.id));
  let providerName: string | null = null;
  let providerPhone: string | null = null;
  if (b.providerId != null) {
    const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, b.providerId)).limit(1);
    providerName = p?.name ?? null;
    providerPhone = p?.phone ?? null;
  }
  const [dueRow] = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.bookingId, b.id)).limit(1);
  return {
    id: b.id, serviceId: b.serviceId, providerId: b.providerId, providerName, providerPhone,
    status: b.status, description: b.description, address: b.address,
    customerName: b.customerName, customerPhone: b.customerPhone,
    scheduledDate: b.scheduledDate, scheduledSlot: b.scheduledSlot,
    paymentMethod: b.paymentMethod, paymentStatus: b.paymentStatus, paymentRef: b.paymentRef,
    visitingFee: b.visitingFee, finalPrice: b.finalPrice,
    startOtp: b.startOtp, otpVerified: b.otpVerified, rating: b.rating, review: b.review,
    requestedAt: (b.requestedAt instanceof Date ? b.requestedAt : new Date(b.requestedAt as unknown as number)).toISOString(),
    completedAt: b.completedAt ? (b.completedAt instanceof Date ? b.completedAt : new Date(b.completedAt as unknown as number)).toISOString() : null,
    commission: dueRow ? expandDue(dueRow) : null,
    items: items.map((i) => ({ id: i.id, serviceId: i.serviceId, serviceName: i.serviceName, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.unitPrice * i.quantity })),
  };
}
type BookingOut = Awaited<ReturnType<typeof expandBooking>>;

const commissionDueSchema = z.object({
  id: z.number(), bookingId: z.number(), providerId: z.number(),
  amount: z.number(), commissionPercent: z.number(), commissionAmount: z.number(),
  collectionMethod: z.string(), status: z.string(),
  dueAt: z.string(), paidAt: z.string().nullable(), paymentRef: z.string().nullable(),
  overdue: z.boolean(),
});
const commissionStateSchema = z.object({
  percent: z.number(), platformUpiId: z.string(),
  totalDue: z.number(), overdueAmount: z.number(), blocked: z.boolean(),
  dues: z.array(commissionDueSchema.extend({ customerName: z.string(), serviceName: z.string() })),
});

const bookingSchema = z.object({
  id: z.number(), serviceId: z.number(), providerId: z.number().nullable(), providerName: z.string().nullable(), providerPhone: z.string().nullable(),
  status: z.string(), description: z.string(), address: z.string(), customerName: z.string(), customerPhone: z.string(),
  scheduledDate: z.string(), scheduledSlot: z.string(), paymentMethod: z.string(), paymentStatus: z.string(), paymentRef: z.string().nullable(),
  visitingFee: z.number(), finalPrice: z.number(), startOtp: z.string().nullable(), otpVerified: z.boolean(),
  rating: z.number().nullable(), review: z.string().nullable(), requestedAt: z.string(), completedAt: z.string().nullable(),
  commission: commissionDueSchema.nullable(),
  items: z.array(z.object({ id: z.number(), serviceId: z.number(), serviceName: z.string(), unitPrice: z.number(), quantity: z.number(), lineTotal: z.number() })),
});

const catalogResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  services: z.array(z.object({ id: z.number(), name: z.string(), description: z.string(), basePrice: z.number(), photoUrl: z.string(), isActive: z.boolean() })),
  slots: z.array(z.string()), visitingFee: z.number(),
});
const providerOutSchema = z.object({
  id: z.number(), name: z.string(), email: z.string(), phone: z.string(), address: z.string(),
  latitude: z.number(), longitude: z.number(), rating: z.number(), totalReviews: z.number(),
  isAvailable: z.boolean(), isVerified: z.boolean(), profileImageUrl: z.string(),
  serviceIds: z.array(z.number()), certifications: z.array(z.string()),
  experienceYears: z.number(), bio: z.string(), distanceKm: z.number(),
  kycStatus: z.string(), accountStatus: z.string(), serviceRadiusKm: z.number(), serviceAreaLabel: z.string().nullable(),
});
const providersResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  providers: z.array(providerOutSchema),
});
const authUserSchema = z.object({
  id: z.number(), name: z.string(), email: z.string(), phone: z.string(),
  role: z.string(), providerId: z.number().nullable(), address: z.string(),
});
const authResponse = z.object({
  success: z.boolean(), error: z.string().nullable(), user: authUserSchema.optional(),
});
const adminProviderSchema = providerOutSchema.extend({
  kycAadhaar: z.string().nullable(), kycPan: z.string().nullable(), kycBankAccount: z.string().nullable(),
  kycRejectionReason: z.string().nullable(),
  bookingsCount: z.number(), completedCount: z.number(), pendingCount: z.number(),
  totalRevenue: z.number(), monthlyRevenue: z.number(),
  reviews: z.array(z.object({ bookingId: z.number(), customerName: z.string(), rating: z.number(), review: z.string().nullable(), scheduledDate: z.string() })),
});
const adminProvidersResponse = z.object({
  success: z.boolean(), error: z.string().nullable(), providers: z.array(adminProviderSchema),
});
const adminOverviewResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  stats: z.object({
    totalUsers: z.number(), totalProviders: z.number(), totalBookings: z.number(),
    totalRevenue: z.number(), pendingKyc: z.number(), completedBookings: z.number(),
  }).optional(),
  monthlyRevenue: z.array(z.object({ month: z.string(), revenue: z.number(), bookings: z.number() })).optional(),
  recentBookings: z.array(bookingSchema).optional(),
});
const customersResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  customers: z.array(z.object({
    name: z.string(), phone: z.string(), email: z.string().nullable(), bookingsCount: z.number(),
    totalSpend: z.number(), lastBookingDate: z.string().nullable(),
  })),
});
const settingsResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  settings: z.object({
    visitingFee: z.number(), commissionPercent: z.number(), supportEmail: z.string(),
    supportPhone: z.string(), maintenanceMode: z.boolean(),
  }).optional(),
});
const quoteResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  lines: z.array(z.object({ serviceId: z.number(), name: z.string(), quantity: z.number(), unitPrice: z.number(), lineTotal: z.number() })).optional(),
  subtotal: z.number().optional(), visitingFee: z.number().optional(), total: z.number().optional(),
});
const bookingResponse = z.object({ success: z.boolean(), error: z.string().nullable(), booking: bookingSchema.optional() });
const bookingsResponse = z.object({ success: z.boolean(), error: z.string().nullable(), bookings: z.array(bookingSchema) });
const dashboardResponse = z.object({
  success: z.boolean(), error: z.string().nullable(),
  provider: z.object({
    id: z.number(), name: z.string(), email: z.string(), phone: z.string(), address: z.string(),
    latitude: z.number(), longitude: z.number(), profileImageUrl: z.string(),
    rating: z.number(), totalReviews: z.number(), isAvailable: z.boolean(), isVerified: z.boolean(),
    certifications: z.array(z.string()), experienceYears: z.number(), bio: z.string(),
    serviceIds: z.array(z.number()), kycStatus: z.string(), accountStatus: z.string(),
    kycAadhaar: z.string().nullable(), kycPan: z.string().nullable(), kycBankAccount: z.string().nullable(),
    kycRejectionReason: z.string().nullable(), serviceRadiusKm: z.number(), serviceAreaLabel: z.string().nullable(),
  }).optional(),
  jobs: z.array(bookingSchema).optional(), pool: z.array(bookingSchema).optional(),
  earnings: z.object({
    month: z.string(), monthEarnings: z.number(), totalRevenue: z.number(),
    activeJobs: z.number(), completedJobs: z.number(), pendingJobs: z.number(), rating: z.number(),
    monthlySeries: z.array(z.object({ month: z.string(), revenue: z.number(), bookings: z.number() })),
    history: z.array(bookingSchema),
  }).optional(),
  commission: commissionStateSchema.optional(),
});
const payInitResponse = z.object({ success: z.boolean(), error: z.string().nullable(), mode: z.string().optional(), message: z.string().optional(), ref: z.string().optional(), amount: z.number().optional() });
const completeJobResponse = z.object({ success: z.boolean(), error: z.string().nullable(), booking: bookingSchema.optional(), commission: commissionDueSchema.nullable().optional() });
const commissionActionResponse = z.object({ success: z.boolean(), error: z.string().nullable(), commission: commissionStateSchema.optional(), due: commissionDueSchema.nullable().optional() });

export const Actions = {
  getCatalog: defineAction({
    request: z.object({}),
    response: catalogResponse,
    async handler(ctx): Promise<z.infer<typeof catalogResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const settings = await getSettingsMap(ctx);
      const fee = Number(settings.visitingFee ?? VISITING_FEE);
      const rows = await db.select().from(schema.services).orderBy(asc(schema.services.sortOrder));
      return ok({ services: rows.map((r) => ({ id: r.id, name: r.name, description: r.description, basePrice: r.basePrice, photoUrl: r.photoUrl, isActive: r.isActive })), slots: [...DAILY_SLOTS], visitingFee: Number.isFinite(fee) && fee >= 0 ? fee : VISITING_FEE });
    },
  }),

  getProviders: defineAction({
    request: z.object({ serviceId: z.number().int().positive().optional(), lat: z.number().default(30.3429), lng: z.number().default(77.962) }),
    response: providersResponse,
    async handler(ctx, args): Promise<z.infer<typeof providersResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      let rows = await db.select().from(schema.providers);
      // Customer-facing marketplace: only KYC-approved, active professionals are bookable/discoverable.
      // Providers with overdue (>24h) platform commission dues are paused from new jobs.
      const blocked = await blockedProviderIds(ctx);
      rows = rows.filter((p) => p.accountStatus === "active" && p.kycStatus === "approved" && !blocked.has(p.id));
      if (args.serviceId != null) {
        rows = rows.filter((p) => parseJsonArr<number>(p.serviceIds).includes(args.serviceId!));
      }
      const mapped = rows.map((p) => ({
        id: p.id, name: p.name, email: p.email, phone: p.phone, address: p.address,
        latitude: p.latitude, longitude: p.longitude, rating: Math.round(p.rating * 10) / 10, totalReviews: p.totalReviews,
        isAvailable: p.isAvailable, isVerified: p.isVerified, profileImageUrl: p.profileImageUrl,
        serviceIds: parseJsonArr<number>(p.serviceIds), certifications: parseJsonArr<string>(p.certifications),
        experienceYears: p.experienceYears, bio: p.bio,
        distanceKm: Math.round(haversine(args.lat, args.lng, p.latitude, p.longitude) * 10) / 10,
        kycStatus: p.kycStatus, accountStatus: p.accountStatus,
        serviceRadiusKm: p.serviceRadiusKm, serviceAreaLabel: p.serviceAreaLabel,
      })).sort((a, b) => a.distanceKm - b.distanceKm);
      return ok({ providers: mapped });
    },
  }),

  quoteCart: defineAction({
    request: z.object({ items: z.array(z.object({ serviceId: z.number().int().positive(), quantity: z.number().int() })).max(20) }),
    response: quoteResponse,
    async handler(ctx, args): Promise<z.infer<typeof quoteResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      if (args.items.length === 0) return { success: false, error: "Cart is empty" };
      const lines: { serviceId: number; name: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
      let subtotal = 0;
      for (const line of args.items) {
        if (line.quantity < 1 || line.quantity > 10) return { success: false, error: "Quantity must be between 1 and 10" };
        const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, line.serviceId)).limit(1);
        if (!svc) return { success: false, error: "Service not found" };
        if (!svc.isActive) return { success: false, error: `Service '${svc.name}' is currently unavailable` };
        const lt = svc.basePrice * line.quantity;
        subtotal += lt;
        lines.push({ serviceId: svc.id, name: svc.name, quantity: line.quantity, unitPrice: svc.basePrice, lineTotal: lt });
      }
      const settings = await getSettingsMap(ctx);
      const feeRaw = Number(settings.visitingFee ?? VISITING_FEE);
      const fee = Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : VISITING_FEE;
      return ok({ lines, subtotal, visitingFee: fee, total: subtotal + fee });
    },
  }),

  createBooking: defineAction({
    request: z.object({
      items: z.array(z.object({ serviceId: z.number().int().positive(), quantity: z.number().int() })).min(1).max(20),
      providerId: z.number().int().positive().nullable().optional(),
      customerName: z.string().min(2).max(100),
      customerPhone: z.string().min(7).max(20),
      address: z.string().min(5).max(500),
      description: z.string().max(1000).default(""),
      scheduledDate: z.string().optional(),
      scheduledSlot: z.string().optional(),
      paymentMethod: z.enum(["UPI","CARD","CASH"]).default("UPI"),
    }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      // validate provider
      let provider: typeof schema.providers.$inferSelect | undefined;
      if (args.providerId != null) {
        const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
        if (!p) return { success: false, error: "Provider not found" };
        if (p.accountStatus !== "active") return { success: false, error: "Selected provider is not active on the platform" };
        if (p.kycStatus !== "approved") return { success: false, error: "Selected provider is not KYC-verified yet" };
        if (!p.isAvailable) return { success: false, error: "Selected provider is currently unavailable" };
        if ((await blockedProviderIds(ctx)).has(p.id)) return { success: false, error: "Selected provider is currently unavailable" };
        provider = p;
      }
      const schedDate = args.scheduledDate && args.scheduledDate.length > 0 ? args.scheduledDate : tomorrowIST();
      if (schedDate < todayIST()) return { success: false, error: "Slot date cannot be in the past" };
      const slot = args.scheduledSlot && args.scheduledSlot.length > 0 ? args.scheduledSlot : "10:00-12:00";
      if (!(DAILY_SLOTS as readonly string[]).includes(slot)) return { success: false, error: `Invalid slot. Choose one of ${DAILY_SLOTS.join(", ")}` };

      // price-lock cart
      const resolved: { serviceId: number; name: string; unitPrice: number; quantity: number }[] = [];
      let itemsTotal = 0;
      for (const line of args.items) {
        if (line.quantity < 1 || line.quantity > 10) return { success: false, error: "Quantity must be between 1 and 10" };
        const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, line.serviceId)).limit(1);
        if (!svc) return { success: false, error: "Service not found" };
        if (!svc.isActive) return { success: false, error: `Service '${svc.name}' is currently unavailable` };
        itemsTotal += svc.basePrice * line.quantity;
        resolved.push({ serviceId: svc.id, name: svc.name, unitPrice: svc.basePrice, quantity: line.quantity });
      }
      const first = resolved[0];
      if (!first) return { success: false, error: "Add at least one service to the cart" };
      const settings = await getSettingsMap(ctx);
      const feeRaw = Number(settings.visitingFee ?? VISITING_FEE);
      const fee = Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : VISITING_FEE;
      const status: Status = provider ? "ASSIGNED" : "PENDING";
      const otp = provider ? String(Math.floor(Math.random() * 10000)).padStart(4, "0") : null;
      const [inserted] = await db.insert(schema.bookings).values({
        serviceId: first.serviceId, providerId: provider?.id ?? null, status,
        description: args.description, address: args.address,
        customerName: args.customerName, customerPhone: args.customerPhone,
        scheduledDate: schedDate, scheduledSlot: slot,
        paymentMethod: args.paymentMethod, paymentStatus: "PENDING", paymentRef: null,
        visitingFee: fee, finalPrice: itemsTotal + fee,
        startOtp: otp, otpVerified: false, rating: null, review: null, completedAt: null,
      }).returning({ id: schema.bookings.id });
      if (!inserted) return { success: false, error: "Could not create booking" };
      for (const r of resolved) {
        await db.insert(schema.bookingItems).values({ bookingId: inserted.id, serviceId: r.serviceId, serviceName: r.name, unitPrice: r.unitPrice, quantity: r.quantity });
      }
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, inserted.id)).limit(1);
      if (!b) return { success: false, error: "Booking created but not found" };
      const booking = await expandBooking(ctx, b);
      ctx.invalidateQueries();
      return ok({ booking });
    },
  }),

  listBookings: defineAction({
    request: z.object({}),
    response: bookingsResponse,
    async handler(ctx): Promise<z.infer<typeof bookingsResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.bookings).orderBy(desc(schema.bookings.requestedAt));
      const out: BookingOut[] = [];
      for (const r of rows) out.push(await expandBooking(ctx, r));
      return ok({ bookings: out });
    },
  }),

  cancelBooking: defineAction({
    request: z.object({ bookingId: z.number().int().positive() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.status === "COMPLETED" || b.status === "CANCELLED") return { success: false, error: "Completed or already-cancelled bookings cannot be cancelled" };
      const allowed = TRANSITIONS[b.status as Status] ?? [];
      if (!allowed.includes("CANCELLED")) return { success: false, error: `Cannot move booking from ${b.status} to CANCELLED` };
      await db.update(schema.bookings).set({
        status: "CANCELLED",
        paymentStatus: b.paymentStatus === "PAID" ? "REFUNDED" : b.paymentStatus,
      }).where(eq(schema.bookings.id, args.bookingId));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  rescheduleBooking: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), date: z.string(), slot: z.string() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.status !== "PENDING" && b.status !== "ASSIGNED") return { success: false, error: "Only pending or assigned bookings can be rescheduled" };
      if (args.date < todayIST()) return { success: false, error: "Rescheduled date cannot be in the past" };
      if (!(DAILY_SLOTS as readonly string[]).includes(args.slot)) return { success: false, error: `Invalid slot. Choose one of ${DAILY_SLOTS.join(", ")}` };
      await db.update(schema.bookings).set({ scheduledDate: args.date, scheduledSlot: args.slot }).where(eq(schema.bookings.id, args.bookingId));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  rateBooking: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), rating: z.number().int().min(1).max(5), review: z.string().max(1000).optional() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.status !== "COMPLETED") return { success: false, error: "Only completed bookings can be rated" };
      await db.update(schema.bookings).set({ rating: args.rating, review: args.review ?? null }).where(eq(schema.bookings.id, args.bookingId));
      if (b.providerId != null) {
        const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, b.providerId)).limit(1);
        if (p) {
          const newRating = (p.rating * p.totalReviews + args.rating) / (p.totalReviews + 1);
          await db.update(schema.providers).set({ rating: Math.round(newRating * 100) / 100, totalReviews: p.totalReviews + 1 }).where(eq(schema.providers.id, p.id));
        }
      }
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  initPayment: defineAction({
    request: z.object({ bookingId: z.number().int().positive() }),
    response: payInitResponse,
    async handler(ctx, args): Promise<z.infer<typeof payInitResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.status === "CANCELLED") return { success: false, error: "Cancelled bookings cannot be paid" };
      if (b.paymentMethod === "CASH") return ok({ mode: "CASH", message: "Pay the professional after the service" });
      if (b.paymentStatus === "PAID") return ok({ mode: b.paymentMethod, message: "Already paid", ref: b.paymentRef ?? "" });
      const ref = `MOCK-${Date.now()}-${b.id}`;
      await db.update(schema.bookings).set({ paymentRef: ref, paymentStatus: "PENDING" }).where(eq(schema.bookings.id, b.id));
      ctx.invalidateQueries();
      return ok({ mode: b.paymentMethod, ref, amount: b.finalPrice, message: "Mock gateway: confirm to simulate a successful payment" });
    },
  }),

  confirmPayment: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), ref: z.string(), success: z.boolean().default(true) }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (!b.paymentRef || b.paymentRef !== args.ref) return { success: false, error: "Unknown or expired payment reference" };
      await db.update(schema.bookings).set({ paymentStatus: args.success ? "PAID" : "FAILED" }).where(eq(schema.bookings.id, b.id));
      if (args.success) {
        // Paid through the platform: commission is settled from platform-held
        // funds, so no cash/QR commission due remains for the provider.
        await db.update(schema.commissionDues).set({ status: "PAID", collectionMethod: "ONLINE", paidAt: new Date(), paymentRef: args.ref }).where(eq(schema.commissionDues.bookingId, b.id));
      }
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  getProviderDashboard: defineAction({
    request: z.object({ providerId: z.number().int().positive() }),
    response: dashboardResponse,
    async handler(ctx, args): Promise<z.infer<typeof dashboardResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      const jobRows = await db.select().from(schema.bookings).where(eq(schema.bookings.providerId, p.id)).orderBy(desc(schema.bookings.requestedAt));
      const myServices = parseJsonArr<number>(p.serviceIds);
      const commission = await getCommissionState(ctx, p.id);
      const pending = await db.select().from(schema.bookings).where(eq(schema.bookings.status, "PENDING")).orderBy(asc(schema.bookings.scheduledDate));
      const pool: BookingOut[] = [];
      for (const r of pending) {
        if (commission.blocked) break;
        const items = await db.select().from(schema.bookingItems).where(eq(schema.bookingItems.bookingId, r.id));
        const hitsService = myServices.includes(r.serviceId) || items.some((i) => myServices.includes(i.serviceId));
        if (hitsService) pool.push(await expandBooking(ctx, r));
      }
      const jobs: BookingOut[] = [];
      for (const r of jobRows) jobs.push(await expandBooking(ctx, r));
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      let monthEarnings = 0;
      let totalRevenue = 0;
      for (const j of jobs) {
        if (j.status === "COMPLETED") {
          totalRevenue += j.finalPrice;
          if (j.completedAt && j.completedAt.startsWith(monthKey)) monthEarnings += j.finalPrice;
        }
      }
      const monthlyMap = new Map<string, { month: string; revenue: number; bookings: number }>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap.set(k, { month: k, revenue: 0, bookings: 0 });
      }
      for (const j of jobs) {
        if (j.status !== "COMPLETED" || !j.completedAt) continue;
        const k = j.completedAt.slice(0, 7);
        const row = monthlyMap.get(k);
        if (row) { row.revenue += j.finalPrice; row.bookings += 1; }
      }
      const activeJobs = jobs.filter((j) => j.status === "ASSIGNED" || j.status === "IN_PROGRESS").length;
      const completedJobs = jobs.filter((j) => j.status === "COMPLETED").length;
      const pendingJobs = jobs.filter((j) => j.status === "ASSIGNED" || j.status === "PENDING").length + pool.length;
      const history = jobs.filter((j) => j.status === "COMPLETED" || j.status === "ASSIGNED" || j.status === "IN_PROGRESS").slice(0, 30);
      return ok({
        provider: {
          id: p.id, name: p.name, email: p.email, phone: p.phone, address: p.address,
          latitude: p.latitude, longitude: p.longitude, profileImageUrl: p.profileImageUrl,
          rating: Math.round(p.rating * 10) / 10, totalReviews: p.totalReviews, isAvailable: p.isAvailable,
          isVerified: p.isVerified, certifications: parseJsonArr<string>(p.certifications), experienceYears: p.experienceYears,
          bio: p.bio, serviceIds: parseJsonArr<number>(p.serviceIds), kycStatus: p.kycStatus, accountStatus: p.accountStatus,
          kycAadhaar: p.kycAadhaar, kycPan: p.kycPan, kycBankAccount: p.kycBankAccount,
          kycRejectionReason: p.kycRejectionReason, serviceRadiusKm: p.serviceRadiusKm, serviceAreaLabel: p.serviceAreaLabel,
        },
        jobs, pool,
        earnings: {
          month: monthKey, monthEarnings, totalRevenue, activeJobs, completedJobs, pendingJobs,
          rating: Math.round(p.rating * 10) / 10,
          monthlySeries: [...monthlyMap.values()], history,
        },
        commission,
      });
    },
  }),

  acceptJob: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      if (p.accountStatus !== "active") return { success: false, error: "Your account is not active. Contact support." };
      if (p.kycStatus !== "approved") return { success: false, error: "Complete KYC verification before accepting jobs" };
      if (!p.isAvailable) return { success: false, error: "Mark yourself available before accepting jobs" };
      const commission = await getCommissionState(ctx, p.id);
      if (commission.blocked) return { success: false, error: `New jobs are paused: you have overdue platform commission of ₹${Math.round(commission.overdueAmount)} (10% of cash/QR collections, payable within 24 hours). Pay it from your dashboard to resume jobs.` };
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.status !== "PENDING" || b.providerId != null) return { success: false, error: "Job is no longer open" };
      const otp = b.startOtp && b.startOtp.length > 0 ? b.startOtp : String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      await db.update(schema.bookings).set({ providerId: p.id, status: "ASSIGNED", startOtp: otp, otpVerified: false }).where(eq(schema.bookings.id, b.id));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  rejectJob: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.providerId !== args.providerId) return { success: false, error: "Not your job" };
      const allowed = TRANSITIONS[b.status as Status] ?? [];
      if (!allowed.includes("REJECTED")) return { success: false, error: `Cannot move booking from ${b.status} to REJECTED` };
      await db.update(schema.bookings).set({ status: "REJECTED" }).where(eq(schema.bookings.id, args.bookingId));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  startJob: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive(), otp: z.string() }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.providerId !== args.providerId) return { success: false, error: "Not your job" };
      const allowed = TRANSITIONS[b.status as Status] ?? [];
      if (!allowed.includes("IN_PROGRESS")) return { success: false, error: `Cannot move booking from ${b.status} to IN_PROGRESS` };
      if (!b.startOtp || b.startOtp !== args.otp.trim()) return { success: false, error: "Wrong OTP — ask the customer for the current code" };
      await db.update(schema.bookings).set({ status: "IN_PROGRESS", otpVerified: true }).where(eq(schema.bookings.id, args.bookingId));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!) });
    },
  }),

  completeJob: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive() }),
    response: completeJobResponse,
    async handler(ctx, args): Promise<z.infer<typeof completeJobResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.providerId !== args.providerId) return { success: false, error: "Not your job" };
      const allowed = TRANSITIONS[b.status as Status] ?? [];
      if (!allowed.includes("COMPLETED")) return { success: false, error: `Cannot move booking from ${b.status} to COMPLETED` };
      await db.update(schema.bookings).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(schema.bookings.id, args.bookingId));
      const [nb] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      // Completing a job starts the collection step: the provider shows their
      // payment QR (or confirms cash), and owes 10% commission within 24h.
      const commission = nb ? await ensureCommissionDue(ctx, nb) : null;
      ctx.invalidateQueries();
      return ok({ booking: await expandBooking(ctx, nb!), commission });
    },
  }),

  recordCollection: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive(), method: z.enum(["QR", "CASH"]) }),
    response: commissionActionResponse,
    async handler(ctx, args): Promise<z.infer<typeof commissionActionResponse>> {
      const db = ctx.db<typeof schema>();
      const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, args.bookingId)).limit(1);
      if (!b) return { success: false, error: "Booking not found" };
      if (b.providerId !== args.providerId) return { success: false, error: "Not your job" };
      if (b.status !== "COMPLETED") return { success: false, error: "Only completed jobs can record collection" };
      let due = await ensureCommissionDue(ctx, b);
      if (!due) return { success: false, error: "Could not create commission record" };
      if (due.status === "DUE") {
        await db.update(schema.commissionDues).set({ collectionMethod: args.method }).where(eq(schema.commissionDues.bookingId, b.id));
        const [row] = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.bookingId, b.id)).limit(1);
        if (row) due = expandDue(row);
      }
      ctx.invalidateQueries();
      return ok({ commission: await getCommissionState(ctx, args.providerId), due });
    },
  }),

  payCommission: defineAction({
    request: z.object({ bookingId: z.number().int().positive(), providerId: z.number().int().positive() }),
    response: commissionActionResponse,
    async handler(ctx, args): Promise<z.infer<typeof commissionActionResponse>> {
      const db = ctx.db<typeof schema>();
      const [dueRow] = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.bookingId, args.bookingId)).limit(1);
      if (!dueRow) return { success: false, error: "No commission due for this booking" };
      if (dueRow.providerId !== args.providerId) return { success: false, error: "Not your commission record" };
      if (dueRow.status === "PAID") return ok({ commission: await getCommissionState(ctx, args.providerId), due: expandDue(dueRow) });
      // Mock platform collection (same pattern as the mock customer gateway):
      // a live Razorpay/UPI collect replaces this one update.
      const ref = `COMM-${Date.now()}-${dueRow.id}`;
      await db.update(schema.commissionDues).set({ status: "PAID", paidAt: new Date(), paymentRef: ref }).where(eq(schema.commissionDues.id, dueRow.id));
      const [row] = await db.select().from(schema.commissionDues).where(eq(schema.commissionDues.id, dueRow.id)).limit(1);
      ctx.invalidateQueries();
      return ok({ commission: await getCommissionState(ctx, args.providerId), due: row ? expandDue(row) : null });
    },
  }),

  getCommissionDues: defineAction({
    request: z.object({ providerId: z.number().int().positive() }),
    response: commissionActionResponse,
    async handler(ctx, args): Promise<z.infer<typeof commissionActionResponse>> {
      return ok({ commission: await getCommissionState(ctx, args.providerId), due: null });
    },
  }),

  setProviderAvailability: defineAction({
    request: z.object({ providerId: z.number().int().positive(), available: z.boolean() }),
    response: z.object({ success: z.boolean(), error: z.string().nullable(), isAvailable: z.boolean().optional() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      await db.update(schema.providers).set({ isAvailable: args.available }).where(eq(schema.providers.id, args.providerId));
      ctx.invalidateQueries();
      return ok({ isAvailable: args.available });
    },
  }),

  resetData: defineAction({
    request: z.object({}),
    response: errOnly,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.commissionDues);
      await db.delete(schema.bookingItems);
      await db.delete(schema.bookings);
      await db.delete(schema.providers);
      await db.delete(schema.services);
      await db.insert(schema.services).values(SERVICES_SEED.map((s) => ({ ...s, isActive: true })));
      await db.insert(schema.providers).values(PROVIDERS_SEED.map((p) => providerInsert(p)));
      ctx.invalidateQueries();
      return ok({});
    },
  }),

  registerUser: defineAction({
    request: z.object({
      name: z.string().min(2).max(100),
      email: z.string().email().max(200),
      phone: z.string().min(7).max(20),
      password: z.string().min(6).max(100),
      role: z.enum(["customer", "provider", "admin"]),
      address: z.string().max(500).default(""),
      inviteCode: z.string().max(50).optional(),
      serviceIds: z.array(z.number().int().positive()).max(8).optional(),
      experienceYears: z.number().int().min(0).max(60).optional(),
      bio: z.string().max(1000).optional(),
      certifications: z.array(z.string().max(120)).max(8).optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      serviceAreaLabel: z.string().max(200).optional(),
      serviceRadiusKm: z.number().min(1).max(50).optional(),
      kycAadhaar: z.string().max(30).optional(),
      kycPan: z.string().max(20).optional(),
      kycBankAccount: z.string().max(30).optional(),
    }),
    response: authResponse,
    async handler(ctx, args): Promise<z.infer<typeof authResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const email = args.email.trim().toLowerCase();
      const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (existing) return { success: false, error: "An account with this email already exists. Please log in." };
      if (args.role === "admin" && (args.inviteCode ?? "") !== ADMIN_INVITE_CODE) {
        return { success: false, error: "Admin registration needs a valid invite code. Ask your platform owner." };
      }
      let providerId: number | null = null;
      if (args.role === "provider") {
        const serviceIds = args.serviceIds && args.serviceIds.length > 0 ? args.serviceIds : [5];
        const lat = args.latitude ?? 30.3429;
        const lng = args.longitude ?? 77.962;
        const [created] = await db.insert(schema.providers).values({
          name: args.name.trim(), email, phone: args.phone.trim(),
          address: args.serviceAreaLabel ?? args.address ?? "Prem Nagar, Dehradun",
          latitude: lat, longitude: lng, rating: 5.0, totalReviews: 0,
          isAvailable: false, isVerified: false,
          profileImageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
          serviceIds: JSON.stringify(serviceIds),
          certifications: JSON.stringify(args.certifications && args.certifications.length > 0 ? args.certifications : ["New professional"]),
          experienceYears: args.experienceYears ?? 1,
          bio: args.bio ?? "New professional on UrbanService.",
          kycStatus: args.kycAadhaar ? "pending" : "not_submitted",
          kycAadhaar: args.kycAadhaar ?? null, kycPan: args.kycPan ?? null, kycBankAccount: args.kycBankAccount ?? null,
          kycRejectionReason: null, accountStatus: "active",
          serviceRadiusKm: args.serviceRadiusKm ?? 8, serviceAreaLabel: args.serviceAreaLabel ?? args.address ?? "Prem Nagar, Dehradun",
        }).returning({ id: schema.providers.id });
        providerId = created?.id ?? null;
        if (providerId == null) return { success: false, error: "Could not create professional profile" };
      }
      const [user] = await db.insert(schema.users).values({
        name: args.name.trim(), email, phone: args.phone.trim(), password: await hashPassword(args.password),
        role: args.role, providerId, address: args.address ?? "",
      }).returning({ id: schema.users.id });
      if (!user) return { success: false, error: "Could not create account" };
      ctx.invalidateQueries();
      return ok({ user: { id: user.id, name: args.name.trim(), email, phone: args.phone.trim(), role: args.role, providerId, address: args.address ?? "" } });
    },
  }),

  loginUser: defineAction({
    request: z.object({
      email: z.string().email().max(200),
      password: z.string().min(1).max(100),
      role: z.enum(["customer", "provider", "admin"]),
    }),
    response: authResponse,
    async handler(ctx, args): Promise<z.infer<typeof authResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const email = args.email.trim().toLowerCase();
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!user || user.password !== (await hashPassword(args.password))) return { success: false, error: "Invalid email or password. Check the details or use one-tap demo sign-in below." };
      if (user.role !== args.role) {
        const label = user.role === "provider" ? "Service Provider" : user.role === "admin" ? "Admin" : "Customer";
        return { success: false, error: `This account is registered as ${label}. Select ${label} above and try again.` };
      }
      return ok({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, providerId: user.providerId, address: user.address } });
    },
  }),

  // One-tap demo sign-in: the seeded demo passwords never leave the server.
  demoLogin: defineAction({
    request: z.object({ role: z.enum(["customer", "provider", "admin"]) }),
    response: authResponse,
    async handler(ctx, args): Promise<z.infer<typeof authResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const email = DEMO_EMAIL_BY_ROLE[args.role];
      if (!email) return { success: false, error: "Unknown demo role" };
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!user) return { success: false, error: "Demo account is not seeded yet. Try again in a moment." };
      return ok({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, providerId: user.providerId, address: user.address } });
    },
  }),

  getAdminOverview: defineAction({
    request: z.object({}),
    response: adminOverviewResponse,
    async handler(ctx): Promise<z.infer<typeof adminOverviewResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const users = await db.select().from(schema.users);
      const provs = await db.select().from(schema.providers);
      const allBookings = await db.select().from(schema.bookings).orderBy(desc(schema.bookings.requestedAt));
      const totalRevenue = allBookings.filter((b) => b.status === "COMPLETED").reduce((n, b) => n + b.finalPrice, 0);
      const completedBookings = allBookings.filter((b) => b.status === "COMPLETED").length;
      const pendingKyc = provs.filter((p) => p.kycStatus === "pending").length;
      const now = new Date();
      const monthlyMap = new Map<string, { month: string; revenue: number; bookings: number }>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap.set(k, { month: k, revenue: 0, bookings: 0 });
      }
      for (const b of allBookings) {
        if (b.status !== "COMPLETED" || !b.completedAt) continue;
        const ts = b.completedAt instanceof Date ? b.completedAt : new Date(b.completedAt as unknown as number);
        const k = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
        const row = monthlyMap.get(k);
        if (row) { row.revenue += b.finalPrice; row.bookings += 1; }
      }
      const recent: BookingOut[] = [];
      for (const r of allBookings.slice(0, 8)) recent.push(await expandBooking(ctx, r));
      return ok({
        stats: {
          totalUsers: users.length, totalProviders: provs.filter((p) => p.accountStatus !== "removed").length,
          totalBookings: allBookings.length, totalRevenue, pendingKyc, completedBookings,
        },
        monthlyRevenue: [...monthlyMap.values()], recentBookings: recent,
      });
    },
  }),

  listAdminProviders: defineAction({
    request: z.object({ lat: z.number().default(30.3429), lng: z.number().default(77.962) }),
    response: adminProvidersResponse,
    async handler(ctx, args): Promise<z.infer<typeof adminProvidersResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const provs = await db.select().from(schema.providers).orderBy(asc(schema.providers.id));
      const allBookings = await db.select().from(schema.bookings).orderBy(desc(schema.bookings.requestedAt));
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const out: z.infer<typeof adminProviderSchema>[] = [];
      for (const p of provs) {
        const mine = allBookings.filter((b) => b.providerId === p.id);
        const completed = mine.filter((b) => b.status === "COMPLETED");
        const totalRevenue = completed.reduce((n, b) => n + b.finalPrice, 0);
        let monthlyRevenue = 0;
        for (const b of completed) {
          if (!b.completedAt) continue;
          const ts = b.completedAt instanceof Date ? b.completedAt : new Date(b.completedAt as unknown as number);
          const k = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
          if (k === monthKey) monthlyRevenue += b.finalPrice;
        }
        const reviews: z.infer<typeof adminProviderSchema>["reviews"] = [];
        for (const b of mine) {
          if (b.rating == null) continue;
          reviews.push({ bookingId: b.id, customerName: b.customerName, rating: b.rating, review: b.review, scheduledDate: b.scheduledDate });
          if (reviews.length >= 10) break;
        }
        out.push({
          id: p.id, name: p.name, email: p.email, phone: p.phone, address: p.address,
          latitude: p.latitude, longitude: p.longitude, rating: Math.round(p.rating * 10) / 10, totalReviews: p.totalReviews,
          isAvailable: p.isAvailable, isVerified: p.isVerified, profileImageUrl: p.profileImageUrl,
          serviceIds: parseJsonArr<number>(p.serviceIds), certifications: parseJsonArr<string>(p.certifications),
          experienceYears: p.experienceYears, bio: p.bio,
          distanceKm: Math.round(haversine(args.lat, args.lng, p.latitude, p.longitude) * 10) / 10,
          kycStatus: p.kycStatus, accountStatus: p.accountStatus,
          serviceRadiusKm: p.serviceRadiusKm, serviceAreaLabel: p.serviceAreaLabel,
          kycAadhaar: p.kycAadhaar, kycPan: p.kycPan, kycBankAccount: p.kycBankAccount,
          kycRejectionReason: p.kycRejectionReason,
          bookingsCount: mine.length, completedCount: completed.length,
          pendingCount: mine.filter((b) => b.status === "ASSIGNED" || b.status === "PENDING" || b.status === "IN_PROGRESS").length,
          totalRevenue, monthlyRevenue, reviews,
        });
      }
      return ok({ providers: out });
    },
  }),

  updateKycStatus: defineAction({
    request: z.object({
      providerId: z.number().int().positive(),
      status: z.enum(["approved", "rejected", "pending"]),
      reason: z.string().max(500).optional(),
    }),
    response: bookingResponse,
    async handler(ctx, args): Promise<z.infer<typeof bookingResponse>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Provider not found" };
      if (args.status === "rejected" && (!args.reason || args.reason.trim().length < 5)) {
        return { success: false, error: "Add a short rejection reason so the professional knows what to fix." };
      }
      await db.update(schema.providers).set({
        kycStatus: args.status,
        isVerified: args.status === "approved",
        kycRejectionReason: args.status === "rejected" ? (args.reason ?? "").trim() : null,
      }).where(eq(schema.providers.id, args.providerId));
      ctx.invalidateQueries();
      // bookingResponse requires a booking; return a lightweight success via the same shape without booking.
      return { success: true, error: null };
    },
  }),

  updateProviderAccount: defineAction({
    request: z.object({
      providerId: z.number().int().positive(),
      action: z.enum(["approve", "suspend", "activate", "deactivate", "remove"]),
    }),
    response: errOnly,
    async handler(ctx, args): Promise<z.infer<typeof errOnly>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Provider not found" };
      if (args.action === "approve") {
        await db.update(schema.providers).set({ kycStatus: "approved", isVerified: true, kycRejectionReason: null, accountStatus: "active" }).where(eq(schema.providers.id, args.providerId));
      } else if (args.action === "suspend") {
        await db.update(schema.providers).set({ accountStatus: "suspended", isAvailable: false }).where(eq(schema.providers.id, args.providerId));
      } else if (args.action === "activate") {
        await db.update(schema.providers).set({ accountStatus: "active" }).where(eq(schema.providers.id, args.providerId));
      } else if (args.action === "deactivate") {
        await db.update(schema.providers).set({ accountStatus: "deactivated", isAvailable: false }).where(eq(schema.providers.id, args.providerId));
      } else {
        await db.update(schema.providers).set({ accountStatus: "removed", isAvailable: false }).where(eq(schema.providers.id, args.providerId));
      }
      ctx.invalidateQueries();
      return ok({});
    },
  }),

  submitKyc: defineAction({
    request: z.object({
      providerId: z.number().int().positive(),
      aadhaar: z.string().min(4).max(30),
      pan: z.string().min(5).max(20),
      bankAccount: z.string().min(4).max(30),
    }),
    response: errOnly,
    async handler(ctx, args): Promise<z.infer<typeof errOnly>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      await db.update(schema.providers).set({
        kycStatus: "pending", kycAadhaar: args.aadhaar.trim(), kycPan: args.pan.trim().toUpperCase(),
        kycBankAccount: args.bankAccount.trim(), kycRejectionReason: null, isVerified: false,
      }).where(eq(schema.providers.id, args.providerId));
      ctx.invalidateQueries();
      return ok({});
    },
  }),

  updateProviderServiceArea: defineAction({
    request: z.object({
      providerId: z.number().int().positive(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(50),
      label: z.string().min(2).max(200),
    }),
    response: errOnly,
    async handler(ctx, args): Promise<z.infer<typeof errOnly>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      await db.update(schema.providers).set({
        latitude: args.latitude, longitude: args.longitude,
        serviceRadiusKm: args.radiusKm, serviceAreaLabel: args.label.trim(), address: args.label.trim(),
      }).where(eq(schema.providers.id, args.providerId));
      ctx.invalidateQueries();
      return ok({});
    },
  }),

  updateProviderProfile: defineAction({
    request: z.object({
      providerId: z.number().int().positive(),
      bio: z.string().max(1000).optional(),
      serviceIds: z.array(z.number().int().positive()).max(8).optional(),
      experienceYears: z.number().int().min(0).max(60).optional(),
      certifications: z.array(z.string().max(120)).max(8).optional(),
    }),
    response: errOnly,
    async handler(ctx, args): Promise<z.infer<typeof errOnly>> {
      const db = ctx.db<typeof schema>();
      const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, args.providerId)).limit(1);
      if (!p) return { success: false, error: "Professional account not found" };
      const patch: Partial<typeof schema.providers.$inferInsert> = {};
      if (args.bio != null) patch.bio = args.bio;
      if (args.serviceIds != null) patch.serviceIds = JSON.stringify(args.serviceIds);
      if (args.experienceYears != null) patch.experienceYears = args.experienceYears;
      if (args.certifications != null) patch.certifications = JSON.stringify(args.certifications);
      if (Object.keys(patch).length > 0) {
        await db.update(schema.providers).set(patch).where(eq(schema.providers.id, args.providerId));
      }
      ctx.invalidateQueries();
      return ok({});
    },
  }),

  listCustomers: defineAction({
    request: z.object({}),
    response: customersResponse,
    async handler(ctx): Promise<z.infer<typeof customersResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const userRows = await db.select().from(schema.users).where(eq(schema.users.role, "customer"));
      const allBookings = await db.select().from(schema.bookings).orderBy(desc(schema.bookings.requestedAt));
      const byKey = new Map<string, { name: string; phone: string; email: string | null; bookingsCount: number; totalSpend: number; lastBookingDate: string | null }>();
      for (const u of userRows) {
        const key = `${u.name.toLowerCase()}|${u.phone}`;
        if (!byKey.has(key)) byKey.set(key, { name: u.name, phone: u.phone, email: u.email, bookingsCount: 0, totalSpend: 0, lastBookingDate: null });
      }
      for (const b of allBookings) {
        const key = `${b.customerName.toLowerCase()}|${b.customerPhone}`;
        const cur = byKey.get(key) ?? { name: b.customerName, phone: b.customerPhone, email: null, bookingsCount: 0, totalSpend: 0, lastBookingDate: null as string | null };
        cur.bookingsCount += 1;
        if (b.status === "COMPLETED") cur.totalSpend += b.finalPrice;
        if (!cur.lastBookingDate || b.scheduledDate > cur.lastBookingDate) cur.lastBookingDate = b.scheduledDate;
        // keep the registered email when names match a known user
        byKey.set(key, cur);
      }
      const customers = [...byKey.values()].sort((a, b) => b.totalSpend - a.totalSpend || b.bookingsCount - a.bookingsCount);
      return ok({ customers });
    },
  }),

  getSettings: defineAction({
    request: z.object({}),
    response: settingsResponse,
    async handler(ctx): Promise<z.infer<typeof settingsResponse>> {
      await ensureSeeded(ctx);
      const s = await getSettingsMap(ctx);
      return ok({
        settings: {
          visitingFee: Number(s.visitingFee ?? VISITING_FEE),
          commissionPercent: Number(s.commissionPercent ?? DEFAULT_COMMISSION_PERCENT),
          supportEmail: s.supportEmail ?? "support@urbanservice.in",
          supportPhone: s.supportPhone ?? "+91 90000 00001",
          maintenanceMode: s.maintenanceMode === "true",
        },
      });
    },
  }),

  updateSettings: defineAction({
    request: z.object({
      visitingFee: z.number().min(0).max(1000),
      commissionPercent: z.number().min(0).max(60),
      supportEmail: z.string().email().max(200),
      supportPhone: z.string().min(7).max(30),
      maintenanceMode: z.boolean(),
    }),
    response: settingsResponse,
    async handler(ctx, args): Promise<z.infer<typeof settingsResponse>> {
      await ensureSeeded(ctx);
      const db = ctx.db<typeof schema>();
      const entries: [string, string][] = [
        ["visitingFee", String(args.visitingFee)],
        ["commissionPercent", String(args.commissionPercent)],
        ["supportEmail", args.supportEmail.trim()],
        ["supportPhone", args.supportPhone.trim()],
        ["maintenanceMode", String(args.maintenanceMode)],
      ];
      for (const [key, value] of entries) {
        const [existing] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, key)).limit(1);
        if (existing) await db.update(schema.platformSettings).set({ value }).where(eq(schema.platformSettings.key, key));
        else await db.insert(schema.platformSettings).values({ key, value });
      }
      ctx.invalidateQueries();
      return ok({
        settings: {
          visitingFee: args.visitingFee, commissionPercent: args.commissionPercent,
          supportEmail: args.supportEmail.trim(), supportPhone: args.supportPhone.trim(),
          maintenanceMode: args.maintenanceMode,
        },
      });
    },
  }),
} satisfies ActionsModule;
