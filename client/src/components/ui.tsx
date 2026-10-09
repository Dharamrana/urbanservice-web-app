export type Role = "customer" | "provider" | "admin";

export const ROLE_META: Record<Role, { label: string; icon: string; blurb: string }> = {
  customer: { label: "Customer", icon: "🏠", blurb: "Book trusted professionals for your home" },
  provider: { label: "Service Provider", icon: "🧑‍🔧", blurb: "Get jobs, manage bookings & track earnings" },
  admin: { label: "Admin", icon: "🛡️", blurb: "Verify KYC, manage providers & platform" },
};

export function RoleSelector({ value, onChange, idPrefix }: { value: Role; onChange: (r: Role) => void; idPrefix: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-extrabold">I am signing in as</legend>
      <p className="mt-0.5 text-[13px] text-[var(--dim)]">Your role decides your dashboard, permissions and what you can do next.</p>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Choose your role">
        {(Object.keys(ROLE_META) as Role[]).map((r) => {
          const meta = ROLE_META[r];
          const active = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={active}
              id={`${idPrefix}-role-${r}`}
              aria-label={`${meta.label}: ${meta.blurb}`}
              onClick={() => onChange(r)}
              className={`rounded-2xl border-2 px-2.5 py-3 text-center transition-colors ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--muted)]"}`}
            >
              <span className="block text-2xl leading-none" aria-hidden>{meta.icon}</span>
              <span className={`mt-1.5 block text-[13px] font-extrabold leading-tight ${active ? "text-[var(--accent)]" : ""}`}>{meta.label}</span>
              <span className="mt-0.5 hidden min-[480px]:block text-[11px] leading-snug text-[var(--dim)]">{meta.blurb}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function KycBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: "KYC Approved", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
    pending: { label: "KYC Pending", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
    rejected: { label: "KYC Rejected", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
    not_submitted: { label: "KYC Not submitted", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  };
  const m = map[status] ?? map.not_submitted!;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
}

export function AccountBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
    suspended: { label: "Suspended", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" },
    deactivated: { label: "Deactivated", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
    removed: { label: "Removed", cls: "bg-zinc-800 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900" },
  };
  const m = map[status] ?? map.active!;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
}

export function AnalyticsCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xl sm:text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-[var(--dim)]">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export const AREA_PRESETS = [
  { label: "Prem Nagar, Dehradun", lat: 30.3429, lng: 77.962 },
  { label: "Sudhowala, Dehradun", lat: 30.3542, lng: 77.9825 },
  { label: "Kheri Gaon, Dehradun", lat: 30.3284, lng: 77.9478 },
  { label: "Ballupur, Dehradun", lat: 30.3336, lng: 78.0124 },
  { label: "Vasant Vihar, Dehradun", lat: 30.3158, lng: 77.9982 },
  { label: "Rajpur Road, Dehradun", lat: 30.355, lng: 78.058 },
  { label: "Clement Town, Dehradun", lat: 30.2718, lng: 78.042 },
  { label: "Sahastradhara Road, Dehradun", lat: 30.3448, lng: 78.0745 },
] as const;

export function monthLabel(key: string): string {
  try {
    const [y = 1970, m = 1] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  } catch {
    return key;
  }
}
