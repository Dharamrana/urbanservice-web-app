# UrbanService — Urban Company Clone (Web App)

**🔗 Live app:** https://urbanservice-web-app.onrender.com (free tier — first load after idle can take ~30 seconds to wake)

## Brief description

UrbanService is a hyper-local home-services marketplace (an Urban Company clone) built for Tier-3 neighbourhoods like Prem Nagar, Sudhowala and Kheri Gaon in Dehradun. It has three roles — **Customer, Service Provider, and Admin**. Customers browse 8 services, pick a location with a Rapido-style Select-on-Map, choose a nearby professional, book a slot, and pay online or in cash. Providers manage jobs with OTP start, view revenue analytics, set their service area, and submit KYC. Admins verify provider KYC, moderate accounts, and see platform analytics. When a provider finishes a job, they collect payment via their own UPI QR (or cash) and owe the platform 10% commission within 24 hours — unpaid commission pauses their new jobs automatically.

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
