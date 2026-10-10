# UrbanService — Hyper-Local Home Services Marketplace

An Urban Company–style marketplace built for Tier-3 neighbourhoods of Dehradun — Prem Nagar, Sudhowala, Kheri Gaon & beyond.

**Stack:** React 19 · TypeScript · Bun · Drizzle ORM (SQLite) · Tailwind CSS 4 · Render (Docker)

---

## 🔗 Live Demo

**https://urbanservice-web-app.onrender.com**

> Hosted on Render's free tier — the first load after ~15 minutes of inactivity can take 30–50 seconds while the service wakes up. Demo data reseeds automatically on restart.

---

## 📖 About the Project

Metro-focused platforms like Urban Company barely reach Tier-3 neighbourhoods. When your fan stops working in May in Prem Nagar, your real options are a saved phone number, a hardware-shop middleman, or waiting days. **UrbanService** fixes that: a hyper-local marketplace where customers book verified neighbourhood professionals — electricians, plumbers, carpenters and more — in a few taps, and professionals get a real digital storefront with jobs, analytics and payout discipline built in.

The app is a complete **three-role marketplace**:

| Role | What they get |
| --- | --- |
| **Customer** | Browse 8 services, Rapido-style Select-on-Map location picking, nearby professional selection with live distance sorting, slot booking, OTP-verified job start, online/cash payment, ratings & reviews |
| **Service Provider** | Job pool + assigned jobs, revenue dashboard with 6-month earnings chart, service-area map editor, KYC submission, availability toggle, per-job commission tracking |
| **Admin** | Platform analytics, KYC approve/reject with reasons, searchable provider management (suspend / activate / remove), customers & revenue views, platform settings (visiting fee, commission %) |

---

## ✨ Key Features

- 🗺️ **Rapido-style Select on Map** — fixed centre pin over a draggable Dehradun map, live locality detection, area search, locality chips and GPS.
- 📍 **12 seeded Dehradun professionals** across Prem Nagar, Sudhowala, Kheri Gaon, Ballupur, Vasant Vihar, Rajpur Road, Clement Town & Sahastradhara Road — sorted by distance from your pin.
- 🛒 **Multi-service cart booking** with transparent pricing (₹49 visiting fee), date/slot selection, and reschedule/cancel.
- 🔐 **OTP job start** — the provider can only begin work with the customer's 4-digit code.
- 💳 **Flexible payments** — mock UPI/Card gateway on the platform, or cash / provider-QR collection at the door.
- 🧾 **Provider commission engine** — on completing a job, the provider sees their UPI payment QR (or taps *Cash collected*), and owes the platform **10% commission within 24 hours**. Overdue commission auto-pauses new jobs (hidden from search, accept blocked) until paid. Online-paid jobs settle automatically.
- 📊 **Provider analytics** — total/monthly revenue, completed & pending jobs, 6-month earnings chart, full earnings history.
- 🛡️ **KYC & moderation** — Aadhaar/PAN/bank submission, admin review queue, account lifecycle controls.
- 🎟️ **Coupons & referrals**, wallet-style earnings history, Hindi/Hinglish-friendly copy.
- 📱 **Responsive, mobile-first UI** in a warm orange design system (DM Sans).

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS 4, Recharts, React Query |
| Backend | Type-safe server actions (`server/src/actions.ts`), Zod-validated request/response contracts |
| Runtime (standalone) | Bun server (`server/standalone.ts`) serving API + built SPA |
| Database | SQLite via Drizzle ORM, versioned SQL migrations in `drizzle/` |
| Maps | Leaflet / OpenStreetMap with Nominatim reverse geocoding |
| Deployment | Docker (`oven/bun`) on Render, `/healthz` health check |

---

## 📂 Project Structure

```
urbanservice-web-app/
├── client/                # React + TypeScript SPA
│   ├── src/App.tsx        # All screens: home, booking, provider & admin dashboards
│   └── src/components/    # ProviderMap (Rapido-style picker), shared UI
├── server/
│   ├── src/actions.ts     # Business logic: catalogue, bookings, jobs, KYC, admin, commission
│   ├── src/schema.ts      # Drizzle schema (users, providers, bookings, commission_dues…)
│   └── standalone.ts      # Bun HTTP server: /actions API, static SPA, /healthz
├── drizzle/               # SQL migrations (0001 → 0004)
├── vendor/space-sdk/      # Minimal local runtime shim for standalone execution
├── Dockerfile             # oven/bun build & run image
├── render.yaml            # Render Blueprint (Docker, free plan, /healthz)
└── DATA-PLAN.md           # Data model notes
```

---

## 🚀 Run Locally

**Prerequisite:** Bun (install it from the official Bun website if `bun` is not found, then restart your terminal).

```bash
git clone https://github.com/Dharamrana/urbanservice-web-app.git
cd urbanservice-web-app
bun install
bun run build
bun run start
```

Open **http://localhost:3000** · health check: **http://localhost:3000/healthz**

### 🔑 Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Customer | `rajesh@example.com` | `customer123` |
| Service Provider | `amit@example.com` | `provider123` |
| Admin | `admin@urbanservice.in` | `admin123` |

One-tap demo sign-in buttons are also available on the login screen.

---

## ☁️ Deploy on Render

This repo is Render-ready (`Dockerfile` + `render.yaml`). Create a Docker web service from the repo (or use the Blueprint), with:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Dockerfile path | `./Dockerfile` |
| Health check | `/healthz` |
| Env `NODE_ENV` | `production` |
| Env `DATABASE_PATH` | `/tmp/urbanservice.db` |

> Free-tier note: the SQLite database lives on ephemeral storage, so it reseeds demo data on every restart. For production data, attach a persistent disk or switch to an external database.

---

## 🔁 How the Commission Flow Works

1. Provider completes a job → **Collect payment** screen shows their UPI QR for the full amount.
2. Provider taps **Payment received on QR** — or **Cash collected** to skip the QR.
3. A **10% commission due** is created, payable to UrbanService within **24 hours** (tracked per job in the provider dashboard).
4. If unpaid after 24 hours, the provider is **paused**: hidden from customer search and unable to accept new jobs, until the commission is submitted.
5. Jobs the customer paid online through the platform are **auto-settled** — no due is created.

---

## 🗺️ Roadmap

- Real Razorpay payment gateway + webhook settlement (currently mock gateway, same integration shape)
- Persistent production database (Postgres) and provider payout ledger
- WhatsApp booking & job notifications
- Customer reviews with photos, recurring bookings
- Hindi/Hinglish full UI toggle

---

## 👥 Related Projects

- **Spring Boot (Java) version of the same product:** `Dharamrana/Hyper-Local-Service-Provider` — live at https://hyper-local-service-provider.onrender.com (this web app is also mirrored there under `web-app/`)

---

Built by **Dharam Rana** · Dept. of Computer Science & Engineering · Dehradun
*Hyper-Local Service Provider (HLSP) — bringing trusted home services to Tier-3 India.*
