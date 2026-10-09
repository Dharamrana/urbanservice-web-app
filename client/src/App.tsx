import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type ApiResponse } from "./api";
import { ProviderMap } from "./components/ProviderMap";
import { AREA_PRESETS, AccountBadge, AnalyticsCard, KycBadge, RoleSelector, monthLabel, type Role } from "./components/ui";
import { mapsSearchUrl, type MapPlace } from "./maps";
import carpenterPhoto from "./assets/service-carpenter.jpg";
import acRepairPhoto from "./assets/service-ac-repair.jpg";

type Catalog = ApiResponse<typeof api, "getCatalog">;
type Service = Catalog["services"][number];
type ProvidersRes = ApiResponse<typeof api, "getProviders">;
type Provider = ProvidersRes["providers"][number];
type Booking = ApiResponse<typeof api, "listBookings">["bookings"][number];
type Dashboard = ApiResponse<typeof api, "getProviderDashboard">;
type AdminProvider = ApiResponse<typeof api, "listAdminProviders">["providers"][number];
type AuthUser = NonNullable<ApiResponse<typeof api, "loginUser">["user"]>;
type Settings = NonNullable<ApiResponse<typeof api, "getSettings">["settings"]>;

type View = "home" | "services" | "providers" | "bookings" | "partner" | "pay" | "login" | "register" | "admin";
type CartLine = { serviceId: number; name: string; unitPrice: number; qty: number };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const SLOTS = ["08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00"];
const DEHRADUN = { lat: 30.3429, lng: 77.962 };

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function nearestAreaPreset(lat: number, lng: number): { preset: (typeof AREA_PRESETS)[number]; km: number } {
  let best: (typeof AREA_PRESETS)[number] = AREA_PRESETS[0];
  let bestKm = Number.POSITIVE_INFINITY;
  for (const p of AREA_PRESETS) {
    const km = distKm(lat, lng, p.lat, p.lng);
    if (km < bestKm) { bestKm = km; best = p; }
  }
  return { preset: best, km: bestKm };
}
/** Honest label for a dropped pin: the preset name only when truly inside it. */
function areaLabelFor(lat: number, lng: number): string {
  const n = nearestAreaPreset(lat, lng);
  if (n.km <= 2) return n.preset.label;
  return `Dropped pin near ${n.preset.label.replace(", Dehradun", "")}, Dehradun`;
}

function tomorrowISO() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function prettyDate(iso: string) {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
  catch { return iso; }
}
function fmtWhen(iso: string | null) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); }
  catch { return iso; }
}
function loadAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem("us-auth");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}
function serviceNames(ids: number[], services: Service[]): string {
  return ids.map((id) => services.find((s) => s.id === id)?.name ?? `Service #${id}`).join(", ");
}
// Bundled photos for services whose hosted photo links went dead (404).
// Rendering these owned assets keeps Carpenter and AC Repair visible offline.
const LOCAL_SERVICE_PHOTOS: Record<number, string> = {
  1: carpenterPhoto,
  6: acRepairPhoto,
};
function svcPhoto(s: Service): string {
  return LOCAL_SERVICE_PHOTOS[s.id] ?? s.photoUrl;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  ASSIGNED: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200",
  IN_PROGRESS: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  CANCELLED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${STATUS_STYLE[status] ?? "bg-zinc-200"}`}>{status.replace("_", " ")}</span>;
}

function Timeline({ status }: { status: string }) {
  const stages = ["Booked", "Assigned", "In progress", "Done"];
  const idx = status === "COMPLETED" ? 3 : status === "IN_PROGRESS" ? 2 : status === "ASSIGNED" ? 1 : status === "PENDING" ? 0 : -1;
  if (status === "CANCELLED" || status === "REJECTED") return null;
  return (
    <ol className="flex items-center gap-0 mt-3" aria-label="Booking progress">
      {stages.map((s, i) => (
        <li key={s} className="flex items-center flex-1 last:flex-none">
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${i <= idx ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${i <= idx ? "bg-[var(--accent)] text-white" : "bg-[var(--border)] text-[var(--dim)]"}`}>{i + 1}</span>
            <span className="hidden sm:inline">{s}</span>
          </span>
          {i < stages.length - 1 && <span className={`mx-1.5 h-px flex-1 ${i < idx ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />}
        </li>
      ))}
    </ol>
  );
}

function RevenueChart({ data, ariaLabel }: { data: { month: string; revenue: number; bookings: number }[]; ariaLabel: string }) {
  const chartData = data.map((d) => ({ label: monthLabel(d.month), revenue: d.revenue, bookings: d.bookings }));
  const hasData = chartData.some((d) => d.revenue > 0);
  if (!hasData) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 text-center" role="img" aria-label={ariaLabel}>
        <p className="text-sm text-[var(--dim)]">No completed-job revenue yet. Completed bookings will appear here month by month.</p>
      </div>
    );
  }
  return (
    <div className="h-[220px] w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--dim)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--dim)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} width={44} />
          <Tooltip formatter={(value) => { const n = typeof value === "number" ? value : Number(value ?? 0); return [inr(Number.isFinite(n) ? n : 0), "Revenue"]; }} labelFormatter={(l) => `Month: ${String(l)}`} />
          <Bar dataKey="revenue" fill="#e8650a" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [providerServiceId, setProviderServiceId] = useState<number | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [adminProvider, setAdminProvider] = useState<AdminProvider | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [partnerId, setPartnerId] = useState<number>(1);
  const [payBooking, setPayBooking] = useState<Booking | null>(null);
  const [collectBooking, setCollectBooking] = useState<Booking | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [auth, setAuth] = useState<AuthUser | null>(() => loadAuth());
  const [profile, setProfile] = useState<{ name: string; phone: string } | null>(() => {
    try { const raw = localStorage.getItem("us-profile"); return raw ? (JSON.parse(raw) as { name: string; phone: string }) : null; } catch { return null; }
  });
  const [showProfile, setShowProfile] = useState(false);
  const [showAllDemoBookings, setShowAllDemoBookings] = useState(false);

  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 4200); };

  const catalogQ = useQuery({ queryKey: ["catalog"], queryFn: () => api.getCatalog({}) });
  const providersQ = useQuery({ queryKey: ["providers", providerServiceId], queryFn: () => api.getProviders(providerServiceId != null ? { serviceId: providerServiceId, lat: DEHRADUN.lat, lng: DEHRADUN.lng } : { lat: DEHRADUN.lat, lng: DEHRADUN.lng }) });
  const allProvidersQ = useQuery({ queryKey: ["providers", "all"], queryFn: () => api.getProviders({ lat: DEHRADUN.lat, lng: DEHRADUN.lng }) });
  const bookingsQ = useQuery({ queryKey: ["bookings"], queryFn: () => api.listBookings({}) });
  const effectivePartnerId = auth?.role === "provider" && auth.providerId != null ? auth.providerId : partnerId;
  const dashQ = useQuery({ queryKey: ["dashboard", effectivePartnerId], queryFn: () => api.getProviderDashboard({ providerId: effectivePartnerId }), enabled: view === "partner" });
  const adminProvidersQ = useQuery({ queryKey: ["adminProviders"], queryFn: () => api.listAdminProviders({ lat: DEHRADUN.lat, lng: DEHRADUN.lng }), enabled: view === "admin" || view === "partner" });
  const adminOverviewQ = useQuery({ queryKey: ["adminOverview"], queryFn: () => api.getAdminOverview({}), enabled: view === "admin" });
  const customersQ = useQuery({ queryKey: ["adminCustomers"], queryFn: () => api.listCustomers({}), enabled: view === "admin" });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings({}), enabled: view === "admin" });

  const services: Service[] = catalogQ.data?.services ?? [];
  const providers: Provider[] = providersQ.data?.providers ?? [];
  const allProviders: Provider[] = allProvidersQ.data?.providers ?? [];
  const adminProviders: AdminProvider[] = adminProvidersQ.data?.providers ?? [];
  const allBookings: Booking[] = bookingsQ.data?.bookings ?? [];
  const slots: string[] = catalogQ.data?.slots ?? [...SLOTS];
  const visitingFee = catalogQ.data?.visitingFee ?? 49;

  const bookings: Booking[] = useMemo(() => {
    if (auth?.role === "customer" && !showAllDemoBookings) {
      return allBookings.filter((b) => b.customerPhone === auth.phone || b.customerName === auth.name);
    }
    return allBookings;
  }, [allBookings, auth, showAllDemoBookings]);

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const cartSubtotal = cart.reduce((n, l) => n + l.unitPrice * l.qty, 0);

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [services, query]);

  const addToCart = (s: Service) => {
    setCart((prev) => {
      const ex = prev.find((l) => l.serviceId === s.id);
      if (ex) return prev.map((l) => (l.serviceId === s.id ? { ...l, qty: Math.min(10, l.qty + 1) } : l));
      return [...prev, { serviceId: s.id, name: s.name, unitPrice: s.basePrice, qty: 1 }];
    });
    say(`${s.name} added to your visit`);
  };
  const setQty = (id: number, qty: number) => {
    setCart((prev) => (qty <= 0 ? prev.filter((l) => l.serviceId !== id) : prev.map((l) => (l.serviceId === id ? { ...l, qty: Math.min(10, qty) } : l))));
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["providers"] });
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["adminProviders"] });
    qc.invalidateQueries({ queryKey: ["adminOverview"] });
    qc.invalidateQueries({ queryKey: ["adminCustomers"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  const applyAuth = (user: AuthUser) => {
    setAuth(user);
    try { localStorage.setItem("us-auth", JSON.stringify(user)); } catch { /* ignore */ }
    setProfile({ name: user.name, phone: user.phone });
    try { localStorage.setItem("us-profile", JSON.stringify({ name: user.name, phone: user.phone })); } catch { /* ignore */ }
    if (user.role === "admin") setView("admin");
    else if (user.role === "provider") { if (user.providerId != null) setPartnerId(user.providerId); setView("partner"); }
    else setView("home");
  };
  const logout = () => {
    setAuth(null);
    try { localStorage.removeItem("us-auth"); } catch { /* ignore */ }
    setView("home");
    say("Signed out. See you soon!");
  };

  const createMut = useMutation({
    mutationFn: (input: { items: { serviceId: number; quantity: number }[]; providerId: number | null; customerName: string; customerPhone: string; address: string; description: string; scheduledDate: string; scheduledSlot: string; paymentMethod: "UPI" | "CARD" | "CASH" }) =>
      api.createBooking(input),
    onSuccess: (r) => {
      if (!r.success || !r.booking) { say(r.error ?? "Could not create booking"); return; }
      setConfirmedBooking(r.booking);
      setCart([]);
      invalidate();
    },
    onError: () => say("Could not create booking. Check the details and try again."),
  });

  const cancelMut = useMutation({ mutationFn: (id: number) => api.cancelBooking({ bookingId: id }), onSuccess: (r) => { say(r.success ? "Booking cancelled" : (r.error ?? "Cancel failed")); invalidate(); } });
  const rateMut = useMutation({ mutationFn: (input: { bookingId: number; rating: number; review?: string }) => api.rateBooking(input), onSuccess: (r) => { say(r.success ? "Thanks for rating your professional" : (r.error ?? "Rating failed")); invalidate(); } });
  const reschedMut = useMutation({ mutationFn: (input: { bookingId: number; date: string; slot: string }) => api.rescheduleBooking(input), onSuccess: (r) => { say(r.success ? "Visit rescheduled" : (r.error ?? "Reschedule failed")); invalidate(); } });
  const payInitMut = useMutation({ mutationFn: (id: number) => api.initPayment({ bookingId: id }) });
  const payConfirmMut = useMutation({ mutationFn: (input: { bookingId: number; ref: string; success: boolean }) => api.confirmPayment(input), onSuccess: (r) => { say(r.success ? (r.booking?.paymentStatus === "PAID" ? "Payment successful" : "Payment failed — try again") : (r.error ?? "Payment error")); setPayBooking(null); invalidate(); } });
  const acceptMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number }) => api.acceptJob(input), onSuccess: (r) => { say(r.success ? "Job accepted — share the OTP when you arrive" : (r.error ?? "Accept failed")); invalidate(); } });
  const rejectMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number }) => api.rejectJob(input), onSuccess: (r) => { say(r.success ? "Job rejected" : (r.error ?? "Reject failed")); invalidate(); } });
  const startMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number; otp: string }) => api.startJob(input), onSuccess: (r) => { say(r.success ? "Work started" : (r.error ?? "Start failed — check the OTP")); invalidate(); } });
  const completeMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number }) => api.completeJob(input), onSuccess: (r) => { if (!r.success || !r.booking) { say(r.error ?? "Complete failed"); return; } if (r.booking.paymentStatus === "PAID") { say("Visit completed — payment was already collected online"); } else { say("Visit completed — collect the payment now"); setCollectBooking(r.booking); } invalidate(); } });
  const recordCollectionMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number; method: "QR" | "CASH" }) => api.recordCollection(input), onSuccess: (r) => { if (!r.success) { say(r.error ?? "Could not record collection"); return; } setCollectBooking(null); say(r.due ? `${r.due.collectionMethod === "CASH" ? "Cash collected" : "QR payment recorded"} — pay ${inr(r.due.commissionAmount)} commission (10%) within 24 hours` : "Collection recorded"); invalidate(); } });
  const payCommissionMut = useMutation({ mutationFn: (input: { bookingId: number; providerId: number }) => api.payCommission(input), onSuccess: (r) => { say(r.success ? "Commission submitted to UrbanService — thank you" : (r.error ?? "Commission payment failed")); invalidate(); } });
  const availMut = useMutation({ mutationFn: (input: { providerId: number; available: boolean }) => api.setProviderAvailability(input), onSuccess: (r) => { say(r.success ? (r.isAvailable ? "You are now available for jobs" : "You are paused — no new jobs") : "Update failed"); invalidate(); } });
  const resetMut = useMutation({ mutationFn: () => api.resetData({}), onSuccess: () => { say("Catalogue reset to the original services & professionals"); invalidate(); } });
  const kycMut = useMutation({ mutationFn: (input: { providerId: number; status: "approved" | "rejected" | "pending"; reason?: string }) => api.updateKycStatus(input), onSuccess: (r) => { say(r.success ? "KYC status updated" : (r.error ?? "KYC update failed")); invalidate(); } });
  const accountMut = useMutation({ mutationFn: (input: { providerId: number; action: "approve" | "suspend" | "activate" | "deactivate" | "remove" }) => api.updateProviderAccount(input), onSuccess: (r) => { say(r.success ? "Provider account updated" : (r.error ?? "Account update failed")); invalidate(); } });

  const navBtn = (v: View, label: string) => (
    <button key={v} type="button" aria-label={label} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}
      className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${view === v ? "text-[var(--text)] bg-[var(--surface-alt)]" : "text-[var(--dim)] hover:text-[var(--text)]"}`}>{label}</button>
  );
  const dashboardView: View = auth?.role === "admin" ? "admin" : auth?.role === "provider" ? "partner" : "bookings";
  const dashboardLabel = auth?.role === "admin" ? "Admin" : auth?.role === "provider" ? "Dashboard" : "My Bookings";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--surface)" />
      <header className="sticky top-0 z-40 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-2">
          <button type="button" aria-label="UrbanService home" onClick={() => setView("home")} className="flex items-center gap-2 font-extrabold tracking-tight text-[17px] shrink-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white text-base" aria-hidden>🔧</span>
            UrbanService
          </button>
          <p className="hidden md:flex items-center gap-1 text-xs text-[var(--dim)] ml-2 shrink-0"><span aria-hidden>📍</span> Prem Nagar, Dehradun · 30.34, 77.96</p>
          <nav className="ml-auto hidden sm:flex items-center" aria-label="Primary">
            {navBtn("home", "Home")}
            {navBtn("services", "Services")}
            {navBtn("bookings", "My Bookings")}
            {navBtn("partner", "Partner")}
            {auth?.role === "admin" && navBtn("admin", "Admin")}
          </nav>
          <button type="button" aria-label={`Cart, ${cartCount} items`} onClick={() => setShowCart(true)} className="relative ml-auto sm:ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-lg">
            <span aria-hidden>🛒</span>
            {cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold text-white">{cartCount}</span>}
          </button>
          {auth ? (
            <>
              <button type="button" aria-label={`Open ${dashboardLabel}`} onClick={() => setView(dashboardView)} className="ml-1 hidden min-[480px]:inline-flex rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">
                {dashboardLabel}
              </button>
              <button type="button" aria-label={`Signed in as ${auth.name}, ${auth.role}. Sign out`} onClick={logout} className="ml-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
                {auth.name.split(" ")[0]} · {auth.role === "provider" ? "Pro" : auth.role === "admin" ? "Admin" : "Customer"} ⎋
              </button>
            </>
          ) : (
            <button type="button" aria-label="Sign in" onClick={() => setView("login")} className="ml-1 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">
              Sign in
            </button>
          )}
        </div>
        <nav className="sm:hidden flex px-2 pb-2 gap-1 overflow-x-auto" aria-label="Primary mobile">
          {navBtn("home", "Home")}
          {navBtn("services", "Services")}
          {navBtn("bookings", "Bookings")}
          {navBtn("partner", "Partner")}
          {auth?.role === "admin" && navBtn("admin", "Admin")}
          {!auth && navBtn("login", "Sign in")}
        </nav>
      </header>

      {toast && <div role="status" className="fixed left-1/2 top-20 z-[70] -translate-x-1/2 rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white shadow-lg dark:bg-white dark:text-black max-w-[92vw] text-center">{toast}</div>}

      <main className="mx-auto max-w-6xl px-4 pb-28 sm:pb-10">
        {view === "home" && (
          <>
            <section className="relative mt-4 overflow-hidden rounded-3xl bg-[#171310] text-white">
              <img src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1400&q=80" alt="Professional cleaning a home" className="absolute inset-0 h-full w-full object-cover opacity-25" />
              <div className="relative px-5 py-10 sm:px-10 sm:py-16">
                <h1 className="text-3xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight max-w-xl">Your home deserves the best care</h1>
                <p className="mt-3 max-w-lg text-[15px] sm:text-lg text-white/75">Book trusted, background-verified professionals for cleaning, repairs, wellness and more — all at your doorstep.</p>
                <form className="mt-6 flex max-w-xl overflow-hidden rounded-2xl bg-white shadow-lg" onSubmit={(e: FormEvent) => { e.preventDefault(); setView("services"); }} role="search">
                  <label htmlFor="hero-search" className="sr-only">Search services</label>
                  <input id="hero-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you need help with?" className="min-w-0 flex-1 px-4 py-3.5 text-[15px] text-[#1a1a1a] outline-none" />
                  <button type="submit" aria-label="Search services" className="shrink-0 bg-[var(--accent)] px-5 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">Search</button>
                </form>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["Electrician", "Plumber", "House Cleaning", "AC Repair"].map((s) => (
                    <button key={s} type="button" aria-label={`Search ${s}`} onClick={() => { setQuery(s); setView("services"); }} className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/20">{s}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6" aria-labelledby="roles-home">
              <h2 id="roles-home" className="text-lg font-extrabold tracking-tight">One marketplace, three ways in</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Pick your role when you sign in — it opens the right dashboard with the right permissions.</p>
              <div className="mt-4 grid grid-cols-1 min-[560px]:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[var(--bg)] p-4">
                  <p className="text-2xl" aria-hidden>🏠</p>
                  <h3 className="mt-1.5 font-extrabold text-sm">Customers</h3>
                  <p className="mt-0.5 text-[13px] text-[var(--dim)]">Browse pros on a live map, compare ratings &amp; distance, and book in minutes.</p>
                  <button type="button" aria-label="Browse services as customer" onClick={() => setView("services")} className="mt-3 text-sm font-bold text-[var(--accent)]">Browse services →</button>
                </div>
                <div className="rounded-2xl bg-[var(--bg)] p-4">
                  <p className="text-2xl" aria-hidden>🧑‍🔧</p>
                  <h3 className="mt-1.5 font-extrabold text-sm">Service Providers</h3>
                  <p className="mt-0.5 text-[13px] text-[var(--dim)]">Track total &amp; monthly revenue, set your service area on the map, and manage jobs.</p>
                  <button type="button" aria-label="Open provider dashboard" onClick={() => setView(auth?.role === "provider" ? "partner" : "login")} className="mt-3 text-sm font-bold text-[var(--accent)]">{auth?.role === "provider" ? "Open my dashboard →" : "Join as a pro →"}</button>
                </div>
                <div className="rounded-2xl bg-[var(--bg)] p-4">
                  <p className="text-2xl" aria-hidden>🛡️</p>
                  <h3 className="mt-1.5 font-extrabold text-sm">Admins</h3>
                  <p className="mt-0.5 text-[13px] text-[var(--dim)]">Verify KYC, manage every provider &amp; booking, and watch platform revenue.</p>
                  <button type="button" aria-label="Open admin dashboard" onClick={() => setView(auth?.role === "admin" ? "admin" : "login")} className="mt-3 text-sm font-bold text-[var(--accent)]">{auth?.role === "admin" ? "Open admin console →" : "Admin sign in →"}</button>
                </div>
              </div>
            </section>

            <section className="mt-10" aria-labelledby="home-services">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">What we offer</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <h2 id="home-services" className="text-2xl sm:text-3xl font-extrabold tracking-tight">Services you&apos;ll love</h2>
                <button type="button" aria-label="View all services" onClick={() => setView("services")} className="shrink-0 text-sm font-bold text-[var(--accent)]">View all →</button>
              </div>
              <p className="mt-1 text-sm text-[var(--dim)]">From deep cleaning to furniture repair — book it all in one place.</p>
              {catalogQ.isPending ? <p className="mt-6 text-sm text-[var(--dim)]">Loading services…</p> : (
                <div className="mt-5 grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-4">
                  {services.slice(0, 8).map((s) => (
                    <article key={s.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                      <button type="button" aria-label={`View professionals for ${s.name}`} onClick={() => { setProviderServiceId(s.id); setSelectedProvider(null); setView("providers"); }} className="block w-full text-left">
                        <img src={svcPhoto(s)} alt={s.name} loading="lazy" className="h-36 w-full object-cover" />
                        <div className="p-4 pb-2">
                          <h3 className="font-bold text-[15px]">{s.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--dim)]">{s.description}</p>
                          <p className="mt-2 text-sm font-extrabold">From {inr(s.basePrice)}</p>
                        </div>
                      </button>
                      <div className="flex gap-2 px-4 pb-4">
                        <button type="button" aria-label={`Add ${s.name} to cart`} onClick={() => addToCart(s)} className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-[13px] font-bold text-white hover:bg-[var(--accent-hover)]">Add to cart</button>
                        <button type="button" aria-label={`View pros for ${s.name}`} onClick={() => { setProviderServiceId(s.id); setSelectedProvider(null); setView("providers"); }} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] font-bold">View pros</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-12" aria-labelledby="how">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Simple process</p>
              <h2 id="how" className="mt-1 text-2xl font-extrabold tracking-tight">How it works</h2>
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ["1", "Pick a service", "Browse categories or search for exactly what you need."],
                  ["2", "Choose your pro on the map", "See verified professionals near you as photo markers and pick your favourite."],
                  ["3", "Meet your pro", "A verified professional arrives at your doorstep on time. Share the OTP to start."],
                  ["4", "Pay & relax", "Pay securely after the job is done. Rate your experience."],
                ].map(([n, t, d]) => (
                  <div key={n} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-extrabold text-[var(--accent)]">{n}</span>
                    <h3 className="mt-2.5 font-bold text-[15px]">{t}</h3>
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--dim)]">{d}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-12 rounded-3xl bg-[#171310] px-5 py-8 sm:px-10 text-white" aria-labelledby="partner-cta">
              <h2 id="partner-cta" className="text-xl sm:text-2xl font-extrabold tracking-tight">Are you a professional?</h2>
              <p className="mt-1 max-w-lg text-sm text-white/70">Open your dashboard to accept jobs from the open pool, start work with the customer&apos;s OTP, set your service area on the map and track your earnings.</p>
              <button type="button" aria-label="Open Partner Portal" onClick={() => setView("partner")} className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">Open Partner Portal</button>
            </section>
          </>
        )}

        {view === "services" && (
          <section className="mt-6" aria-labelledby="all-services">
            <h1 id="all-services" className="text-2xl sm:text-3xl font-extrabold tracking-tight">All services</h1>
            <p className="mt-1 text-sm text-[var(--dim)]">{services.length} services · {inr(visitingFee)} visiting fee per booking · prices locked at checkout</p>
            <form className="mt-4 flex overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]" onSubmit={(e) => e.preventDefault()} role="search">
              <label htmlFor="services-search" className="sr-only">Search services</label>
              <input id="services-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search carpenter, cleaning, AC…" className="min-w-0 flex-1 px-4 py-3 text-[15px] bg-transparent outline-none" />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="px-4 text-sm font-bold text-[var(--dim)]">Clear</button>}
            </form>
            {filteredServices.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
                <p className="text-3xl" aria-hidden>🔍</p>
                <h2 className="mt-2 font-bold">No services match “{query}”</h2>
                <p className="mt-1 text-sm text-[var(--dim)]">Try “cleaning”, “plumber” or “paint”.</p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredServices.map((s) => (
                  <article key={s.id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <button type="button" aria-label={`View professionals for ${s.name}`} onClick={() => { setProviderServiceId(s.id); setSelectedProvider(null); setView("providers"); }} className="block w-full text-left">
                      <img src={svcPhoto(s)} alt={s.name} loading="lazy" className="h-40 w-full object-cover" />
                      <div className="p-4 pb-2">
                        <h2 className="font-bold">{s.name}</h2>
                        <p className="mt-0.5 text-[13px] leading-snug text-[var(--dim)]">{s.description}</p>
                        <p className="mt-2 text-sm font-extrabold">From {inr(s.basePrice)}</p>
                      </div>
                    </button>
                    <div className="flex gap-2 px-4 pb-4">
                      <button type="button" aria-label={`Add ${s.name} to cart`} onClick={() => addToCart(s)} className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-[13px] font-bold text-white hover:bg-[var(--accent-hover)]">Add to cart</button>
                      <button type="button" aria-label={`Book ${s.name} now`} onClick={() => { addToCart(s); setShowCart(true); }} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] font-bold">Book now</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "providers" && (
          <ProvidersView
            services={services}
            providers={providers}
            providerServiceId={providerServiceId}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            loading={providersQ.isPending}
            onBackToServices={() => setView("services")}
            onBookProvider={(p) => {
              const s = services.find((x) => x.id === providerServiceId) ?? services.find((x) => p.serviceIds.includes(x.id));
              if (s) addToCart(s);
              setShowBook(true);
              say(`${p.name} selected — confirm your visit details`);
            }}
          />
        )}

        {view === "bookings" && (
          <section className="mt-6" aria-labelledby="my-bookings">
            <h1 id="my-bookings" className="text-2xl sm:text-3xl font-extrabold tracking-tight">My Bookings</h1>
            <p className="mt-1 text-sm text-[var(--dim)]">Track visits, reschedule, cancel or rate your professional</p>
            {auth?.role === "customer" && (
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={showAllDemoBookings} onChange={(e) => setShowAllDemoBookings(e.target.checked)} aria-label="Show all demo bookings" className="h-4 w-4 accent-[#e8650a]" />
                Show all bookings on this device (demo)
              </label>
            )}
            {bookingsQ.isPending ? <p className="mt-6 text-sm text-[var(--dim)]">Loading bookings…</p> : bookings.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
                <p className="text-4xl" aria-hidden>📭</p>
                <h2 className="mt-2 font-bold">No bookings yet</h2>
                <p className="mt-1 text-sm text-[var(--dim)]">{auth?.role === "customer" && !showAllDemoBookings ? `Nothing booked under ${auth.phone} yet. Your bookings will appear here.` : "You have not made any service bookings yet."}</p>
                <button type="button" aria-label="Book a service" onClick={() => setView("services")} className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Book a Service</button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {bookings.map((b) => (
                  <BookingCard key={b.id} b={b} slots={slots}
                    onCancel={() => cancelMut.mutate(b.id)}
                    onRate={(rating, review) => rateMut.mutate({ bookingId: b.id, rating, review })}
                    onReschedule={(date, slot) => reschedMut.mutate({ bookingId: b.id, date, slot })}
                    onPay={() => { setPayBooking(b); setView("pay"); }} />
                ))}
              </div>
            )}
          </section>
        )}
        {view === "partner" && (
          <PartnerPortal
            partnerId={effectivePartnerId}
            setPartnerId={setPartnerId}
            lockedProviderId={auth?.role === "provider" ? auth.providerId : null}
            authRole={auth?.role ?? null}
            selectorProviders={adminProviders.length > 0 ? adminProviders : allProviders.map((p) => ({ ...p, kycAadhaar: null, kycPan: null, kycBankAccount: null, kycRejectionReason: null, bookingsCount: 0, completedCount: 0, pendingCount: 0, totalRevenue: 0, monthlyRevenue: 0, reviews: [] }))}
            services={services}
            dash={dashQ.data}
            loading={dashQ.isPending}
            say={say}
            invalidate={invalidate}
            onAccept={(id) => acceptMut.mutate({ bookingId: id, providerId: effectivePartnerId })}
            onReject={(id) => rejectMut.mutate({ bookingId: id, providerId: effectivePartnerId })}
            onStart={(id, otp) => startMut.mutate({ bookingId: id, providerId: effectivePartnerId, otp })}
            onComplete={(id) => completeMut.mutate({ bookingId: id, providerId: effectivePartnerId })}
            onCollect={(b) => setCollectBooking(b)}
            onPayCommission={(bookingId) => payCommissionMut.mutate({ bookingId, providerId: effectivePartnerId })}
            payCommissionBusy={payCommissionMut.isPending}
            onAvail={(a) => availMut.mutate({ providerId: effectivePartnerId, available: a })}
            onJoinAsProvider={() => setView("register")}
            onSignIn={() => setView("login")}
          />
        )}

        {collectBooking && (
          <CollectionScreen b={collectBooking} busy={recordCollectionMut.isPending}
            onQr={() => recordCollectionMut.mutate({ bookingId: collectBooking.id, providerId: effectivePartnerId, method: "QR" })}
            onCash={() => recordCollectionMut.mutate({ bookingId: collectBooking.id, providerId: effectivePartnerId, method: "CASH" })}
            onClose={() => setCollectBooking(null)} />
        )}

        {view === "pay" && payBooking && (
          <PayScreen b={payBooking} onBack={() => setView("bookings")}
            onInit={() => payInitMut.mutateAsync(payBooking.id)}
            onConfirm={(ref, success) => payConfirmMut.mutate({ bookingId: payBooking.id, ref, success })}
            confirming={payConfirmMut.isPending} />
        )}

        {view === "login" && (
          <LoginView
            onSuccess={(user) => { applyAuth(user); say(`Welcome back, ${user.name.split(" ")[0]}! You are signed in as ${user.role}.`); }}
            onGoRegister={() => setView("register")}
          />
        )}

        {view === "register" && (
          <RegisterView
            services={services}
            onSuccess={(user) => { applyAuth(user); say(user.role === "provider" ? "Professional account created! Complete KYC in your dashboard to start getting jobs." : `Welcome to UrbanService, ${user.name.split(" ")[0]}!`); }}
            onGoLogin={() => setView("login")}
          />
        )}

        {view === "admin" && (
          auth?.role === "admin" ? (
            <AdminView
              overview={adminOverviewQ.data}
              overviewLoading={adminOverviewQ.isPending}
              providers={adminProviders}
              providersLoading={adminProvidersQ.isPending}
              bookings={allBookings}
              customers={customersQ.data?.customers ?? []}
              customersLoading={customersQ.isPending}
              settings={settingsQ.data?.settings}
              services={services}
              say={say}
              invalidate={invalidate}
              onOpenProvider={(p) => setAdminProvider(p)}
              onKyc={(providerId, status, reason) => kycMut.mutate({ providerId, status, reason })}
            />
          ) : (
            <section className="mt-6 mx-auto max-w-lg" aria-labelledby="admin-locked">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                <p className="text-4xl" aria-hidden>🛡️</p>
                <h1 id="admin-locked" className="mt-2 text-2xl font-extrabold tracking-tight">Admin access only</h1>
                <p className="mt-1.5 text-sm text-[var(--dim)]">The Admin Dashboard manages KYC verification, providers, bookings and platform revenue. Sign in with an Admin account to continue{auth ? ` — you are currently signed in as ${auth.role}` : ""}.</p>
                <button type="button" aria-label="Sign in as admin" onClick={() => setView("login")} className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Sign in as Admin</button>
                <p className="mt-3 text-xs text-[var(--muted)]">Tip: use one-tap Admin demo sign-in on the sign-in page to explore the console.</p>
              </div>
            </section>
          )
        )}
      </main>

      {cartCount > 0 && !showCart && !showBook && view !== "pay" && (
        <div className="fixed inset-x-3 bottom-16 sm:bottom-3 z-40 sm:left-auto sm:right-6 sm:w-[380px]">
          <button type="button" aria-label={`View cart, ${cartCount} items, ${inr(cartSubtotal)} plus ${inr(visitingFee)} visit fee`} onClick={() => setShowCart(true)} className="flex w-full items-center justify-between rounded-2xl bg-[#1a1a1a] px-4 py-3.5 text-white shadow-xl dark:bg-white dark:text-black">
            <span className="text-sm font-bold">{cartCount} item{cartCount > 1 ? "s" : ""} · {inr(cartSubtotal)} <span className="font-medium opacity-70">(+ {inr(visitingFee)} visit)</span></span>
            <span className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-bold text-white">Book Visit →</span>
          </button>
        </div>
      )}

      <nav className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]" aria-label="Bottom">
        <div className={`grid ${auth?.role === "admin" ? "grid-cols-5" : "grid-cols-4"}`}>
          {([["home", "🏠", "Home"], ["services", "🧰", "Services"], ["bookings", "📋", "Bookings"], ["partner", "🧑‍🔧", "Partner"]] as [View, string, string][]).map(([v, icon, label]) => (
            <button key={v} type="button" aria-label={label} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${view === v ? "text-[var(--accent)]" : "text-[var(--dim)]"}`}>
              <span className="text-lg leading-none" aria-hidden>{icon}</span>{label}
            </button>
          ))}
          {auth?.role === "admin" && (
            <button type="button" aria-label="Admin" aria-current={view === "admin" ? "page" : undefined} onClick={() => setView("admin")} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${view === "admin" ? "text-[var(--accent)]" : "text-[var(--dim)]"}`}>
              <span className="text-lg leading-none" aria-hidden>🛡️</span>Admin
            </button>
          )}
        </div>
      </nav>

      {showCart && (
        <CartDrawer cart={cart} setQty={setQty} subtotal={cartSubtotal} visitingFee={visitingFee}
          onClose={() => setShowCart(false)} onCheckout={() => { setShowCart(false); setShowBook(true); }} onBrowse={() => { setShowCart(false); setView("services"); }} />
      )}
      {showBook && (
        <BookWizard cart={cart} services={services} slots={slots} visitingFee={visitingFee} subtotal={cartSubtotal}
          profile={auth ? { name: auth.name, phone: auth.phone } : profile} pending={createMut.isPending}
          confirmed={confirmedBooking}
          initialProviderId={selectedProvider?.id ?? null}
          onClose={() => { setShowBook(false); setConfirmedBooking(null); }}
          onSubmit={(data) => createMut.mutate(data)}
          onDone={() => { setShowBook(false); setConfirmedBooking(null); setView("bookings"); }} />
      )}
      {showProfile && (
        <ProfileModal profile={profile} bookingsCount={allBookings.length}
          onClose={() => setShowProfile(false)}
          onSave={(p) => { setProfile(p); try { localStorage.setItem("us-profile", JSON.stringify(p)); } catch { /* ignore */ } setShowProfile(false); say(`Welcome, ${p.name.split(" ")[0]}`); }}
          onReset={() => { resetMut.mutate(); setShowProfile(false); }} />
      )}
      {adminProvider && (
        <ProviderDetailModal
          p={adminProvider}
          services={services}
          bookings={allBookings.filter((b) => b.providerId === adminProvider.id)}
          onClose={() => setAdminProvider(null)}
          onKyc={(status, reason) => { kycMut.mutate({ providerId: adminProvider.id, status, reason }); }}
          onAccount={(action) => { accountMut.mutate({ providerId: adminProvider.id, action }); if (action === "remove") setAdminProvider(null); }}
        />
      )}

      <footer className="hidden sm:block border-t border-[var(--border)] mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-wrap gap-6 items-start justify-between">
          <div>
            <p className="font-extrabold flex items-center gap-2"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white text-sm" aria-hidden>🔧</span>UrbanService</p>
            <p className="mt-1.5 max-w-xs text-[13px] text-[var(--dim)]">Trusted home services across Dehradun — Prem Nagar, Sudhowala, Kheri Gaon, Ballupur & more. Book professionals for cleaning, repairs, wellness and more.</p>
          </div>
          <nav className="flex flex-wrap gap-5 text-sm font-semibold" aria-label="Footer">
            <button type="button" aria-label="Footer: Services" onClick={() => setView("services")} className="text-[var(--dim)] hover:text-[var(--text)]">Services</button>
            <button type="button" aria-label="Footer: My Bookings" onClick={() => setView("bookings")} className="text-[var(--dim)] hover:text-[var(--text)]">My Bookings</button>
            <button type="button" aria-label="Footer: Partner Portal" onClick={() => setView("partner")} className="text-[var(--dim)] hover:text-[var(--text)]">Partner Portal</button>
            {auth?.role === "admin" && <button type="button" aria-label="Footer: Admin Dashboard" onClick={() => setView("admin")} className="text-[var(--dim)] hover:text-[var(--text)]">Admin Dashboard</button>}
            {!auth && <button type="button" aria-label="Footer: Sign in" onClick={() => setView("login")} className="text-[var(--dim)] hover:text-[var(--text)]">Sign in</button>}
          </nav>
          <p className="text-xs text-[var(--muted)]">Role-based marketplace · Customers, Service Providers &amp; Admins · {inr(visitingFee)} visiting fee</p>
        </div>
      </footer>
    </div>
  );
}

function ProvidersView({ services, providers, providerServiceId, selectedProvider, setSelectedProvider, loading, onBackToServices, onBookProvider }: {
  services: Service[]; providers: Provider[]; providerServiceId: number | null;
  selectedProvider: Provider | null; setSelectedProvider: (p: Provider | null) => void;
  loading: boolean; onBackToServices: () => void;
  onBookProvider: (p: Provider) => void;
}) {
  const [mode, setMode] = useState<"list" | "map">("map");
  const selectedProviderId = selectedProvider?.id ?? null;
  const svc = services.find((s) => s.id === providerServiceId);
  const places: MapPlace[] = [
    { label: "Your location · Prem Nagar, Dehradun", lat: DEHRADUN.lat, lng: DEHRADUN.lng, kind: "customer" },
    ...providers.map((p) => ({ label: p.name, lat: p.latitude, lng: p.longitude, kind: "provider" as const, photoUrl: p.profileImageUrl, meta: `★${p.rating.toFixed(1)}` })),
  ];
  const selectedIndex = selectedProvider ? providers.findIndex((p) => p.id === selectedProvider.id) : -1;
  const mapSelectedIndex = selectedIndex >= 0 ? selectedIndex + 1 : null;

  return (
    <section className="mt-6" aria-labelledby="pros-heading">
      <button type="button" aria-label="Back to services" onClick={onBackToServices} className="text-sm font-bold text-[var(--accent)]">← All services</button>
      <h1 id="pros-heading" className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">{svc ? `${svc.name} professionals` : "Professionals near you"}</h1>
      <p className="mt-1 text-sm text-[var(--dim)]">{svc ? svc.description + " · " : ""}Sorted nearest first from Prem Nagar, Dehradun (30.3429, 77.9620) · Haversine distance · Only KYC-approved professionals appear here</p>

      {selectedProvider ? (
        <ProviderDetail p={selectedProvider} services={services} onBack={() => setSelectedProvider(null)}
          onBook={(p) => onBookProvider(p)} />
      ) : loading ? <p className="mt-6 text-sm text-[var(--dim)]">Finding professionals…</p> : providers.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-3xl" aria-hidden>🧑‍🔧</p>
          <h2 className="mt-2 font-bold">No providers found nearby</h2>
          <p className="mt-1 text-sm text-[var(--dim)]">Try another service or check back later.</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2" role="group" aria-label="View professionals as list or map">
            <button type="button" aria-label="View professionals on map" aria-pressed={mode === "map"} onClick={() => setMode("map")} className={`rounded-xl px-4 py-2 text-sm font-bold ${mode === "map" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>🗺️ Map</button>
            <button type="button" aria-label="View professionals as list" aria-pressed={mode === "list"} onClick={() => setMode("list")} className={`rounded-xl px-4 py-2 text-sm font-bold ${mode === "list" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>☰ List</button>
            <p className="ml-1 text-[13px] text-[var(--dim)]">Tap a photo marker or a card to select your professional.</p>
          </div>

          {mode === "map" && (
            <div className="mt-3">
              <ProviderMap
                places={places}
                selectedIndex={mapSelectedIndex}
                onSelect={(idx) => {
                  if (idx == null || idx === 0) { setSelectedProvider(null); return; }
                  const p = providers[idx - 1];
                  if (p) setSelectedProvider(p);
                }}
                ariaLabel="Map of nearby professionals. Each circular marker shows the professional's photo."
                heightClass="h-[340px] sm:h-[400px]"
              />
              <p className="mt-2 text-xs text-[var(--muted)]">⌂ is your location. Circular markers show each professional&apos;s photo and rating — tap one to see their full profile.</p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providers.map((p) => {
              const isSel = selectedProviderId === p.id;
              return (
                <article key={p.id} className={`rounded-2xl border bg-[var(--surface)] p-4 ${isSel ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--border)]"}`}>
                  <div className="flex gap-3">
                    <img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-14 w-14 rounded-full object-cover shrink-0 border-2 border-white shadow" />
                    <div className="min-w-0">
                      <h2 className="font-bold leading-tight flex items-center gap-1.5 flex-wrap">{p.name}{p.isVerified && <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ Verified</span>}</h2>
                      <p className="text-[13px] text-[var(--dim)]">★ {p.rating.toFixed(1)} ({p.totalReviews} reviews) · {p.distanceKm.toFixed(1)} km away</p>
                      <p className="text-[13px] text-[var(--dim)]">{p.experienceYears} years experience · {p.address}</p>
                    </div>
                    <span className={`ml-auto shrink-0 self-start rounded-full px-2 py-0.5 text-[11px] font-bold ${p.isAvailable ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800"}`}>{p.isAvailable ? "Available" : "Unavailable"}</span>
                  </div>
                  <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-[var(--dim)]">{p.bio}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{p.certifications.map((c) => <span key={c} className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">{c}</span>)}</div>
                  <div className="mt-3.5 flex gap-2">
                    <button type="button" aria-label={`View profile of ${p.name}`} onClick={() => setSelectedProvider(p)} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">Profile</button>
                    <button type="button" aria-label={`Select ${p.name} on map`} onClick={() => { setSelectedProvider(p); setMode("map"); }} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">📍 Map</button>
                    <button type="button" aria-label={`Book ${p.name}`} disabled={!p.isAvailable} onClick={() => onBookProvider(p)} className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-[13px] font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40">Book now</button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ProviderDetail({ p, services, onBack, onBook }: { p: Provider; services: Service[]; onBack: () => void; onBook: (p: Provider) => void }) {
  const myServices = services.filter((s) => p.serviceIds.includes(s.id));
  const directions = mapsSearchUrl({ label: p.name, address: p.address, locality: "Dehradun", lat: p.latitude, lng: p.longitude });
  return (
    <div className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
      <button type="button" aria-label="Back to professionals" onClick={onBack} className="text-sm font-bold text-[var(--accent)]">← All professionals</button>
      <div className="mt-4 flex flex-col sm:flex-row gap-5">
        <img src={p.profileImageUrl} alt={p.name} className="h-24 w-24 rounded-full object-cover shrink-0 border-4 border-white shadow-lg" />
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2 flex-wrap">{p.name}{p.isVerified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ Verified professional</span>}</h2>
          <p className="mt-1 text-sm text-[var(--dim)]">★ {p.rating.toFixed(1)} · {p.totalReviews} reviews · {p.distanceKm.toFixed(1)} km away · {p.address}</p>
          <p className="mt-1 text-sm text-[var(--dim)]">{p.experienceYears} years experience · {p.isAvailable ? "Available now" : "Currently unavailable"} · Covers {p.serviceRadiusKm} km around {p.serviceAreaLabel ?? p.address}</p>
          <div className="mt-2"><KycBadge status={p.kycStatus} /></div>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed">{p.bio}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{p.certifications.map((c) => <span key={c} className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">{c}</span>)}</div>
          {directions && <a href={directions} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-bold text-[var(--accent)]">Open in maps ↗</a>}
        </div>
      </div>
      <h3 className="mt-6 font-extrabold">Services offered</h3>
      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {myServices.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-3">
            <img src={svcPhoto(s)} alt={s.name} loading="lazy" className="h-12 w-16 rounded-xl object-cover shrink-0" />
            <div className="min-w-0 flex-1"><p className="font-bold text-sm">{s.name}</p><p className="text-xs text-[var(--dim)] line-clamp-1">{s.description}</p></div>
            <p className="font-extrabold text-sm shrink-0">{inr(s.basePrice)}</p>
          </div>
        ))}
      </div>
      <button type="button" aria-label={`Book ${p.name} now`} disabled={!p.isAvailable || myServices.length === 0} onClick={() => onBook(p)} className="mt-6 w-full sm:w-auto rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-40">
        {p.isAvailable ? `Book ${p.name}` : "Currently unavailable"}
      </button>
    </div>
  );
}

function BookingCard({ b, slots, onCancel, onRate, onReschedule, onPay }: {
  b: Booking; slots: string[];
  onCancel: () => void; onRate: (rating: number, review?: string) => void;
  onReschedule: (date: string, slot: string) => void; onPay: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [showRate, setShowRate] = useState(false);
  const [showResched, setShowResched] = useState(false);
  const [rDate, setRDate] = useState(b.scheduledDate);
  const [rSlot, setRSlot] = useState(b.scheduledSlot);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canPay = b.paymentMethod !== "CASH" && (b.paymentStatus === "PENDING" || b.paymentStatus === "FAILED") && b.status !== "CANCELLED";
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-extrabold leading-tight">{b.items[0]?.serviceName ?? "Service"}{b.items.length > 1 ? ` +${b.items.length - 1} more` : ""}</h2>
        <StatusBadge status={b.status} />
      </div>
      <Timeline status={b.status} />
      {b.description && <p className="mt-2.5 text-sm text-[var(--dim)]">{b.description}</p>}
      <ul className="mt-3 divide-y divide-[var(--border)] rounded-xl bg-[var(--bg)] px-3">
        {b.items.map((i) => (
          <li key={i.id} className="flex justify-between py-2 text-sm"><span>{i.serviceName} × {i.quantity}</span><strong>{inr(i.lineTotal)}</strong></li>
        ))}
        <li className="flex justify-between py-2 text-sm text-[var(--dim)]"><span>Visiting fee</span><span>{inr(b.visitingFee)}</span></li>
        <li className="flex justify-between py-2 text-sm font-extrabold"><span>Total</span><span>{inr(b.finalPrice)}</span></li>
      </ul>
      <dl className="mt-3 space-y-1 text-[13px] text-[var(--dim)]">
        <div className="flex gap-2"><dt aria-hidden>🧑‍🔧</dt><dd>Professional: <span className="text-[var(--text)] font-semibold">{b.providerName ?? "Assigning…"}</span></dd></div>
        <div className="flex gap-2"><dt aria-hidden>📅</dt><dd>Visit: <span className="text-[var(--text)] font-semibold">{prettyDate(b.scheduledDate)} · {b.scheduledSlot}</span></dd></div>
        <div className="flex gap-2"><dt aria-hidden>📍</dt><dd className="break-words">{b.address}</dd></div>
        <div className="flex gap-2"><dt aria-hidden>🕐</dt><dd>Booked {fmtWhen(b.requestedAt)} · {b.customerName} · {b.customerPhone}</dd></div>
        <div className="flex gap-2"><dt aria-hidden>💳</dt><dd>Payment: {b.paymentMethod} ({b.paymentStatus}){b.paymentRef ? ` · ${b.paymentRef}` : ""}</dd></div>
      </dl>
      {b.status === "ASSIGNED" && b.startOtp && (
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm">🔑 Share this code with your professional to start: <strong className="text-base tracking-[0.2em]">{b.startOtp}</strong></p>
      )}
      {b.rating != null && <p className="mt-2.5 text-sm">★ Your rating: <strong>{b.rating}/5</strong>{b.review ? ` — ${b.review}` : ""}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {canPay && <button type="button" aria-label={`Pay now for booking ${b.id}`} onClick={onPay} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Pay now · {inr(b.finalPrice)}</button>}
        {(b.status === "PENDING" || b.status === "ASSIGNED") && <button type="button" aria-label={`Reschedule booking ${b.id}`} onClick={() => setShowResched((v) => !v)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold">Reschedule</button>}
        {(b.status === "PENDING" || b.status === "ASSIGNED" || b.status === "IN_PROGRESS") && !confirmCancel && <button type="button" aria-label={`Cancel booking ${b.id}`} onClick={() => setConfirmCancel(true)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-[var(--danger)]">Cancel</button>}
        {confirmCancel && (<>
          <span className="text-[13px] font-semibold self-center">Cancel this visit?{b.paymentStatus === "PAID" ? " Paid amount will be refunded." : ""}</span>
          <button type="button" aria-label="Confirm cancellation" onClick={onCancel} className="rounded-lg bg-[var(--danger)] px-4 py-2 text-[13px] font-bold text-white">Yes, cancel</button>
          <button type="button" aria-label="Keep booking" onClick={() => setConfirmCancel(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold">Keep it</button>
        </>)}
        {b.status === "COMPLETED" && b.rating == null && <button type="button" aria-label={`Rate professional for booking ${b.id}`} onClick={() => setShowRate((v) => !v)} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Rate professional</button>}
      </div>

      {showResched && (
        <form className="mt-4 rounded-xl border border-[var(--border)] p-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); onReschedule(rDate, rSlot); setShowResched(false); }}>
          <p className="text-sm font-extrabold">Reschedule visit</p>
          <div className="mt-2.5 grid grid-cols-1 min-[480px]:grid-cols-2 gap-2.5">
            <div><label htmlFor={`rdate-${b.id}`} className="text-xs font-bold text-[var(--dim)]">New date</label>
              <input id={`rdate-${b.id}`} type="date" min={todayISO()} value={rDate} onChange={(e) => setRDate(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></div>
            <div><label htmlFor={`rslot-${b.id}`} className="text-xs font-bold text-[var(--dim)]">Time slot</label>
              <select id={`rslot-${b.id}`} value={rSlot} onChange={(e) => setRSlot(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                {slots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <button type="submit" aria-label="Save new slot" className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Save new slot</button>
        </form>
      )}
      {showRate && (
        <form className="mt-4 rounded-xl border border-[var(--border)] p-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); onRate(rating, review || undefined); setShowRate(false); }}>
          <p className="text-sm font-extrabold">How was {b.providerName ?? "your professional"}?</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className={`text-2xl leading-none ${n <= rating ? "text-amber-500" : "text-[var(--border)]"}`}>★</button>
            ))}
            <span className="ml-1.5 self-center text-sm font-bold">{rating}/5</span>
          </div>
          <label htmlFor={`review-${b.id}`} className="mt-3 block text-xs font-bold text-[var(--dim)]">Review (optional)</label>
          <textarea id={`review-${b.id}`} value={review} onChange={(e) => setReview(e.target.value)} rows={2} placeholder="Punctual, thorough, would book again…" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
          <button type="submit" aria-label="Submit rating" className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Submit rating</button>
        </form>
      )}
    </article>
  );
}

function PartnerPortal({ partnerId, setPartnerId, lockedProviderId, authRole, selectorProviders, services, dash, loading, say, invalidate, onAccept, onReject, onStart, onComplete, onCollect, onPayCommission, payCommissionBusy, onAvail, onJoinAsProvider, onSignIn }: {
  partnerId: number; setPartnerId: (n: number) => void;
  lockedProviderId: number | null; authRole: string | null;
  selectorProviders: AdminProvider[]; services: Service[];
  dash: Dashboard | undefined; loading: boolean;
  say: (m: string) => void; invalidate: () => void;
  onAccept: (id: number) => void; onReject: (id: number) => void;
  onStart: (id: number, otp: string) => void; onComplete: (id: number) => void;
  onCollect: (b: Booking) => void; onPayCommission: (bookingId: number) => void; payCommissionBusy: boolean;
  onAvail: (a: boolean) => void;
  onJoinAsProvider: () => void; onSignIn: () => void;
}) {
  const [otpMap, setOtpMap] = useState<Record<number, string>>({});
  const [tab, setTab] = useState<"overview" | "jobs" | "area" | "kyc" | "profile">("overview");
  const prov = dash?.provider;
  const jobs: Booking[] = dash?.jobs ?? [];
  const pool: Booking[] = dash?.pool ?? [];
  const earn = dash?.earnings;
  const commission = dash?.commission;
  const isLocked = lockedProviderId != null;

  return (
    <section className="mt-6" aria-labelledby="partner-heading">
      <h1 id="partner-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight">{isLocked ? "My Provider Dashboard" : "Partner Dashboard"}</h1>
      <p className="mt-1 text-sm text-[var(--dim)]">Revenue, bookings, service area, KYC and profile — everything a professional needs</p>

      {!isLocked && (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="partner-select" className="text-sm font-bold">Acting as</label>
            <select id="partner-select" value={partnerId} onChange={(e) => setPartnerId(Number(e.target.value))} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold" aria-label="Select professional to view dashboard for">
              {selectorProviders.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.rating.toFixed(1)}★ · {p.kycStatus}</option>)}
            </select>
            {authRole == null && <span className="text-xs font-semibold text-[var(--muted)]">Demo mode — sign in as a provider to lock this to your account.</span>}
            {authRole === "customer" && <button type="button" aria-label="Register as service provider from dashboard" onClick={onJoinAsProvider} className="text-sm font-bold text-[var(--accent)]">Want to earn? Join as a pro →</button>}
            {authRole == null && <button type="button" aria-label="Sign in as provider" onClick={onSignIn} className="text-sm font-bold text-[var(--accent)]">Provider sign in →</button>}
          </div>
        </div>
      )}

      {loading && !dash ? <p className="mt-6 text-sm text-[var(--dim)]">Loading dashboard…</p> : prov && earn ? (
        <>
          <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-col sm:flex-row gap-4">
              <img src={prov.profileImageUrl} alt={prov.name} className="h-20 w-20 rounded-full object-cover shrink-0 border-4 border-white shadow-lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-extrabold tracking-tight flex flex-wrap items-center gap-2">{prov.name} <KycBadge status={prov.kycStatus} /> <AccountBadge status={prov.accountStatus} /></h2>
                <p className="mt-0.5 text-sm text-[var(--dim)]">★ {prov.rating.toFixed(1)} ({prov.totalReviews} reviews) · {prov.experienceYears} yrs · {serviceNames(prov.serviceIds, services)}</p>
                <p className="mt-0.5 text-sm text-[var(--dim)]">{prov.email} · {prov.phone} · {prov.serviceAreaLabel ?? prov.address}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{prov.bio}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{prov.certifications.map((c) => <span key={c} className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">{c}</span>)}</div>
              </div>
              <button type="button" aria-label={prov.isAvailable ? "Go offline" : "Go online"} onClick={() => onAvail(!prov.isAvailable)} className={`shrink-0 self-start rounded-xl px-4 py-2 text-sm font-bold text-white ${prov.isAvailable ? "bg-emerald-600" : "bg-zinc-500"}`}>
                {prov.isAvailable ? "● Available — tap to pause" : "○ Paused — tap to go live"}
              </button>
            </div>
            {prov.kycStatus === "rejected" && prov.kycRejectionReason && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-[var(--danger)] dark:bg-red-950/40"><strong>KYC rejected:</strong> {prov.kycRejectionReason} Fix it in the KYC tab below.</p>
            )}
            {prov.kycStatus === "pending" && <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm dark:bg-amber-950/30">Your KYC is with our admin team. You can browse jobs, but you can only accept work once it is approved.</p>}
            {prov.kycStatus === "not_submitted" && <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm dark:bg-amber-950/30">KYC not submitted yet. Add your Aadhaar, PAN and bank details in the KYC tab to start receiving jobs.</p>}
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Provider dashboard sections">
            {([["overview", "Overview & Revenue"], ["jobs", `Jobs (${jobs.length + pool.length})`], ["area", "Service Area Map"], ["kyc", "KYC"], ["profile", "Profile & Services"]] as const).map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} aria-label={label} onClick={() => setTab(t)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${tab === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}>{label}</button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="mt-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <AnalyticsCard value={inr(earn.totalRevenue)} label="Total revenue" sub="All completed jobs" />
                <AnalyticsCard value={inr(earn.monthEarnings)} label={`Revenue · ${earn.month}`} sub="This month" />
                <AnalyticsCard value={String(earn.completedJobs)} label="Completed bookings" />
                <AnalyticsCard value={String(earn.pendingJobs)} label="Pending bookings" sub="Assigned + open pool" />
                <AnalyticsCard value={`★ ${earn.rating.toFixed(1)}`} label="My rating" sub={`${prov.totalReviews} reviews`} />
              </div>
              {commission && (commission.totalDue > 0 || commission.dues.length > 0) && (
                <div className={`mt-4 rounded-3xl border p-5 ${commission.blocked ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`} role={commission.blocked ? "alert" : undefined}>
                  <h3 className="font-extrabold">Platform commission ({commission.percent}%)</h3>
                  {commission.blocked ? (
                    <p className="mt-1 text-sm text-[var(--danger)]"><strong>New jobs are paused.</strong> You have overdue commission of {inr(commission.overdueAmount)}. Pay it to UrbanService to start getting jobs again.</p>
                  ) : commission.totalDue > 0 ? (
                    <p className="mt-1 text-sm text-[var(--dim)]">You collected job payments directly (cash / your QR). Submit {inr(commission.totalDue)} commission to UrbanService — each amount is due within 24 hours of completing that job.</p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--dim)]">All commission is settled. Thank you!</p>
                  )}
                  {commission.totalDue > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=8&data=${encodeURIComponent(`upi://pay?pa=${commission.platformUpiId}&pn=UrbanService&am=${commission.totalDue}&cu=INR&tn=${encodeURIComponent("UrbanService commission")}`)}`} alt="UrbanService commission payment QR" className="h-[120px] w-[120px] rounded-xl border border-[var(--border)] bg-white p-1" />
                      <p className="text-[13px] text-[var(--dim)]">Pay to <strong className="text-[var(--text)]">{commission.platformUpiId}</strong> (demo UPI).<br />Then tap “I’ve paid” on the job below.</p>
                    </div>
                  )}
                  <ul className="mt-3 divide-y divide-[var(--border)]">
                    {commission.dues.slice(0, 8).map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                        <span className="font-bold">#{d.bookingId} {d.serviceName}</span>
                        <span className="text-[var(--dim)]">{d.customerName} · collected {inr(d.amount)} via {d.collectionMethod}</span>
                        <span className={d.status === "PAID" ? "font-bold text-emerald-600" : d.overdue ? "font-bold text-[var(--danger)]" : "font-bold"}>{d.status === "PAID" ? `✓ Paid ${inr(d.commissionAmount)}` : `${inr(d.commissionAmount)} due by ${fmtWhen(d.dueAt)}${d.overdue ? " · OVERDUE" : ""}`}</span>
                        {d.status === "DUE" && <button type="button" aria-label={`Pay commission for booking ${d.bookingId}`} disabled={payCommissionBusy} onClick={() => onPayCommission(d.bookingId)} className="ml-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">I’ve paid — submit</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-extrabold">Monthly revenue — last 6 months</h3>
                <p className="mt-0.5 text-[13px] text-[var(--dim)]">From completed jobs. Visiting fee included in each booking total.</p>
                <div className="mt-3"><RevenueChart data={earn.monthlySeries} ariaLabel="Bar chart of monthly provider revenue for the last 6 months" /></div>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  {earn.monthlySeries.map((m) => (
                    <div key={m.month} className="rounded-xl bg-[var(--bg)] px-2 py-2"><p className="text-[11px] font-bold text-[var(--dim)]">{monthLabel(m.month)}</p><p className="text-sm font-extrabold">{inr(m.revenue)}</p><p className="text-[11px] text-[var(--muted)]">{m.bookings} jobs</p></div>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-extrabold">Earnings history</h3>
                <p className="mt-0.5 text-[13px] text-[var(--dim)]">Every assigned, in-progress and completed job with its value.</p>
                {earn.history.length === 0 ? <p className="mt-3 text-sm text-[var(--dim)]">No earnings yet — accept a job from the open pool to get started.</p> : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">Booking</th><th className="py-2 pr-3 font-bold">Service</th><th className="py-2 pr-3 font-bold">Customer</th><th className="py-2 pr-3 font-bold">Visit</th><th className="py-2 pr-3 font-bold">Status</th><th className="py-2 font-bold text-right">Amount</th></tr></thead>
                      <tbody>
                        {earn.history.map((h) => (
                          <tr key={h.id} className="border-b border-[var(--border)] last:border-0">
                            <td className="py-2 pr-3 font-mono text-xs">#{h.id}</td>
                            <td className="py-2 pr-3">{h.items[0]?.serviceName ?? "Service"}</td>
                            <td className="py-2 pr-3">{h.customerName}</td>
                            <td className="py-2 pr-3">{prettyDate(h.scheduledDate)} · {h.scheduledSlot}</td>
                            <td className="py-2 pr-3"><StatusBadge status={h.status} /></td>
                            <td className="py-2 font-extrabold text-right">{inr(h.finalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "jobs" && (
            <div className="mt-4">
              <h2 className="text-lg font-extrabold">My Jobs</h2>
              {jobs.length === 0 ? <p className="mt-2 text-sm text-[var(--dim)]">No jobs yet — accept work from the open pool below.</p> : (
                <div className="mt-3 space-y-3">
                  {jobs.map((j) => (
                    <article key={j.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-3"><h3 className="font-extrabold">{j.items[0]?.serviceName ?? "Service"}</h3><StatusBadge status={j.status} /></div>
                      <dl className="mt-2 space-y-1 text-[13px] text-[var(--dim)]">
                        <div>Customer: <span className="font-semibold text-[var(--text)]">{j.customerName}</span> ({j.customerPhone})</div>
                        <div>Visit: <span className="font-semibold text-[var(--text)]">{prettyDate(j.scheduledDate)} · {j.scheduledSlot}</span></div>
                        <div className="break-words">📍 {j.address}</div>
                      </dl>
                      <ul className="mt-2.5 divide-y divide-[var(--border)] rounded-xl bg-[var(--bg)] px-3">
                        {j.items.map((i) => <li key={i.id} className="flex justify-between py-1.5 text-[13px]"><span>{i.serviceName} × {i.quantity}</span><strong>{inr(i.lineTotal)}</strong></li>)}
                        <li className="flex justify-between py-1.5 text-[13px] font-extrabold"><span>Collect</span><span>{inr(j.finalPrice)} ({j.paymentStatus})</span></li>
                      </ul>
                      {j.status === "ASSIGNED" && (
                        <div className="mt-3 flex flex-wrap gap-2 items-center">
                          <label htmlFor={`otp-${j.id}`} className="sr-only">Customer OTP for job {j.id}</label>
                          <input id={`otp-${j.id}`} value={otpMap[j.id] ?? ""} onChange={(e) => setOtpMap((m) => ({ ...m, [j.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="Customer OTP" inputMode="numeric" maxLength={4} className="w-32 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-sm font-bold tracking-[0.25em]" />
                          <button type="button" aria-label={`Start job ${j.id} with OTP`} onClick={() => onStart(j.id, otpMap[j.id] ?? "")} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Start with OTP</button>
                          <button type="button" aria-label={`Reject job ${j.id}`} onClick={() => onReject(j.id)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold">Reject</button>
                        </div>
                      )}
                      {j.status === "IN_PROGRESS" && <button type="button" aria-label={`Complete job ${j.id}`} onClick={() => onComplete(j.id)} className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white">Complete visit</button>}
                      {j.status === "COMPLETED" && j.commission && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
                          <span className={j.commission.status === "PAID" ? "font-bold text-emerald-600" : j.commission.overdue ? "font-bold text-[var(--danger)]" : "font-bold"}>
                            {j.commission.status === "PAID" ? `✓ Commission paid (${inr(j.commission.commissionAmount)})` : `Commission ${inr(j.commission.commissionAmount)} (10%) · due by ${fmtWhen(j.commission.dueAt)}${j.commission.overdue ? " · OVERDUE — new jobs paused" : ""}`}
                          </span>
                          {j.commission.collectionMethod === "UNCONFIRMED" && j.paymentStatus !== "PAID" && <button type="button" aria-label={`Collect payment for job ${j.id}`} onClick={() => onCollect(j)} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white">Collect payment / show QR</button>}
                          {j.commission.status === "DUE" && <button type="button" aria-label={`Pay commission for job ${j.id}`} disabled={payCommissionBusy} onClick={() => onPayCommission(j.id)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold disabled:opacity-50">Pay commission</button>}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              <h2 className="mt-8 text-lg font-extrabold">Open Pool</h2>
              <p className="mt-0.5 text-sm text-[var(--dim)]">Unassigned bookings matching your services. Accept to take the job{prov.kycStatus !== "approved" ? " — KYC approval required first" : ""}.</p>
              {pool.length === 0 ? <p className="mt-2 text-sm text-[var(--dim)]">Nothing open right now. Stay available!</p> : (
                <div className="mt-3 space-y-3">
                  {pool.map((j) => (
                    <article key={j.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex items-start justify-between gap-3"><h3 className="font-extrabold">{j.items[0]?.serviceName ?? "Service"}</h3><StatusBadge status={j.status} /></div>
                      <p className="mt-1.5 text-[13px] text-[var(--dim)]">📅 {prettyDate(j.scheduledDate)} · {j.scheduledSlot} · 📍 {j.address}</p>
                      <p className="text-[13px] text-[var(--dim)]">Worth <strong className="text-[var(--text)]">{inr(j.finalPrice)}</strong></p>
                      <button type="button" aria-label={`Accept job ${j.id}`} onClick={() => onAccept(j.id)} className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40" disabled={!prov.isAvailable || commission?.blocked}>Accept job</button>
                      {!prov.isAvailable && <span className="ml-2 text-xs text-[var(--danger)] font-semibold">Go available first</span>}
                      {commission?.blocked && <span className="ml-2 text-xs text-[var(--danger)] font-semibold">Paused — pay overdue commission ({inr(commission.overdueAmount)}) to get jobs</span>}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "area" && <ServiceAreaEditor prov={prov} say={say} invalidate={invalidate} />}
          {tab === "kyc" && <KycPanel prov={prov} say={say} invalidate={invalidate} />}
          {tab === "profile" && <ProviderProfileEditor prov={prov} services={services} say={say} invalidate={invalidate} onAvail={onAvail} />}
        </>
      ) : <p className="mt-6 text-sm text-[var(--dim)]">Could not load this professional. Pick another partner above.</p>}
    </section>
  );
}

type DashProvider = NonNullable<Dashboard["provider"]>;

function ServiceAreaEditor({ prov, say, invalidate }: { prov: DashProvider; say: (m: string) => void; invalidate: () => void }) {
  const [label, setLabel] = useState(prov.serviceAreaLabel ?? prov.address);
  const [lat, setLat] = useState(prov.latitude);
  const [lng, setLng] = useState(prov.longitude);
  const [radius, setRadius] = useState(prov.serviceRadiusKm);
  const saveMut = useMutation({
    mutationFn: () => api.updateProviderServiceArea({ providerId: prov.id, latitude: lat, longitude: lng, radiusKm: radius, label }),
    onSuccess: (r) => { say(r.success ? `Service area saved: ${label} (${radius} km radius)` : (r.error ?? "Could not save service area")); if (r.success) invalidate(); },
    onError: () => say("Could not save service area. Try again."),
  });

  return (
    <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-extrabold">Select service area on map — like Rapido</h3>
      <p className="mt-0.5 text-sm text-[var(--dim)]">Drag the map so the fixed orange pin sits on your centre, or search / tap a locality / use GPS, then confirm. Set the coverage radius and save — customers inside the shaded circle can book you.</p>
      <div className="mt-3">
        <RapidoPicker
          value={{ lat, lng }}
          label={label}
          onPick={(la, ln, lab) => { setLat(la); setLng(ln); setLabel(lab); }}
          coverageRadiusKm={radius}
          ariaLabel="Select on map: drag the Dehradun map so the fixed orange centre pin sits on your service-area centre. The shaded circle is your coverage."
          heightClass="h-[320px] sm:h-[380px]"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 min-[560px]:grid-cols-3 gap-3">
        <div className="min-[560px]:col-span-2">
          <label htmlFor="area-label" className="text-xs font-bold text-[var(--dim)]">Service area label</label>
          <input id="area-label" value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div><label htmlFor="area-lat" className="text-xs font-bold text-[var(--dim)]">Centre latitude</label><input id="area-lat" type="number" step="0.0001" min={-90} max={90} defaultValue={lat.toFixed(4)} key={`lat-${lat}`} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= -90 && v <= 90) setLat(Math.round(v * 10000) / 10000); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></div>
            <div><label htmlFor="area-lng" className="text-xs font-bold text-[var(--dim)]">Centre longitude</label><input id="area-lng" type="number" step="0.0001" min={-180} max={180} defaultValue={lng.toFixed(4)} key={`lng-${lng}`} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= -180 && v <= 180) setLng(Math.round(v * 10000) / 10000); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></div>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">Exact centre saved: {lat.toFixed(4)}, {lng.toFixed(4)} — the shaded circle and your pin follow these values.</p>
        </div>
        <div>
          <label htmlFor="area-radius" className="text-xs font-bold text-[var(--dim)]">Coverage radius: {radius} km</label>
          <input id="area-radius" type="range" min={2} max={25} step={1} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-2.5 w-full accent-[#e8650a]" aria-label={`Coverage radius ${radius} kilometres`} />
          <div className="flex justify-between text-[11px] text-[var(--muted)]"><span>2 km</span><span>25 km</span></div>
        </div>
      </div>
      <button type="button" aria-label="Save service area" disabled={saveMut.isPending || label.trim().length < 2} onClick={() => saveMut.mutate()} className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        {saveMut.isPending ? "Saving…" : "Save service area"}
      </button>
    </div>
  );
}

function KycPanel({ prov, say, invalidate }: { prov: DashProvider; say: (m: string) => void; invalidate: () => void }) {
  const [aadhaar, setAadhaar] = useState(prov.kycAadhaar ?? "");
  const [pan, setPan] = useState(prov.kycPan ?? "");
  const [bank, setBank] = useState(prov.kycBankAccount ?? "");
  const submitMut = useMutation({
    mutationFn: () => api.submitKyc({ providerId: prov.id, aadhaar, pan, bankAccount: bank }),
    onSuccess: (r) => { say(r.success ? "KYC submitted — our admin team will review it shortly" : (r.error ?? "KYC submission failed")); if (r.success) invalidate(); },
    onError: () => say("KYC submission failed. Check the details and try again."),
  });
  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm";
  const labelCls = "text-xs font-bold text-[var(--dim)]";
  return (
    <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-extrabold">KYC verification</h3>
        <KycBadge status={prov.kycStatus} />
        <span className="text-sm text-[var(--dim)]">{prov.isVerified ? "✓ Verified professional" : "Not verified yet"}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--dim)]">Admins review Aadhaar, PAN and bank details before you can accept jobs. Details are masked on screen and only used for verification.</p>
      {prov.kycRejectionReason && prov.kycStatus === "rejected" && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-[var(--danger)] dark:bg-red-950/40"><strong>Admin note:</strong> {prov.kycRejectionReason}</p>
      )}
      <dl className="mt-3 grid grid-cols-1 min-[560px]:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">Aadhaar on file</dt><dd className="mt-0.5 font-bold">{prov.kycAadhaar ?? "Not submitted"}</dd></div>
        <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">PAN on file</dt><dd className="mt-0.5 font-bold">{prov.kycPan ?? "Not submitted"}</dd></div>
        <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">Bank account on file</dt><dd className="mt-0.5 font-bold">{prov.kycBankAccount ?? "Not submitted"}</dd></div>
      </dl>
      <form className="mt-4 space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); submitMut.mutate(); }}>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3">
          <div><label htmlFor="kyc-aadhaar" className={labelCls}>Aadhaar number</label><input id="kyc-aadhaar" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="XXXX-XXXX-1234" className={inputCls} /></div>
          <div><label htmlFor="kyc-pan" className={labelCls}>PAN</label><input id="kyc-pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={inputCls} /></div>
          <div><label htmlFor="kyc-bank" className={labelCls}>Bank account (masked)</label><input id="kyc-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="XXXXXX1234" className={inputCls} /></div>
        </div>
        <button type="submit" aria-label="Submit KYC for verification" disabled={submitMut.isPending || aadhaar.trim().length < 4 || pan.trim().length < 5 || bank.trim().length < 4} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
          {submitMut.isPending ? "Submitting…" : prov.kycStatus === "rejected" ? "Re-submit KYC" : "Submit KYC for verification"}
        </button>
      </form>
    </div>
  );
}

function ProviderProfileEditor({ prov, services, say, invalidate, onAvail }: { prov: DashProvider; services: Service[]; say: (m: string) => void; invalidate: () => void; onAvail: (a: boolean) => void }) {
  const [bio, setBio] = useState(prov.bio);
  const [exp, setExp] = useState(String(prov.experienceYears));
  const [certs, setCerts] = useState(prov.certifications.join(", "));
  const [serviceIds, setServiceIds] = useState<number[]>(prov.serviceIds);
  const saveMut = useMutation({
    mutationFn: () => api.updateProviderProfile({
      providerId: prov.id, bio,
      experienceYears: Number(exp) || prov.experienceYears,
      certifications: certs.split(",").map((s) => s.trim()).filter(Boolean),
      serviceIds,
    }),
    onSuccess: (r) => { say(r.success ? "Profile saved" : (r.error ?? "Could not save profile")); if (r.success) invalidate(); },
    onError: () => say("Could not save profile. Try again."),
  });
  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm";
  const labelCls = "text-xs font-bold text-[var(--dim)]";
  const toggleService = (id: number) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-extrabold">Profile, services &amp; availability</h3>
      <p className="mt-0.5 text-sm text-[var(--dim)]">Customers see your bio, services, rating and availability before booking.</p>
      <div className="mt-4 space-y-3.5">
        <div><label htmlFor="pp-bio" className={labelCls}>About you</label><textarea id="pp-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputCls} /></div>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3">
          <div><label htmlFor="pp-exp" className={labelCls}>Years of experience</label><input id="pp-exp" type="number" min={0} max={60} value={exp} onChange={(e) => setExp(e.target.value)} className={inputCls} /></div>
          <div><label htmlFor="pp-certs" className={labelCls}>Certifications (comma separated)</label><input id="pp-certs" value={certs} onChange={(e) => setCerts(e.target.value)} className={inputCls} /></div>
        </div>
        <fieldset>
          <legend className={labelCls}>Services offered</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {services.map((s) => {
              const on = serviceIds.includes(s.id);
              return (
                <button key={s.id} type="button" aria-label={`${on ? "Remove" : "Add"} service ${s.name}`} aria-pressed={on} onClick={() => toggleService(s.id)} className={`rounded-full px-3.5 py-2 text-[13px] font-bold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{s.name}</button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-label="Save provider profile" disabled={saveMut.isPending || serviceIds.length === 0} onClick={() => saveMut.mutate()} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saveMut.isPending ? "Saving…" : "Save profile"}</button>
          <button type="button" aria-label={prov.isAvailable ? "Pause availability from profile" : "Go available from profile"} onClick={() => onAvail(!prov.isAvailable)} className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-bold">{prov.isAvailable ? "Pause new jobs" : "Go available"}</button>
        </div>
        <p className="text-[13px] text-[var(--dim)]">Rating <strong className="text-[var(--text)]">★ {prov.rating.toFixed(1)}</strong> from {prov.totalReviews} reviews · Account <strong className="text-[var(--text)]">{prov.accountStatus}</strong> · KYC <strong className="text-[var(--text)]">{prov.kycStatus}</strong></p>
      </div>
    </div>
  );
}

function CollectionScreen({ b, onQr, onCash, onClose, busy }: {
  b: Booking; onQr: () => void; onCash: () => void; onClose: () => void; busy: boolean;
}) {
  const providerUpi = b.providerPhone ? `${b.providerPhone}@upi` : "urbanservice@okaxis";
  const commissionAmount = b.commission?.commissionAmount ?? Math.round(b.finalPrice * 10) / 100;
  const upiUri = `upi://pay?pa=${providerUpi}&pn=${encodeURIComponent(b.providerName ?? "UrbanService Pro")}&am=${b.finalPrice}&cu=INR&tn=${encodeURIComponent(`UrbanService booking #${b.id}`)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(upiUri)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="collect-heading">
      <button type="button" aria-label="Close payment collection" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--surface)] p-5 shadow-2xl">
        <h2 id="collect-heading" className="text-xl font-extrabold tracking-tight">Collect payment</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">Job #{b.id} is complete. Ask {b.customerName} to scan your QR and pay <strong className="text-[var(--text)]">{inr(b.finalPrice)}</strong>.</p>
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-[var(--border)] bg-white p-4">
          <img src={qrSrc} alt={`Payment QR for ${inr(b.finalPrice)}`} className="h-[240px] w-[240px]" />
          <p className="mt-2 text-center text-[13px] text-zinc-600">UPI: <strong>{providerUpi}</strong> · {b.providerName ?? "Professional"}<br />{inr(b.finalPrice)} · Booking #{b.id}</p>
        </div>
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px]">Platform commission is <strong>10% ({inr(commissionAmount)})</strong>. If you collect cash or payment on your own QR, submit this commission to UrbanService <strong>within 24 hours</strong>{b.commission ? ` (by ${fmtWhen(b.commission.dueAt)})` : ""}. If it stays unpaid after that, new jobs pause until you pay it.</p>
        <div className="mt-4 grid gap-2.5">
          <button type="button" aria-label="Payment received on QR" disabled={busy} onClick={onQr} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">Payment received on QR</button>
          <button type="button" aria-label="Cash collected skip QR" disabled={busy} onClick={onCash} className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white disabled:opacity-50">Cash collected — skip QR</button>
          <button type="button" aria-label="Collect payment later" disabled={busy} onClick={onClose} className="w-full rounded-xl border border-[var(--border)] py-3 text-sm font-bold disabled:opacity-50">I’ll collect later</button>
        </div>
      </div>
    </div>
  );
}

function PayScreen({ b, onBack, onInit, onConfirm, confirming }: {
  b: Booking; onBack: () => void;
  onInit: () => Promise<ApiResponse<typeof api, "initPayment">>;
  onConfirm: (ref: string, success: boolean) => void; confirming: boolean;
}) {
  const [ref, setRef] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await onInit();
      if (!r.success) { setNote(r.error ?? "Could not start payment"); return; }
      if (r.mode === "CASH") { setNote("Cash booking — pay the professional after the service. No online payment needed."); return; }
      if (r.message === "Already paid") { setNote("This booking is already paid."); return; }
      setRef(r.ref ?? null); setNote(r.message ?? null);
    } finally { setBusy(false); }
  };
  return (
    <section className="mt-6 mx-auto max-w-lg" aria-labelledby="pay-heading">
      <button type="button" aria-label="Back to bookings" onClick={onBack} className="text-sm font-bold text-[var(--accent)]">← My Bookings</button>
      <h1 id="pay-heading" className="mt-2 text-2xl font-extrabold tracking-tight">Pay for your visit</h1>
      <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="font-extrabold">{b.items[0]?.serviceName ?? "Service"}</p>
        <p className="text-sm text-[var(--dim)]">{prettyDate(b.scheduledDate)} · {b.scheduledSlot} · {b.providerName ?? "Professional assigning…"}</p>
        <ul className="mt-3.5 divide-y divide-[var(--border)] rounded-xl bg-[var(--bg)] px-3">
          {b.items.map((i) => <li key={i.id} className="flex justify-between py-2 text-sm"><span>{i.serviceName} × {i.quantity}</span><strong>{inr(i.lineTotal)}</strong></li>)}
          <li className="flex justify-between py-2 text-sm text-[var(--dim)]"><span>Visiting fee</span><span>{inr(b.visitingFee)}</span></li>
          <li className="flex justify-between py-2 text-base font-extrabold"><span>Total to pay</span><span>{inr(b.finalPrice)}</span></li>
        </ul>
        <p className="mt-3 text-[13px] text-[var(--dim)]">Method: <strong className="text-[var(--text)]">{b.paymentMethod}</strong> · Status: <strong className="text-[var(--text)]">{b.paymentStatus}</strong></p>
        {note && <p role="status" className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm">{note}</p>}
        {!ref ? (
          <button type="button" aria-label="Pay with mock gateway" disabled={busy} onClick={start} className="mt-4 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">{busy ? "Contacting gateway…" : `Pay ${inr(b.finalPrice)}`}</button>
        ) : (<>
          <p className="mt-3 text-xs text-[var(--dim)]">Gateway reference: <span className="font-mono">{ref}</span> (mock — no real money moves)</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button type="button" aria-label="Confirm successful payment" disabled={confirming} onClick={() => onConfirm(ref, true)} className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">Simulate success</button>
            <button type="button" aria-label="Simulate failed payment" disabled={confirming} onClick={() => onConfirm(ref, false)} className="rounded-xl border border-[var(--border)] py-3 text-sm font-bold">Simulate failure</button>
          </div>
        </>)}
      </div>
    </section>
  );
}

function CartDrawer({ cart, setQty, subtotal, visitingFee, onClose, onCheckout, onBrowse }: {
  cart: CartLine[]; setQty: (id: number, qty: number) => void;
  subtotal: number; visitingFee: number; onClose: () => void; onCheckout: () => void; onBrowse: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your cart">
      <button type="button" aria-label="Close cart" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[420px] max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-none bg-[var(--surface)] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Your visit</h2>
          <button type="button" aria-label="Close cart" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none">×</button>
        </div>
        {cart.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-4xl" aria-hidden>🛒</p>
            <p className="mt-2 font-bold">Your cart is empty</p>
            <p className="mt-1 text-sm text-[var(--dim)]">Add a service to start a booking.</p>
            <button type="button" aria-label="Browse services from cart" onClick={onBrowse} className="mt-4 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white">Browse services</button>
          </div>
        ) : (<>
          <ul className="mt-4 space-y-3">
            {cart.map((l) => (
              <li key={l.serviceId} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-3">
                <div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{l.name}</p><p className="text-xs text-[var(--dim)]">{inr(l.unitPrice)} each</p></div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" aria-label={`Decrease quantity of ${l.name}`} onClick={() => setQty(l.serviceId, l.qty - 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] font-bold">−</button>
                  <span className="w-6 text-center text-sm font-extrabold" aria-label={`Quantity of ${l.name}: ${l.qty}`}>{l.qty}</span>
                  <button type="button" aria-label={`Increase quantity of ${l.name}`} onClick={() => setQty(l.serviceId, l.qty + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] font-bold">+</button>
                </div>
                <p className="w-16 text-right text-sm font-extrabold shrink-0">{inr(l.unitPrice * l.qty)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 rounded-2xl bg-[var(--bg)] p-4 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--dim)]">Subtotal</dt><dd className="font-bold">{inr(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--dim)]">Visiting fee</dt><dd className="font-bold">{inr(visitingFee)}</dd></div>
            <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-extrabold"><dt>Total</dt><dd>{inr(subtotal + visitingFee)}</dd></div>
          </dl>
          <button type="button" aria-label="Proceed to booking details" onClick={onCheckout} className="mt-4 w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">Continue to booking →</button>
          <p className="mt-2 text-center text-xs text-[var(--muted)]">Next you will pick your professional on the map. One visit can cover several services.</p>
        </>)}
      </div>
    </div>
  );
}

/**
 * Rapido-style "Select on map" picker: the orange pin stays fixed in the
 * centre while the map pans underneath it. Search, locality chips, GPS and
 * tapping a locality marker re-centre the map; dragging moves the pin's
 * location live (coords + nearest locality update as you go), and
 * "Confirm location" locks the pin in. Works even when the map control
 * cannot render — search/chips/GPS still set the location.
 */
function RapidoPicker({ value, label, onPick, coverageRadiusKm, ariaLabel, heightClass = "h-[300px] sm:h-[340px]" }: {
  value: { lat: number; lng: number };
  label: string;
  onPick: (lat: number, lng: number, label: string) => void;
  coverageRadiusKm?: number | null;
  ariaLabel: string;
  heightClass?: string;
}) {
  const [live, setLive] = useState(value);
  const [mountCenter, setMountCenter] = useState<{ lat: number; lng: number } | null>(value);
  const [moving, setMoving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [locating, setLocating] = useState(false);
  const [pickerErr, setPickerErr] = useState<string | null>(null);
  const lastEmitted = useRef(value);
  const idleTimer = useRef<number | null>(null);

  const emit = (lat: number, lng: number, lab: string) => {
    const v = { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
    lastEmitted.current = v;
    onPick(v.lat, v.lng, lab);
  };

  // Recentres pushed in from outside (chips elsewhere, lat/lng inputs, GPS in parent).
  useEffect(() => {
    const d = Math.max(Math.abs(value.lat - lastEmitted.current.lat), Math.abs(value.lng - lastEmitted.current.lng));
    if (d > 0.00015) {
      lastEmitted.current = value;
      setLive(value);
      setMountCenter(value);
      setConfirmed(false);
    }
  }, [value]);

  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);

  const recenter = (lat: number, lng: number, lab?: string) => {
    setPickerErr(null);
    setMountCenter({ lat, lng });
    setLive({ lat, lng });
    setMoving(false);
    setConfirmed(false);
    emit(lat, lng, lab ?? areaLabelFor(lat, lng));
  };

  const handleCenter = (c: { lat: number; lng: number }) => {
    setLive(c);
    // A poll reading that matches the last emitted/programmatic centre is not
    // a user drag — keep the existing label (e.g. GPS) and confirmed state.
    const d = Math.max(Math.abs(c.lat - lastEmitted.current.lat), Math.abs(c.lng - lastEmitted.current.lng));
    if (d <= 0.00015) return;
    setMoving(true);
    setConfirmed(false);
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      setMoving(false);
      emit(c.lat, c.lng, areaLabelFor(c.lat, c.lng));
    }, 280);
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) { setPickerErr("Location is not available on this device. Search or tap a locality instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        recenter(Math.round(pos.coords.latitude * 10000) / 10000, Math.round(pos.coords.longitude * 10000) / 10000, "Current location (GPS), Dehradun");
      },
      () => { setLocating(false); setPickerErr("Could not get your location. Search or tap a locality instead."); },
      { timeout: 10000 },
    );
  };

  const confirmLocation = () => {
    const lab = label.startsWith("Current location (GPS)") ? label : areaLabelFor(live.lat, live.lng);
    emit(live.lat, live.lng, lab);
    setConfirmed(true);
    setPickerErr(null);
  };

  const places: MapPlace[] = AREA_PRESETS.map((a) => ({ label: a.label, lat: a.lat, lng: a.lng, kind: "area" as const }));
  const nearest = nearestAreaPreset(live.lat, live.lng);
  const nearestIdx = AREA_PRESETS.findIndex((a) => a.label === nearest.preset.label);
  const results = search.trim() ? AREA_PRESETS.filter((a) => a.label.toLowerCase().includes(search.trim().toLowerCase())) : [];

  return (
    <div>
      <div className="relative">
        <label htmlFor="rapido-search" className="sr-only">Search your area in Dehradun</label>
        <input id="rapido-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search your area — Prem Nagar, Sudhowala…" autoComplete="off"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-[var(--accent)]" />
        {search.trim() && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl" role="listbox" aria-label="Area search results">
            {results.length === 0 ? (
              <li className="px-3.5 py-2.5 text-[13px] text-[var(--dim)]">No Dehradun locality matches “{search}”. Drag the map instead.</li>
            ) : results.map((a) => (
              <li key={a.label}>
                <button type="button" role="option" aria-selected={label === a.label} aria-label={`Select area ${a.label}`} onClick={() => { recenter(a.lat, a.lng, a.label); setSearch(""); }} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-[var(--surface-alt)]">
                  <span aria-hidden>📍</span><span className="font-semibold">{a.label}</span><span className="ml-auto text-xs text-[var(--muted)]">{a.lat.toFixed(4)}, {a.lng.toFixed(4)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2">
        <ProviderMap
          places={places}
          selectedIndex={nearestIdx >= 0 ? nearestIdx : null}
          onSelect={(idx) => {
            if (idx == null) return;
            const preset = AREA_PRESETS[idx];
            if (preset) recenter(preset.lat, preset.lng, preset.label);
          }}
          center={mountCenter}
          zoom={14}
          onCenterChange={handleCenter}
          coverage={coverageRadiusKm != null ? { lat: value.lat, lng: value.lng, radiusKm: coverageRadiusKm } : null}
          overlay={(
            <div className={`rapido-pin-wrap ${moving ? "rapido-pin-wrap--moving" : "rapido-pin-wrap--settled"}`} aria-hidden="true">
              <div className="rapido-pin"><span className="rapido-pin__head"><span className="rapido-pin__dot" /></span><span className="rapido-pin__tail" /></div>
              <span className="rapido-pin-shadow" />
              {!moving && <span className="rapido-pin-pulse" />}
            </div>
          )}
          ariaLabel={ariaLabel}
          heightClass={heightClass}
        />
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">Drag the map — the orange pin stays in the centre, just like Rapido. The address below follows the pin.</p>

      <div className="mt-2.5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3.5">
        <p className="flex items-start gap-2 text-sm" role="status">
          <span aria-hidden>📍</span>
          <span className="min-w-0">
            <strong className="block leading-snug">{moving ? "Finding this spot…" : confirmed ? `Confirmed: ${label}` : label}</strong>
            <span className="block text-xs text-[var(--dim)]">{live.lat.toFixed(4)}, {live.lng.toFixed(4)} · nearest locality {nearest.preset.label.replace(", Dehradun", "")} ({nearest.km.toFixed(1)} km)</span>
          </span>
          {confirmed && !moving && <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ Pinned</span>}
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" aria-label="Confirm this location" onClick={confirmLocation} className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white ${confirmed && !moving ? "bg-emerald-600" : "bg-[var(--accent)] hover:bg-[var(--accent-hover)]"}`}>
            {confirmed && !moving ? "✓ Location confirmed" : "Confirm location"}
          </button>
          <button type="button" aria-label="Use my current location" disabled={locating} onClick={useMyLocation} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm font-bold disabled:opacity-40">◎ {locating ? "Locating…" : "GPS"}</button>
        </div>
        {pickerErr && <p role="alert" className="mt-2 text-[13px] font-semibold text-[var(--danger)]">{pickerErr}</p>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Dehradun localities">
        {AREA_PRESETS.map((a) => (
          <button key={a.label} type="button" aria-label={`Set location to ${a.label}`} aria-pressed={label === a.label} onClick={() => recenter(a.lat, a.lng, a.label)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${label === a.label ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{a.label.replace(", Dehradun", "")}</button>
        ))}
      </div>
    </div>
  );
}

function BookWizard({ cart, services, slots, visitingFee, subtotal, profile, pending, confirmed, initialProviderId, onClose, onSubmit, onDone }: {
  cart: CartLine[]; services: Service[]; slots: string[];
  visitingFee: number; subtotal: number; profile: { name: string; phone: string } | null; pending: boolean;
  confirmed: Booking | null; initialProviderId: number | null;
  onClose: () => void;
  onSubmit: (data: { items: { serviceId: number; quantity: number }[]; providerId: number | null; customerName: string; customerPhone: string; address: string; description: string; scheduledDate: string; scheduledSlot: string; paymentMethod: "UPI" | "CARD" | "CASH" }) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(tomorrowISO());
  const [slot, setSlot] = useState("10:00-12:00");
  const [payMethod, setPayMethod] = useState<"UPI" | "CARD" | "CASH">("UPI");
  const [providerId, setProviderId] = useState<number | null>(initialProviderId);
  const [areaLabel, setAreaLabel] = useState<string>(AREA_PRESETS[0].label);
  const [custLat, setCustLat] = useState<number>(AREA_PRESETS[0].lat);
  const [custLng, setCustLng] = useState<number>(AREA_PRESETS[0].lng);
  const [latText, setLatText] = useState<string | null>(null);
  const [lngText, setLngText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pickLocation = (lat: number, lng: number, lab: string) => {
    setCustLat(lat);
    setCustLng(lng);
    setAreaLabel(lab);
  };
  const commitLat = () => {
    if (latText == null) return;
    const v = Number(latText);
    if (Number.isFinite(v) && v >= -90 && v <= 90) { setCustLat(Math.round(v * 10000) / 10000); setAreaLabel("Custom location, Dehradun"); }
    setLatText(null);
  };
  const commitLng = () => {
    if (lngText == null) return;
    const v = Number(lngText);
    if (Number.isFinite(v) && v >= -180 && v <= 180) { setCustLng(Math.round(v * 10000) / 10000); setAreaLabel("Custom location, Dehradun"); }
    setLngText(null);
  };

  const providersQ2 = useQuery({ queryKey: ["providers", "wizard", custLat, custLng], queryFn: () => api.getProviders({ lat: custLat, lng: custLng }) });
  const allProvs: Provider[] = providersQ2.data?.providers ?? [];
  const cartServiceIds = new Set(cart.map((l) => l.serviceId));
  const eligible = allProvs.filter((p) => p.isAvailable && p.serviceIds.some((id) => cartServiceIds.has(id)));
  const selectedProv = providerId != null ? eligible.find((p) => p.id === providerId) ?? null : null;
  const places: MapPlace[] = [
    { label: `Your location · ${areaLabel}`, lat: custLat, lng: custLng, kind: "customer" },
    ...eligible.map((p) => ({ label: p.name, lat: p.latitude, lng: p.longitude, kind: "provider" as const, photoUrl: p.profileImageUrl, meta: `★${p.rating.toFixed(1)}` })),
  ];
  const selectedMapIndex = providerId != null ? eligible.findIndex((p) => p.id === providerId) + 1 : null;
  const effectiveSelectedMapIndex = selectedMapIndex != null && selectedMapIndex > 0 ? selectedMapIndex : null;

  const total = subtotal + visitingFee;

  const goStep2 = () => {
    if (cart.length === 0) { setErr("Your cart is empty — add a service first."); return; }
    if (name.trim().length < 2) { setErr("Please enter your name."); return; }
    if (phone.trim().length < 7) { setErr("Please enter a valid phone number."); return; }
    if (address.trim().length < 5) { setErr("Service address is required for booking."); return; }
    if (date < todayISO()) { setErr("Slot date cannot be in the past."); return; }
    setErr(null);
    setStep(2);
  };
  const submit = () => {
    setErr(null);
    onSubmit({
      items: cart.map((l) => ({ serviceId: l.serviceId, quantity: l.qty })),
      providerId, customerName: name.trim(), customerPhone: phone.trim(),
      address: `${address.trim()} (${areaLabel} · ${custLat.toFixed(4)}, ${custLng.toFixed(4)})`,
      description: notes.trim(), scheduledDate: date, scheduledSlot: slot, paymentMethod: payMethod,
    });
  };

  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
  const labelCls = "text-xs font-bold text-[var(--dim)]";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Book your visit">
      <button type="button" aria-label="Close booking form" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-2xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--surface)] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{confirmed ? "Booking confirmed" : "Book your visit"}</h2>
          <button type="button" aria-label="Close booking form" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none">×</button>
        </div>

        {confirmed ? (
          <div className="mt-4">
            <div className="rounded-3xl bg-emerald-50 dark:bg-emerald-950/30 p-5 text-center">
              <p className="text-4xl" aria-hidden>✅</p>
              <h3 className="mt-2 font-extrabold text-lg">Your visit is booked!</h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Booking #{confirmed.id} · {prettyDate(confirmed.scheduledDate)} · {confirmed.scheduledSlot}</p>
              {confirmed.providerName ? <p className="mt-1 text-sm"><strong>{confirmed.providerName}</strong> is assigned to you.</p> : <p className="mt-1 text-sm">We are assigning a professional — they will accept from the open pool shortly.</p>}
              {confirmed.startOtp && <p className="mt-3 rounded-xl bg-white/70 dark:bg-black/20 px-3.5 py-2.5 text-sm">🔑 Start code: <strong className="text-base tracking-[0.2em]">{confirmed.startOtp}</strong><br /><span className="text-xs text-[var(--dim)]">Share it only when your professional arrives.</span></p>}
            </div>
            <ul className="mt-4 divide-y divide-[var(--border)] rounded-2xl bg-[var(--bg)] px-3.5">
              {confirmed.items.map((i) => <li key={i.id} className="flex justify-between py-2 text-sm"><span>{i.serviceName} × {i.quantity}</span><strong>{inr(i.lineTotal)}</strong></li>)}
              <li className="flex justify-between py-2 text-sm text-[var(--dim)]"><span>Visiting fee</span><span>{inr(confirmed.visitingFee)}</span></li>
              <li className="flex justify-between py-2 font-extrabold"><span>Total ({confirmed.paymentMethod})</span><span>{inr(confirmed.finalPrice)}</span></li>
            </ul>
            <p className="mt-3 text-[13px] text-[var(--dim)]">📍 {confirmed.address} · For {confirmed.customerName} ({confirmed.customerPhone})</p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button type="button" aria-label="View my bookings after confirmation" onClick={onDone} className="rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white">View my bookings</button>
              <button type="button" aria-label="Done booking" onClick={onClose} className="rounded-xl border border-[var(--border)] py-3 text-sm font-bold">Done</button>
            </div>
          </div>
        ) : (
          <>
            <ol className="mt-3.5 flex items-center gap-2" aria-label="Booking steps">
              {([["1", "Details & map pin"], ["2", "Choose pro on map"], ["3", "Review & pay"]] as const).map(([n, label], i) => {
                const stepNum = i + 1;
                const active = step === stepNum;
                const done = step > stepNum;
                return (
                  <li key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${active || done ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active || done ? "bg-[var(--accent)] text-white" : "bg-[var(--border)]"}`}>{done ? "✓" : n}</span>
                      <span className={active ? "" : "hidden min-[480px]:inline"}>{label}</span>
                    </span>
                    {i < 2 && <span className={`h-px flex-1 ${done ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />}
                  </li>
                );
              })}
            </ol>

            {step === 1 && (
              <div className="mt-4">
                <ul className="divide-y divide-[var(--border)] rounded-2xl bg-[var(--bg)] px-3.5">
                  {cart.map((l) => <li key={l.serviceId} className="flex justify-between py-2 text-sm"><span>{l.name} × {l.qty}</span><strong>{inr(l.unitPrice * l.qty)}</strong></li>)}
                  <li className="flex justify-between py-2 text-sm text-[var(--dim)]"><span>Visiting fee</span><span>{inr(visitingFee)}</span></li>
                  <li className="flex justify-between py-2 font-extrabold"><span>Total</span><span>{inr(total)}</span></li>
                </ul>
                <form className="mt-4 space-y-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); goStep2(); }}>
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
                    <div><label htmlFor="bk-name" className={labelCls}>Your name</label><input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rajesh Kumar" className={inputCls} autoComplete="name" /></div>
                    <div><label htmlFor="bk-phone" className={labelCls}>Phone</label><input id="bk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" className={inputCls} autoComplete="tel" /></div>
                  </div>
                  <div>
                    <span className={labelCls} id="bk-area-label">Select on map — like Rapido</span>
                    <p className="mt-0.5 text-[13px] text-[var(--dim)]">Drag the map to drop the centre pin exactly where you are, search your locality, or tap GPS — then hit <strong>Confirm location</strong>. Professionals are sorted from that pin.</p>
                    <div className="mt-2">
                      <RapidoPicker
                        value={{ lat: custLat, lng: custLng }}
                        label={areaLabel}
                        onPick={pickLocation}
                        ariaLabel="Select on map: drag the Dehradun map so the fixed orange centre pin sits on your location, or search and tap a locality such as Prem Nagar, Sudhowala or Kheri Gaon."
                        heightClass="h-[320px] sm:h-[360px]"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><label htmlFor="bk-lat" className={labelCls}>Pin latitude</label><input id="bk-lat" type="number" step="0.0001" min={-90} max={90} value={latText ?? custLat.toFixed(4)} onChange={(e) => setLatText(e.target.value)} onBlur={commitLat} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLat(); } }} className={inputCls} /></div>
                      <div><label htmlFor="bk-lng" className={labelCls}>Pin longitude</label><input id="bk-lng" type="number" step="0.0001" min={-180} max={180} value={lngText ?? custLng.toFixed(4)} onChange={(e) => setLngText(e.target.value)} onBlur={commitLng} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLng(); } }} className={inputCls} /></div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">Fine-tune with exact coordinates — press Enter or tap away and the map pin jumps there.</p>
                  </div>
                  <div><label htmlFor="bk-address" className={labelCls}>Service address</label><textarea id="bk-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Flat, street, landmark" className={inputCls} /></div>
                  <div><label htmlFor="bk-notes" className={labelCls}>What needs doing? (optional)</label><input id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Leaky tap in kitchen, bring a ladder…" className={inputCls} /></div>
                  <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
                    <div><label htmlFor="bk-date" className={labelCls}>Visit date</label><input id="bk-date" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></div>
                    <div><label htmlFor="bk-slot" className={labelCls}>Time slot</label>
                      <select id="bk-slot" value={slot} onChange={(e) => setSlot(e.target.value)} className={inputCls} aria-label="Time slot">{slots.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                  </div>
                  <fieldset>
                    <legend className={labelCls}>Payment method</legend>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {(["UPI", "CARD", "CASH"] as const).map((m) => (
                        <button key={m} type="button" aria-label={`Pay by ${m}`} aria-pressed={payMethod === m} onClick={() => setPayMethod(m)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${payMethod === m ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)]"}`}>{m}</button>
                      ))}
                    </div>
                  </fieldset>
                  {err && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">{err}</p>}
                  <button type="submit" aria-label="Continue to choose professional on map" className="w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-white hover:bg-[var(--accent-hover)]">Continue — choose your professional →</button>
                  <p className="text-center text-xs text-[var(--muted)]">{services.length} services · prices locked at booking · pay online or cash after the visit</p>
                </form>
              </div>
            )}

            {step === 2 && (
              <div className="mt-4">
                <h3 className="font-extrabold">Choose your professional</h3>
                <p className="mt-0.5 text-sm text-[var(--dim)]">Professionals near {areaLabel} for {prettyDate(date)} · {slot}. Tap a circular photo marker on the map or a card below — both stay in sync.</p>
                {providersQ2.isPending ? <p className="mt-4 text-sm text-[var(--dim)]">Finding professionals near you…</p> : eligible.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
                    <p className="text-3xl" aria-hidden>🧑‍🔧</p>
                    <p className="mt-1 font-bold">No available professional for this cart right now</p>
                    <p className="mt-0.5 text-sm text-[var(--dim)]">Continue with auto-assign and we will match you from the open pool.</p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <ProviderMap
                      places={places}
                      selectedIndex={effectiveSelectedMapIndex}
                      onSelect={(idx) => {
                        if (idx == null || idx === 0) { setProviderId(null); return; }
                        const p = eligible[idx - 1];
                        if (p) setProviderId(p.id);
                      }}
                      ariaLabel="Map of available professionals near you. Tap a circular photo marker to select that professional."
                      heightClass="h-[320px] sm:h-[360px]"
                    />
                    <p className="mt-1.5 text-xs text-[var(--muted)]">⌂ is you. Each circle is a verified professional&apos;s photo with their rating.</p>
                  </div>
                )}

                <button type="button" aria-label="Auto-assign fastest professional" aria-pressed={providerId == null} onClick={() => setProviderId(null)} className={`mt-3 flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left ${providerId == null ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"}`}>
                  <span className="text-2xl" aria-hidden>⚡</span>
                  <span className="flex-1"><span className="block font-extrabold text-sm">Auto-assign (fastest)</span><span className="block text-[13px] text-[var(--dim)]">We match the nearest available verified pro. No OTP until someone accepts.</span></span>
                  {providerId == null && <span className="font-extrabold text-[var(--accent)]">Selected ✓</span>}
                </button>

                <div className="mt-3 grid grid-cols-1 min-[560px]:grid-cols-2 gap-3">
                  {eligible.map((p) => {
                    const isSel = providerId === p.id;
                    return (
                      <article key={p.id} className={`rounded-2xl border bg-[var(--surface)] p-3.5 ${isSel ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[var(--border)]"}`}>
                        <div className="flex gap-3">
                          <img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-12 w-12 rounded-full object-cover shrink-0 border-2 border-white shadow" />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm leading-tight">{p.name}</p>
                            <p className="text-xs text-[var(--dim)]">★ {p.rating.toFixed(1)} ({p.totalReviews}) · {p.distanceKm.toFixed(1)} km · {p.experienceYears} yrs</p>
                            <p className="text-xs text-[var(--dim)] line-clamp-1">{serviceNames(p.serviceIds, services)}</p>
                          </div>
                        </div>
                        <button type="button" aria-label={isSel ? `${p.name} selected` : `Select ${p.name} as my professional`} aria-pressed={isSel} onClick={() => setProviderId(p.id)} className={`mt-2.5 w-full rounded-lg py-2 text-[13px] font-bold ${isSel ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>
                          {isSel ? "Selected ✓" : `Select ${p.name.split(" ")[0]}`}
                        </button>
                      </article>
                    );
                  })}
                </div>

                {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">{err}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button type="button" aria-label="Back to booking details" onClick={() => setStep(1)} className="rounded-xl border border-[var(--border)] py-3 text-sm font-bold">← Details</button>
                  <button type="button" aria-label="Continue to review booking" onClick={() => setStep(3)} className="rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white">Review booking →</button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-4">
                <h3 className="font-extrabold">Review &amp; confirm</h3>
                <div className="mt-3 rounded-2xl border border-[var(--border)] p-4">
                  <div className="flex gap-3">
                    {selectedProv ? <img src={selectedProv.profileImageUrl} alt={selectedProv.name} className="h-12 w-12 rounded-full object-cover shrink-0" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xl shrink-0" aria-hidden>⚡</span>}
                    <div>
                      <p className="font-extrabold text-sm">{selectedProv ? selectedProv.name : "Auto-assign — nearest verified pro"}</p>
                      <p className="text-[13px] text-[var(--dim)]">{selectedProv ? `★ ${selectedProv.rating.toFixed(1)} · ${selectedProv.distanceKm.toFixed(1)} km away · ${selectedProv.address}` : "Assigned from the open pool as soon as a pro accepts"}</p>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex gap-2"><dt aria-hidden>📅</dt><dd><strong>{prettyDate(date)}</strong> · {slot}</dd></div>
                    <div className="flex gap-2"><dt aria-hidden>📍</dt><dd className="break-words">{address} ({areaLabel} · {custLat.toFixed(4)}, {custLng.toFixed(4)} — selected on map)</dd></div>
                    <div className="flex gap-2"><dt aria-hidden>👤</dt><dd>{name} · {phone}</dd></div>
                    {notes && <div className="flex gap-2"><dt aria-hidden>📝</dt><dd className="break-words">{notes}</dd></div>}
                  </dl>
                </div>
                <ul className="mt-3 divide-y divide-[var(--border)] rounded-2xl bg-[var(--bg)] px-3.5">
                  {cart.map((l) => <li key={l.serviceId} className="flex justify-between py-2 text-sm"><span>{l.name} × {l.qty}</span><strong>{inr(l.unitPrice * l.qty)}</strong></li>)}
                  <li className="flex justify-between py-2 text-sm text-[var(--dim)]"><span>Visiting fee</span><span>{inr(visitingFee)}</span></li>
                  <li className="flex justify-between py-2 font-extrabold"><span>Total · {payMethod}</span><span>{inr(total)}</span></li>
                </ul>
                <p className="mt-2.5 text-[13px] text-[var(--dim)]">{selectedProv ? "Picking a professional confirms the assignment and issues your 4-digit start OTP on the next screen." : "With auto-assign, your OTP appears once a professional accepts."} {payMethod === "CASH" ? "Pay in cash after the visit." : "You can pay online from My Bookings."}</p>
                {err && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">{err}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button type="button" aria-label="Back to choose professional" onClick={() => setStep(2)} className="rounded-xl border border-[var(--border)] py-3 text-sm font-bold">← Choose pro</button>
                  <button type="button" aria-label="Confirm booking" disabled={pending} onClick={submit} className="rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white disabled:opacity-50">
                    {pending ? "Booking…" : `Confirm booking · ${inr(total)}`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProfileModal({ profile, bookingsCount, onClose, onSave, onReset }: {
  profile: { name: string; phone: string } | null; bookingsCount: number;
  onClose: () => void; onSave: (p: { name: string; phone: string }) => void; onReset: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your profile">
      <button type="button" aria-label="Close profile" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[var(--surface)] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{profile ? `Hi, ${profile.name.split(" ")[0]}` : "Welcome to UrbanService"}</h2>
          <button type="button" aria-label="Close profile" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none">×</button>
        </div>
        <p className="mt-1 text-sm text-[var(--dim)]">Your details prefill the booking form. {bookingsCount > 0 ? `You have ${bookingsCount} booking${bookingsCount > 1 ? "s" : ""}.` : ""}</p>
        <form className="mt-4 space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); if (name.trim().length >= 2) onSave({ name: name.trim(), phone: phone.trim() }); }}>
          <div><label htmlFor="pf-name" className="text-xs font-bold text-[var(--dim)]">Name</label><input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm" autoComplete="name" /></div>
          <div><label htmlFor="pf-phone" className="text-xs font-bold text-[var(--dim)]">Phone</label><input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm" autoComplete="tel" /></div>
          <button type="submit" aria-label="Save profile" className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white">Save profile</button>
        </form>
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <p className="text-sm font-extrabold">Demo data</p>
          <p className="mt-0.5 text-[13px] text-[var(--dim)]">Restore the services and professionals, and clear all bookings.</p>
          {!confirmReset ? (
            <button type="button" aria-label="Reset demo data" onClick={() => setConfirmReset(true)} className="mt-2.5 rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-[var(--danger)]">Reset catalogue &amp; bookings</button>
          ) : (
            <div className="mt-2.5 flex gap-2">
              <button type="button" aria-label="Confirm reset" onClick={onReset} className="rounded-lg bg-[var(--danger)] px-4 py-2 text-[13px] font-bold text-white">Yes, reset everything</button>
              <button type="button" aria-label="Cancel reset" onClick={() => setConfirmReset(false)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-[13px] font-bold">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEMO_ROLES: { role: Role; label: string; note: string }[] = [
  { role: "customer", label: "Customer demo", note: "Rajesh Kumar — bookings & map" },
  { role: "provider", label: "Provider demo", note: "Amit Verma — revenue dashboard" },
  { role: "admin", label: "Admin demo", note: "Platform Admin — KYC & console" },
];

function LoginView({ onSuccess, onGoRegister }: { onSuccess: (u: AuthUser) => void; onGoRegister: () => void }) {
  const [role, setRole] = useState<Role>("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const loginMut = useMutation({
    mutationFn: () => api.loginUser({ email, password, role }),
    onSuccess: (r) => {
      if (!r.success || !r.user) { setErr(r.error ?? "Login failed. Check your details."); return; }
      setErr(null);
      onSuccess(r.user as AuthUser);
    },
    onError: () => setErr("Login failed. Check your connection and try again."),
  });
  const demoMut = useMutation({
    mutationFn: (demoRole: Role) => api.demoLogin({ role: demoRole }),
    onSuccess: (r) => {
      if (!r.success || !r.user) { setErr(r.error ?? "Demo sign-in failed. Try again."); return; }
      setErr(null);
      onSuccess(r.user as AuthUser);
    },
    onError: () => setErr("Demo sign-in failed. Try again."),
  });
  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm";
  const labelCls = "text-xs font-bold text-[var(--dim)]";
  return (
    <section className="mt-6 mx-auto max-w-lg" aria-labelledby="login-heading">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
        <h1 id="login-heading" className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--dim)]">Sign in to your UrbanService account.</p>
        <div className="mt-5"><RoleSelector value={role} onChange={setRole} idPrefix="login" /></div>
        <form className="mt-5 space-y-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); setErr(null); loginMut.mutate(); }}>
          <div><label htmlFor="login-email" className={labelCls}>Email</label><input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={inputCls} /></div>
          <div><label htmlFor="login-password" className={labelCls}>Password</label><input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" className={inputCls} /></div>
          <p className="text-[13px] text-[var(--dim)]">
            {role === "customer" && "Customers land on Home and see bookings under My Bookings."}
            {role === "provider" && "Providers land on their revenue dashboard with jobs, service-area map and KYC."}
            {role === "admin" && "Admins land on the protected console: KYC approvals, providers, bookings and revenue."}
          </p>
          {err && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">{err}</p>}
          <button type="submit" aria-label={`Sign in as ${role}`} disabled={loginMut.isPending || email.trim().length < 3 || password.length < 1} className="w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-white disabled:opacity-40">
            {loginMut.isPending ? "Signing in…" : `Sign in as ${role === "provider" ? "Service Provider" : role === "admin" ? "Admin" : "Customer"}`}
          </button>
        </form>
        <div className="mt-5 rounded-2xl bg-[var(--bg)] p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--dim)]">Explore with one-tap demo sign-in</p>
          <p className="mt-1 text-xs text-[var(--dim)]">Demo credentials stay on the server — pick a role to look around. Anything you book or approve is saved.</p>
          <div className="mt-2.5 space-y-2">
            {DEMO_ROLES.map((d) => (
              <button key={d.role} type="button" aria-label={`Continue with demo account ${d.label}`} disabled={demoMut.isPending} onClick={() => demoMut.mutate(d.role)} className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-left disabled:opacity-50">
                <span aria-hidden>{d.role === "admin" ? "🛡️" : d.role === "provider" ? "🧑‍🔧" : "🏠"}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold truncate">{d.label}</span><span className="block text-xs text-[var(--dim)] truncate">{d.note}</span></span>
                <span className="text-xs font-bold text-[var(--accent)]">{demoMut.isPending ? "Opening…" : "Continue →"}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-[var(--dim)]">New to UrbanService? <button type="button" aria-label="Create an account" onClick={onGoRegister} className="font-bold text-[var(--accent)]">Create an account</button></p>
      </div>
    </section>
  );
}

function RegisterView({ services, onSuccess, onGoLogin }: { services: Service[]; onSuccess: (u: AuthUser) => void; onGoLogin: () => void }) {
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [expYears, setExpYears] = useState("3");
  const [bio, setBio] = useState("");
  const [certs, setCerts] = useState("");
  const [areaLabel, setAreaLabel] = useState<string>(AREA_PRESETS[0].label);
  const [radius, setRadius] = useState(8);
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [bank, setBank] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const registerMut = useMutation({
    mutationFn: () => {
      const area = AREA_PRESETS.find((a) => a.label === areaLabel) ?? AREA_PRESETS[0];
      return api.registerUser({
        name, email, phone, password, role,
        address,
        inviteCode: role === "admin" ? inviteCode : undefined,
        serviceIds: role === "provider" ? serviceIds : undefined,
        experienceYears: role === "provider" ? Number(expYears) || 0 : undefined,
        bio: role === "provider" ? bio : undefined,
        certifications: role === "provider" ? certs.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        latitude: role === "provider" ? area.lat : undefined,
        longitude: role === "provider" ? area.lng : undefined,
        serviceAreaLabel: role === "provider" ? areaLabel : undefined,
        serviceRadiusKm: role === "provider" ? radius : undefined,
        kycAadhaar: role === "provider" && aadhaar ? aadhaar : undefined,
        kycPan: role === "provider" && pan ? pan : undefined,
        kycBankAccount: role === "provider" && bank ? bank : undefined,
      });
    },
    onSuccess: (r) => {
      if (!r.success || !r.user) { setErr(r.error ?? "Could not create your account."); return; }
      setErr(null);
      onSuccess(r.user as AuthUser);
    },
    onError: () => setErr("Could not create your account. Check the details and try again."),
  });

  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm";
  const labelCls = "text-xs font-bold text-[var(--dim)]";
  const toggleService = (id: number) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <section className="mt-6 mx-auto max-w-lg" aria-labelledby="register-heading">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
        <h1 id="register-heading" className="text-2xl font-extrabold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-[var(--dim)]">Join UrbanService in under a minute.</p>
        <div className="mt-5"><RoleSelector value={role} onChange={setRole} idPrefix="register" /></div>
        <form className="mt-5 space-y-3.5" onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim().length < 2) { setErr("Please enter your full name."); return; }
          if (phone.trim().length < 7) { setErr("Please enter a valid phone number."); return; }
          if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
          if (role === "provider" && serviceIds.length === 0) { setErr("Pick at least one service you offer."); return; }
          setErr(null);
          registerMut.mutate();
        }}>
          <div><label htmlFor="reg-name" className={labelCls}>Full name</label><input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" className={inputCls} /></div>
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
            <div><label htmlFor="reg-email" className={labelCls}>Email</label><input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={inputCls} /></div>
            <div><label htmlFor="reg-phone" className={labelCls}>Phone</label><input id="reg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="tel" autoComplete="tel" className={inputCls} /></div>
          </div>
          <div><label htmlFor="reg-password" className={labelCls}>Password (6+ characters)</label><input id="reg-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" className={inputCls} /></div>

          {role === "customer" && (
            <div><label htmlFor="reg-address" className={labelCls}>Home address</label><textarea id="reg-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Flat, street, landmark, Dehradun" className={inputCls} /></div>
          )}

          {role === "provider" && (
            <>
              <fieldset>
                <legend className={labelCls}>Services you offer</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {services.map((s) => {
                    const on = serviceIds.includes(s.id);
                    return <button key={s.id} type="button" aria-label={`${on ? "Remove" : "Add"} offered service ${s.name}`} aria-pressed={on} onClick={() => toggleService(s.id)} className={`rounded-full px-3.5 py-2 text-[13px] font-bold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{s.name}</button>;
                  })}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
                <div><label htmlFor="reg-exp" className={labelCls}>Years of experience</label><input id="reg-exp" type="number" min={0} max={60} value={expYears} onChange={(e) => setExpYears(e.target.value)} className={inputCls} /></div>
                <div><label htmlFor="reg-certs" className={labelCls}>Certifications (comma separated)</label><input id="reg-certs" value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="Licensed Electrician" className={inputCls} /></div>
              </div>
              <div><label htmlFor="reg-bio" className={labelCls}>About you</label><textarea id="reg-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="Tell customers about your experience…" className={inputCls} /></div>
              <div>
                <span className={labelCls} id="reg-area-label">Your service area</span>
                <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-labelledby="reg-area-label">
                  {AREA_PRESETS.map((a) => (
                    <button key={a.label} type="button" aria-label={`Set registration service area to ${a.label}`} aria-pressed={areaLabel === a.label} onClick={() => setAreaLabel(a.label)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${areaLabel === a.label ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{a.label.replace(", Dehradun", "")}</button>
                  ))}
                </div>
                <label htmlFor="reg-radius" className="mt-3 block text-xs font-bold text-[var(--dim)]">Coverage radius: {radius} km (you can fine-tune this on the map in your dashboard)</label>
                <input id="reg-radius" type="range" min={2} max={25} step={1} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="mt-1.5 w-full accent-[#e8650a]" aria-label={`Registration coverage radius ${radius} kilometres`} />
              </div>
              <fieldset className="rounded-2xl border border-[var(--border)] p-3.5">
                <legend className="text-xs font-bold text-[var(--dim)] px-1">KYC documents (admins verify these before you get jobs)</legend>
                <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-3">
                  <div><label htmlFor="reg-aadhaar" className={labelCls}>Aadhaar</label><input id="reg-aadhaar" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} placeholder="XXXX-XXXX-1234" className={inputCls} /></div>
                  <div><label htmlFor="reg-pan" className={labelCls}>PAN</label><input id="reg-pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={inputCls} /></div>
                  <div><label htmlFor="reg-bank" className={labelCls}>Bank account</label><input id="reg-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="XXXXXX1234" className={inputCls} /></div>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">Adding KYC now sends it straight to the admin review queue as Pending.</p>
              </fieldset>
            </>
          )}

          {role === "admin" && (
            <div>
              <label htmlFor="reg-invite" className={labelCls}>Admin invite code</label>
              <input id="reg-invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Ask your platform owner" className={inputCls} />
              <p className="mt-1 text-xs text-[var(--muted)]">Admin accounts are invite-only. Ask your platform owner for the current code.</p>
            </div>
          )}

          {err && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">{err}</p>}
          <button type="submit" aria-label={`Create ${role} account`} disabled={registerMut.isPending} className="w-full rounded-xl bg-[var(--accent)] py-3.5 text-sm font-bold text-white disabled:opacity-40">
            {registerMut.isPending ? "Creating account…" : role === "provider" ? "Create provider account" : role === "admin" ? "Create admin account" : "Create customer account"}
          </button>
          <p className="text-center text-xs text-[var(--muted)]">
            {role === "customer" && "You will land on Home, ready to book."}
            {role === "provider" && "You will land on your provider dashboard. Finish KYC there to start accepting jobs."}
            {role === "admin" && "You will land on the protected Admin Dashboard."}
          </p>
        </form>
        <p className="mt-5 text-center text-sm text-[var(--dim)]">Already have an account? <button type="button" aria-label="Sign in instead" onClick={onGoLogin} className="font-bold text-[var(--accent)]">Sign in</button></p>
      </div>
    </section>
  );
}

type AdminTab = "overview" | "kyc" | "providers" | "bookings" | "customers" | "revenue" | "settings";

function AdminView({ overview, overviewLoading, providers, providersLoading, bookings, customers, customersLoading, settings, services, say, invalidate, onOpenProvider, onKyc }: {
  overview: ApiResponse<typeof api, "getAdminOverview"> | undefined;
  overviewLoading: boolean;
  providers: AdminProvider[]; providersLoading: boolean;
  bookings: Booking[];
  customers: ApiResponse<typeof api, "listCustomers">["customers"];
  customersLoading: boolean;
  settings: Settings | undefined;
  services: Service[];
  say: (m: string) => void; invalidate: () => void;
  onOpenProvider: (p: AdminProvider) => void;
  onKyc: (providerId: number, status: "approved" | "rejected" | "pending", reason?: string) => void;
}) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [kycFilter, setKycFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [pQuery, setPQuery] = useState("");
  const [pStatus, setPStatus] = useState<string>("all");
  const [pKyc, setPKyc] = useState<string>("all");
  const [pSort, setPSort] = useState<"name" | "rating" | "revenue" | "bookings">("name");
  const [bStatus, setBStatus] = useState<string>("all");
  const [cQuery, setCQuery] = useState("");

  const stats = overview?.stats;
  const monthly = overview?.monthlyRevenue ?? [];
  const pendingKycProviders = providers.filter((p) => p.kycStatus === "pending");
  const kycList = providers.filter((p) => kycFilter === "all" ? p.kycStatus !== "not_submitted" : p.kycStatus === kycFilter);

  const filteredProviders = useMemo(() => {
    const q = pQuery.trim().toLowerCase();
    let rows = providers.filter((p) =>
      (pStatus === "all" || p.accountStatus === pStatus) &&
      (pKyc === "all" || p.kycStatus === pKyc) &&
      (q === "" || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.phone.includes(q) || serviceNames(p.serviceIds, services).toLowerCase().includes(q)),
    );
    rows = [...rows].sort((a, b) => pSort === "rating" ? b.rating - a.rating : pSort === "revenue" ? b.totalRevenue - a.totalRevenue : pSort === "bookings" ? b.bookingsCount - a.bookingsCount : a.name.localeCompare(b.name));
    return rows;
  }, [providers, pQuery, pStatus, pKyc, pSort, services]);

  const filteredBookings = bookings.filter((b) => bStatus === "all" || b.status === bStatus);
  const filteredCustomers = customers.filter((c) => cQuery.trim() === "" || c.name.toLowerCase().includes(cQuery.trim().toLowerCase()) || c.phone.includes(cQuery.trim()));
  const commission = settings?.commissionPercent ?? 10;
  const grossRevenue = stats?.totalRevenue ?? 0;

  const tabs: [AdminTab, string][] = [["overview", "Overview"], ["kyc", `KYC Verification (${pendingKycProviders.length})`], ["providers", "Providers"], ["bookings", "Bookings"], ["customers", "Customers"], ["revenue", "Revenue"], ["settings", "Settings"]];

  return (
    <section className="mt-6" aria-labelledby="admin-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Protected · Admin only</p>
          <h1 id="admin-heading" className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--dim)]">Verify professionals, run the marketplace and watch revenue — full platform control.</p>
        </div>
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--accent)]">🛡️ Administrator</span>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Admin dashboard sections">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} aria-label={label} onClick={() => setTab(t)} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${tab === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mt-4">
          {overviewLoading && !stats ? <p className="text-sm text-[var(--dim)]">Loading platform analytics…</p> : stats ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <AnalyticsCard value={String(stats.totalUsers)} label="Total users" sub="Registered accounts (all roles)" />
                <AnalyticsCard value={String(stats.totalProviders)} label="Total service providers" />
                <AnalyticsCard value={String(stats.totalBookings)} label="Total bookings" sub={`${stats.completedBookings} completed`} />
                <AnalyticsCard value={inr(stats.totalRevenue)} label="Total revenue" sub="Completed bookings" />
                <AnalyticsCard value={String(stats.pendingKyc)} label="Pending KYC requests" sub={stats.pendingKyc > 0 ? "Needs review below" : "Queue is clear"} />
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <h3 className="font-extrabold">Platform revenue — last 6 months</h3>
                  <div className="mt-3"><RevenueChart data={monthly} ariaLabel="Bar chart of platform revenue for the last 6 months" /></div>
                </div>
                <div className="lg:col-span-2 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="flex items-center justify-between"><h3 className="font-extrabold">KYC awaiting review</h3><button type="button" aria-label="Review KYC requests" onClick={() => setTab("kyc")} className="text-sm font-bold text-[var(--accent)]">Review →</button></div>
                  {pendingKycProviders.length === 0 ? <p className="mt-3 text-sm text-[var(--dim)]">🎉 No pending KYC. Every professional is reviewed.</p> : (
                    <ul className="mt-3 space-y-2.5">
                      {pendingKycProviders.slice(0, 5).map((p) => (
                        <li key={p.id}>
                          <button type="button" aria-label={`Review KYC for ${p.name}`} onClick={() => onOpenProvider(p)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] p-3 text-left">
                            <img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-10 w-10 rounded-full object-cover shrink-0" />
                            <span className="min-w-0 flex-1"><span className="block font-bold text-sm truncate">{p.name}</span><span className="block text-xs text-[var(--dim)] truncate">{serviceNames(p.serviceIds, services)} · {p.address}</span></span>
                            <KycBadge status={p.kycStatus} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <h3 className="font-extrabold">Recent bookings</h3>
                {(overview?.recentBookings ?? []).length === 0 ? <p className="mt-2 text-sm text-[var(--dim)]">No bookings yet.</p> : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">ID</th><th className="py-2 pr-3 font-bold">Service</th><th className="py-2 pr-3 font-bold">Customer</th><th className="py-2 pr-3 font-bold">Professional</th><th className="py-2 pr-3 font-bold">Visit</th><th className="py-2 pr-3 font-bold">Status</th><th className="py-2 font-bold text-right">Amount</th></tr></thead>
                      <tbody>{(overview?.recentBookings ?? []).map((b) => (
                        <tr key={b.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">#{b.id}</td><td className="py-2 pr-3">{b.items[0]?.serviceName ?? "Service"}</td><td className="py-2 pr-3">{b.customerName}</td><td className="py-2 pr-3">{b.providerName ?? "Auto-assign"}</td><td className="py-2 pr-3">{prettyDate(b.scheduledDate)}</td><td className="py-2 pr-3"><StatusBadge status={b.status} /></td><td className="py-2 font-extrabold text-right">{inr(b.finalPrice)}</td>
                        </tr>))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : <p className="text-sm text-[var(--dim)]">Could not load analytics. Try again in a moment.</p>}
        </div>
      )}

      {tab === "kyc" && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter KYC by status">
            {(["all", "pending", "approved", "rejected"] as const).map((f) => (
              <button key={f} type="button" aria-label={`Show KYC: ${f}`} aria-pressed={kycFilter === f} onClick={() => setKycFilter(f)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold capitalize ${kycFilter === f ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}>{f === "all" ? "All submitted" : f}</button>
            ))}
          </div>
          {providersLoading ? <p className="mt-4 text-sm text-[var(--dim)]">Loading KYC queue…</p> : kycList.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
              <p className="text-3xl" aria-hidden>🪪</p><h3 className="mt-2 font-bold">No {kycFilter === "all" ? "" : kycFilter + " "}KYC requests</h3><p className="mt-1 text-sm text-[var(--dim)]">New professional registrations with documents will appear here.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {kycList.map((p) => (
                <article key={p.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap gap-3">
                    <img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-14 w-14 rounded-full object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold flex flex-wrap items-center gap-2">{p.name} <KycBadge status={p.kycStatus} /> <AccountBadge status={p.accountStatus} /></h3>
                      <p className="text-[13px] text-[var(--dim)]">{serviceNames(p.serviceIds, services)} · {p.experienceYears} yrs · {p.address}</p>
                      <p className="text-[13px] text-[var(--dim)]">{p.email} · {p.phone}</p>
                      <p className="mt-1 text-[13px]">Aadhaar: <strong>{p.kycAadhaar ?? "—"}</strong> · PAN: <strong>{p.kycPan ?? "—"}</strong> · Bank: <strong>{p.kycBankAccount ?? "—"}</strong></p>
                      {p.kycRejectionReason && <p className="mt-1 text-[13px] text-[var(--danger)]">Last rejection: {p.kycRejectionReason}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    <button type="button" aria-label={`View documents and details for ${p.name}`} onClick={() => onOpenProvider(p)} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">View documents &amp; details</button>
                    {p.kycStatus !== "approved" && <button type="button" aria-label={`Approve KYC for ${p.name}`} onClick={() => onKyc(p.id, "approved")} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white">Approve KYC</button>}
                    {p.kycStatus !== "rejected" && (
                      <>
                        <label htmlFor={`reject-${p.id}`} className="sr-only">Rejection reason for {p.name}</label>
                        <input id={`reject-${p.id}`} value={rejectReason[p.id] ?? ""} onChange={(e) => setRejectReason((m) => ({ ...m, [p.id]: e.target.value }))} placeholder="Rejection reason (required to reject)" className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]" />
                        <button type="button" aria-label={`Reject KYC for ${p.name}`} onClick={() => onKyc(p.id, "rejected", rejectReason[p.id] ?? "")} className="rounded-lg bg-[var(--danger)] px-3.5 py-2 text-[13px] font-bold text-white">Reject</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "providers" && (
        <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-extrabold">Provider management</h3>
          <p className="mt-0.5 text-sm text-[var(--dim)]">Search, filter and sort every professional. Click a row for the full file: KYC, services, reviews, revenue and account controls.</p>
          <div className="mt-3 grid grid-cols-1 min-[640px]:grid-cols-4 gap-2.5">
            <div className="min-[640px]:col-span-2"><label htmlFor="ap-search" className="sr-only">Search providers</label><input id="ap-search" value={pQuery} onChange={(e) => setPQuery(e.target.value)} placeholder="Search name, email, phone, service…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm" /></div>
            <div><label htmlFor="ap-status" className="sr-only">Filter by account status</label>
              <select id="ap-status" value={pStatus} onChange={(e) => setPStatus(e.target.value)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm" aria-label="Filter providers by account status">
                <option value="all">Account: All</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deactivated">Deactivated</option><option value="removed">Removed</option>
              </select></div>
            <div><label htmlFor="ap-sort" className="sr-only">Sort providers</label>
              <select id="ap-sort" value={pSort} onChange={(e) => setPSort(e.target.value as typeof pSort)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm" aria-label="Sort providers">
                <option value="name">Sort: Name A–Z</option><option value="rating">Sort: Highest rated</option><option value="revenue">Sort: Top revenue</option><option value="bookings">Sort: Most bookings</option>
              </select></div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Filter providers by KYC status">
            {(["all", "approved", "pending", "rejected", "not_submitted"] as const).map((f) => (
              <button key={f} type="button" aria-label={`KYC filter: ${f}`} aria-pressed={pKyc === f} onClick={() => setPKyc(f)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${pKyc === f ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}>{f === "all" ? "KYC: All" : f.replace("_", " ")}</button>
            ))}
          </div>
          {providersLoading ? <p className="mt-4 text-sm text-[var(--dim)]">Loading providers…</p> : filteredProviders.length === 0 ? (
            <p className="mt-4 rounded-xl bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--dim)]">No providers match these filters. Try clearing the search.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">Professional</th><th className="py-2 pr-3 font-bold">Services</th><th className="py-2 pr-3 font-bold">Rating</th><th className="py-2 pr-3 font-bold">KYC</th><th className="py-2 pr-3 font-bold">Account</th><th className="py-2 pr-3 font-bold">Bookings</th><th className="py-2 font-bold text-right">Revenue</th></tr></thead>
                <tbody>
                  {filteredProviders.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] cursor-pointer" onClick={() => onOpenProvider(p)} tabIndex={0} aria-label={`Open details for ${p.name}`} onKeyDown={(e) => { if (e.key === "Enter") onOpenProvider(p); }}>
                      <td className="py-2.5 pr-3"><span className="flex items-center gap-2.5"><img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-9 w-9 rounded-full object-cover shrink-0" /><span><span className="block font-bold leading-tight">{p.name}</span><span className="block text-xs text-[var(--dim)]">{p.phone}</span></span></span></td>
                      <td className="py-2.5 pr-3">{serviceNames(p.serviceIds, services)}</td>
                      <td className="py-2.5 pr-3">★ {p.rating.toFixed(1)} ({p.totalReviews})</td>
                      <td className="py-2.5 pr-3"><KycBadge status={p.kycStatus} /></td>
                      <td className="py-2.5 pr-3"><AccountBadge status={p.accountStatus} /></td>
                      <td className="py-2.5 pr-3">{p.completedCount}/{p.bookingsCount} done</td>
                      <td className="py-2.5 font-extrabold text-right">{inr(p.totalRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div><h3 className="font-extrabold">Booking management</h3><p className="mt-0.5 text-sm text-[var(--dim)]">Every booking on the platform, newest first.</p></div>
            <div><label htmlFor="ab-status" className="sr-only">Filter bookings by status</label>
              <select id="ab-status" value={bStatus} onChange={(e) => setBStatus(e.target.value)} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" aria-label="Filter bookings by status">
                <option value="all">Status: All</option>{["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          {filteredBookings.length === 0 ? <p className="mt-4 text-sm text-[var(--dim)]">No bookings with this status yet.</p> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">ID</th><th className="py-2 pr-3 font-bold">Service</th><th className="py-2 pr-3 font-bold">Customer</th><th className="py-2 pr-3 font-bold">Professional</th><th className="py-2 pr-3 font-bold">Visit</th><th className="py-2 pr-3 font-bold">Payment</th><th className="py-2 pr-3 font-bold">Status</th><th className="py-2 font-bold text-right">Amount</th></tr></thead>
                <tbody>{filteredBookings.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">#{b.id}</td><td className="py-2 pr-3">{b.items[0]?.serviceName ?? "Service"}</td><td className="py-2 pr-3">{b.customerName}<span className="block text-xs text-[var(--dim)]">{b.customerPhone}</span></td><td className="py-2 pr-3">{b.providerName ?? "Auto-assign"}</td><td className="py-2 pr-3">{prettyDate(b.scheduledDate)} · {b.scheduledSlot}</td><td className="py-2 pr-3">{b.paymentMethod} · {b.paymentStatus}</td><td className="py-2 pr-3"><StatusBadge status={b.status} /></td><td className="py-2 font-extrabold text-right">{inr(b.finalPrice)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "customers" && (
        <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-extrabold">Customer management</h3>
          <p className="mt-0.5 text-sm text-[var(--dim)]">Registered customers plus everyone who has booked, with lifetime spend.</p>
          <div className="mt-3"><label htmlFor="ac-search" className="sr-only">Search customers</label><input id="ac-search" value={cQuery} onChange={(e) => setCQuery(e.target.value)} placeholder="Search name or phone…" className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm" /></div>
          {customersLoading ? <p className="mt-4 text-sm text-[var(--dim)]">Loading customers…</p> : filteredCustomers.length === 0 ? (
            <p className="mt-4 rounded-xl bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--dim)]">No customers match. Customers appear after they register or book.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">Customer</th><th className="py-2 pr-3 font-bold">Contact</th><th className="py-2 pr-3 font-bold">Bookings</th><th className="py-2 pr-3 font-bold">Last visit</th><th className="py-2 font-bold text-right">Lifetime spend</th></tr></thead>
                <tbody>{filteredCustomers.map((c) => (
                  <tr key={`${c.name}-${c.phone}`} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 pr-3 font-bold">{c.name}</td><td className="py-2.5 pr-3">{c.phone}{c.email ? <span className="block text-xs text-[var(--dim)]">{c.email}</span> : null}</td><td className="py-2.5 pr-3">{c.bookingsCount}</td><td className="py-2.5 pr-3">{c.lastBookingDate ? prettyDate(c.lastBookingDate) : "—"}</td><td className="py-2.5 font-extrabold text-right">{inr(c.totalSpend)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "revenue" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AnalyticsCard value={inr(grossRevenue)} label="Gross revenue" sub="Completed bookings" />
            <AnalyticsCard value={inr(grossRevenue * (commission / 100))} label={`Platform commission (${commission}%)`} sub="Set in Settings" />
            <AnalyticsCard value={inr(grossRevenue * (1 - commission / 100))} label="Provider payouts" sub="Before visiting-fee split" />
            <AnalyticsCard value={String(bookings.filter((b) => b.status === "COMPLETED").length)} label="Paid-out jobs" sub="Completed visits" />
          </div>
          <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="font-extrabold">Revenue by month</h3>
            <div className="mt-3"><RevenueChart data={monthly} ariaLabel="Bar chart of platform revenue by month" /></div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">Month</th><th className="py-2 pr-3 font-bold">Completed bookings</th><th className="py-2 pr-3 font-bold">Gross</th><th className="py-2 pr-3 font-bold">Commission ({commission}%)</th><th className="py-2 font-bold text-right">Provider share</th></tr></thead>
                <tbody>{monthly.map((m) => (
                  <tr key={m.month} className="border-b border-[var(--border)] last:border-0"><td className="py-2 pr-3 font-bold">{monthLabel(m.month)} ({m.month})</td><td className="py-2 pr-3">{m.bookings}</td><td className="py-2 pr-3">{inr(m.revenue)}</td><td className="py-2 pr-3">{inr(m.revenue * (commission / 100))}</td><td className="py-2 font-extrabold text-right">{inr(m.revenue * (1 - commission / 100))}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="font-extrabold">Revenue by provider</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--dim)]"><th className="py-2 pr-3 font-bold">Professional</th><th className="py-2 pr-3 font-bold">Completed</th><th className="py-2 pr-3 font-bold">This month</th><th className="py-2 font-bold text-right">Total revenue</th></tr></thead>
                <tbody>{[...providers].sort((a, b) => b.totalRevenue - a.totalRevenue).map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] cursor-pointer" onClick={() => onOpenProvider(p)} tabIndex={0} aria-label={`Open revenue details for ${p.name}`} onKeyDown={(e) => { if (e.key === "Enter") onOpenProvider(p); }}>
                    <td className="py-2.5 pr-3"><span className="flex items-center gap-2.5"><img src={p.profileImageUrl} alt={p.name} loading="lazy" className="h-8 w-8 rounded-full object-cover" /><span className="font-bold">{p.name}</span></span></td><td className="py-2.5 pr-3">{p.completedCount}</td><td className="py-2.5 pr-3">{inr(p.monthlyRevenue)}</td><td className="py-2.5 font-extrabold text-right">{inr(p.totalRevenue)}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <AdminSettings settings={settings} services={services} say={say} invalidate={invalidate} />
      )}
    </section>
  );
}

function AdminSettings({ settings, services, say, invalidate }: { settings: Settings | undefined; services: Service[]; say: (m: string) => void; invalidate: () => void }) {
  const [visitingFee, setVisitingFee] = useState<string>(String(settings?.visitingFee ?? 49));
  const [commission, setCommission] = useState<string>(String(settings?.commissionPercent ?? 10));
  const [supportEmail, setSupportEmail] = useState(settings?.supportEmail ?? "support@urbanservice.in");
  const [supportPhone, setSupportPhone] = useState(settings?.supportPhone ?? "+91 90000 00001");
  const [maintenance, setMaintenance] = useState<boolean>(settings?.maintenanceMode ?? false);
  const synced = useRef(false);
  useEffect(() => {
    if (settings && !synced.current) {
      synced.current = true;
      setVisitingFee(String(settings.visitingFee));
      setCommission(String(settings.commissionPercent));
      setSupportEmail(settings.supportEmail);
      setSupportPhone(settings.supportPhone);
      setMaintenance(settings.maintenanceMode);
    }
  }, [settings]);
  const saveMut = useMutation({
    mutationFn: () => api.updateSettings({ visitingFee: Number(visitingFee) || 0, commissionPercent: Number(commission) || 0, supportEmail, supportPhone, maintenanceMode: maintenance }),
    onSuccess: (r) => { say(r.success ? "Platform settings saved — new bookings will use them" : (r.error ?? "Could not save settings")); if (r.success) invalidate(); },
    onError: () => say("Could not save settings. Check the values and try again."),
  });
  const inputCls = "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm";
  const labelCls = "text-xs font-bold text-[var(--dim)]";
  return (
    <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-extrabold">Platform settings</h3>
      <p className="mt-0.5 text-sm text-[var(--dim)]">These apply to new bookings immediately. Existing bookings keep the price they were booked at.</p>
      <form className="mt-4 space-y-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); saveMut.mutate(); }}>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3">
          <div><label htmlFor="set-fee" className={labelCls}>Visiting fee (₹ per booking)</label><input id="set-fee" type="number" min={0} max={1000} value={visitingFee} onChange={(e) => setVisitingFee(e.target.value)} className={inputCls} /></div>
          <div><label htmlFor="set-commission" className={labelCls}>Platform commission (%)</label><input id="set-commission" type="number" min={0} max={60} value={commission} onChange={(e) => setCommission(e.target.value)} className={inputCls} /></div>
          <div><label htmlFor="set-email" className={labelCls}>Support email</label><input id="set-email" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className={inputCls} /></div>
          <div><label htmlFor="set-phone" className={labelCls}>Support phone</label><input id="set-phone" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className={inputCls} /></div>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <input type="checkbox" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} aria-label="Maintenance mode" className="h-4 w-4 accent-[#e8650a]" />
          Maintenance mode (shows a banner to customers — booking prices still apply)
        </label>
        <button type="submit" aria-label="Save platform settings" disabled={saveMut.isPending} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saveMut.isPending ? "Saving…" : "Save settings"}</button>
      </form>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <h4 className="font-extrabold text-sm">Live catalogue</h4>
        <p className="mt-0.5 text-[13px] text-[var(--dim)]">{services.length} services currently bookable by customers.</p>
        <ul className="mt-2 flex flex-wrap gap-2">{services.map((s) => <li key={s.id} className="rounded-full bg-[var(--bg)] px-3 py-1.5 text-xs font-bold">{s.name} · {inr(s.basePrice)}</li>)}</ul>
      </div>
    </div>
  );
}

function ProviderDetailModal({ p, services, bookings, onClose, onKyc, onAccount }: {
  p: AdminProvider; services: Service[]; bookings: Booking[];
  onClose: () => void;
  onKyc: (status: "approved" | "rejected" | "pending", reason?: string) => void;
  onAccount: (action: "approve" | "suspend" | "activate" | "deactivate" | "remove") => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const myServices = services.filter((s) => p.serviceIds.includes(s.id));
  const directions = mapsSearchUrl({ label: p.name, address: p.address, locality: "Dehradun", lat: p.latitude, lng: p.longitude });
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Provider details: ${p.name}`}>
      <button type="button" aria-label="Close provider details" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[560px] max-h-[94vh] sm:max-h-full overflow-y-auto bg-[var(--surface)] shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between bg-[var(--surface)] border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="font-extrabold">Provider file</h2>
          <button type="button" aria-label="Close provider details" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] text-lg leading-none">×</button>
        </div>
        <div className="p-5">
          <div className="flex gap-4">
            <img src={p.profileImageUrl} alt={p.name} className="h-20 w-20 rounded-full object-cover shrink-0 border-4 border-white shadow-lg" />
            <div className="min-w-0">
              <h3 className="text-xl font-extrabold tracking-tight">{p.name}</h3>
              <p className="text-sm text-[var(--dim)]">★ {p.rating.toFixed(1)} ({p.totalReviews} reviews) · {p.experienceYears} yrs experience</p>
              <p className="text-sm text-[var(--dim)]">{p.email}</p>
              <p className="text-sm text-[var(--dim)]">{p.phone} · {p.address}</p>
              <div className="mt-2 flex flex-wrap gap-1.5"><KycBadge status={p.kycStatus} /><AccountBadge status={p.accountStatus} /><span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.isAvailable ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800"}`}>{p.isAvailable ? "Available now" : "Unavailable"}</span></div>
              {directions && <a href={directions} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-bold text-[var(--accent)]">Open address in maps ↗</a>}
            </div>
          </div>

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">About</h4>
          <p className="mt-1.5 text-sm leading-relaxed">{p.bio}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{p.certifications.map((c) => <span key={c} className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">{c}</span>)}</div>
          <p className="mt-2 text-[13px] text-[var(--dim)]">Service area: <strong className="text-[var(--text)]">{p.serviceAreaLabel ?? p.address}</strong> · {p.serviceRadiusKm} km radius · {p.distanceKm.toFixed(1)} km from centre</p>

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">KYC &amp; verification documents</h4>
          <dl className="mt-2 grid grid-cols-1 min-[480px]:grid-cols-3 gap-2.5 text-sm">
            <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">Aadhaar</dt><dd className="mt-0.5 font-bold">{p.kycAadhaar ?? "Not submitted"}</dd></div>
            <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">PAN</dt><dd className="mt-0.5 font-bold">{p.kycPan ?? "Not submitted"}</dd></div>
            <div className="rounded-xl bg-[var(--bg)] p-3"><dt className="text-xs font-bold text-[var(--dim)]">Bank account</dt><dd className="mt-0.5 font-bold">{p.kycBankAccount ?? "Not submitted"}</dd></div>
          </dl>
          <p className="mt-2 text-sm">Status: <strong>{p.kycStatus.replace("_", " ")}</strong>{p.isVerified ? " · Verified professional ✓" : ""}</p>
          {p.kycRejectionReason && <p className="mt-1.5 rounded-xl bg-red-50 px-3 py-2 text-sm text-[var(--danger)] dark:bg-red-950/40">Rejection reason: {p.kycRejectionReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.kycStatus !== "approved" && <button type="button" aria-label={`Approve KYC for ${p.name} in detail`} onClick={() => onKyc("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white">Approve KYC</button>}
            <label htmlFor="detail-reject-reason" className="sr-only">Rejection reason for {p.name}</label>
            <input id="detail-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason if rejecting…" className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px]" />
            <button type="button" aria-label={`Reject KYC for ${p.name} in detail`} onClick={() => onKyc("rejected", reason)} className="rounded-lg bg-[var(--danger)] px-4 py-2 text-[13px] font-bold text-white">Reject KYC</button>
          </div>

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">Services offered</h4>
          <div className="mt-2 space-y-2">
            {myServices.length === 0 ? <p className="text-sm text-[var(--dim)]">No services linked.</p> : myServices.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-2.5"><img src={svcPhoto(s)} alt={s.name} loading="lazy" className="h-10 w-14 rounded-lg object-cover" /><span className="flex-1 font-bold text-sm">{s.name}</span><span className="font-extrabold text-sm">{inr(s.basePrice)}</span></div>
            ))}
          </div>

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">Booking &amp; revenue</h4>
          <div className="mt-2 grid grid-cols-2 min-[480px]:grid-cols-4 gap-2.5">
            <AnalyticsCard value={String(p.bookingsCount)} label="Total bookings" />
            <AnalyticsCard value={String(p.completedCount)} label="Completed" />
            <AnalyticsCard value={inr(p.totalRevenue)} label="Total revenue" />
            <AnalyticsCard value={inr(p.monthlyRevenue)} label="This month" />
          </div>
          {bookings.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--border)] rounded-xl bg-[var(--bg)] px-3">
              {bookings.slice(0, 6).map((b) => <li key={b.id} className="flex justify-between gap-2 py-2 text-[13px]"><span>#{b.id} {b.items[0]?.serviceName ?? "Service"} · {prettyDate(b.scheduledDate)}</span><span className="flex items-center gap-2"><StatusBadge status={b.status} /><strong>{inr(b.finalPrice)}</strong></span></li>)}
            </ul>
          )}

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">Ratings &amp; reviews</h4>
          {p.reviews.length === 0 ? <p className="mt-1.5 text-sm text-[var(--dim)]">No written reviews yet. Overall ★ {p.rating.toFixed(1)} from {p.totalReviews} ratings.</p> : (
            <ul className="mt-2 space-y-2">
              {p.reviews.map((r) => (
                <li key={r.bookingId} className="rounded-xl bg-[var(--bg)] p-3 text-sm"><span className="font-extrabold">{"★".repeat(r.rating)}</span> <span className="font-bold">{r.customerName}</span> <span className="text-xs text-[var(--dim)]">· {prettyDate(r.scheduledDate)}</span>{r.review && <span className="block mt-0.5 text-[var(--dim)]">“{r.review}”</span>}</li>
              ))}
            </ul>
          )}

          <h4 className="mt-6 font-extrabold text-sm uppercase tracking-wide text-[var(--dim)]">Account controls</h4>
          <p className="mt-1 text-[13px] text-[var(--dim)]">Suspended / deactivated / removed professionals disappear from customer search and cannot accept jobs.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" aria-label={`Approve and activate ${p.name}`} onClick={() => onAccount("approve")} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white">Approve</button>
            <button type="button" aria-label={`Suspend ${p.name}`} onClick={() => onAccount("suspend")} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">Suspend</button>
            <button type="button" aria-label={`Activate ${p.name}`} onClick={() => onAccount("activate")} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">Activate</button>
            <button type="button" aria-label={`Deactivate ${p.name}`} onClick={() => onAccount("deactivate")} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">Deactivate</button>
            {!confirmRemove ? (
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setConfirmRemove(true)} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold text-[var(--danger)]">Remove</button>
            ) : (
              <>
                <span className="self-center text-[13px] font-semibold">Remove {p.name.split(" ")[0]} from the marketplace?</span>
                <button type="button" aria-label={`Confirm remove ${p.name}`} onClick={() => onAccount("remove")} className="rounded-lg bg-[var(--danger)] px-3.5 py-2 text-[13px] font-bold text-white">Yes, remove</button>
                <button type="button" aria-label="Cancel remove" onClick={() => setConfirmRemove(false)} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold">Cancel</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
