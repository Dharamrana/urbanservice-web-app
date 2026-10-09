# UrbanService — Urban Company Clone (Web App)

The exact hosted web app: complete role-based marketplace — **Customer / Service Provider / Admin** — with Rapido-style Select on Map (Dehradun: Prem Nagar, Sudhowala, Kheri Gaon), all 8 services, provider revenue analytics, admin KYC management, provider wallet, coupons & referrals.

React 19 + TypeScript · Bun · Drizzle ORM (SQLite) · Tailwind CSS 4 · Recharts. Client in `client/`, server actions in `server/src/actions.ts`, schema in `server/src/schema.ts`, migrations in `drizzle/`. The standalone Render/local server is `server/standalone.ts`; see `DATA-PLAN.md` for the data model.

## Run locally

If `bun` is not found on macOS/Linux, install Bun, restart Terminal, then run:

```bash
bun install
bun run build
bun run start
```

Open `http://localhost:3000` and check `http://localhost:3000/healthz`.

Demo logins: customer `rajesh@example.com` / `customer123`; provider `amit@example.com` / `provider123`; admin `admin@urbanservice.in` / `admin123`.

## Provider collection & commission

When a provider completes a job, the app opens a **Collect payment** screen with the provider's UPI payment QR for the full job amount. The provider can confirm **Payment received on QR**, or skip the QR with **Cash collected**. Either way, the provider owes the platform **10% commission** on that job, due **within 24 hours** of completion (shown per job in the provider dashboard, where it can be submitted to UrbanService). If a commission stays unpaid past 24 hours, the provider is paused: they disappear from customer search and cannot accept new jobs until the commission is paid. Jobs already paid online through the platform are auto-settled and create no due.

## Deploy on Render

This repo includes `render.yaml` and a `Dockerfile` for a Render Docker web service. Build uses Bun, start uses `bun run start`, and the health check is `/healthz`. On the free tier the SQLite database is stored at `/tmp/urbanservice.db`, so it is ephemeral and reseeds demo data on restart.

The Spring Boot (Java) version of the same product lives in `Dharamrana/Hyper-Local-Service-Provider` (this web app is also mirrored there under `web-app/`).
