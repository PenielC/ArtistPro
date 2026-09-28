# ArtBH (Art Business Hub)

AI-powered business operating system for artists and creative professionals. See [ARTBH_CLAUDE.md](./ARTBH_CLAUDE.md) for the full product spec, architecture and roadmap.

## Stack

- **Web**: React + Vite + TypeScript, Tailwind CSS + shadcn/ui, TanStack Query, React Hook Form + Zod, React Router
- **API**: NestJS (Modular Monolith + Event-Driven + Microservice Ready), Prisma + PostgreSQL, Redis, BullMQ
- **Auth**: JWT access/refresh tokens, RBAC (owner/manager/staff/finance), multi-tenant organizations

## Getting started

```bash
# 1. Start Postgres + Redis
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run database migrations
npm run --workspace=apps/api prisma:migrate

# 5. Start both apps
npm run dev:api    # http://localhost:4000  (Swagger docs at /docs)
npm run dev:web    # http://localhost:5173
```

## Project layout

```
/apps
  /web   — React + Vite frontend
  /api   — NestJS backend (modular monolith)
    /src/modules/{auth,artists,clients,bookings,quotes,contracts,epk,invoices,payments,ai,notifications}
    /prisma/schema.prisma
```

## Current status

- ✅ Monorepo scaffolded (npm workspaces), both apps build and run
- ✅ `Auth` module built end-to-end: register, login, refresh (with rotation/revocation), RBAC guard — verified against a real Postgres database
- ✅ Docker Compose for local Postgres (`:5437`) + Redis (`:6381`)
- ✅ Health checks, Swagger docs, Helmet, rate limiting, global validation
- ✅ `Artists`, `Clients`, `Bookings`, `Quotes`, `Contracts`, `EPK`, `Invoices` modules built and verified
- ✅ `Payments`: online invoice payments via Paynow (each organisation connects its own merchant account; results are hash-verified and recorded at most once). Needs `PAYMENTS_ENCRYPTION_KEY` and a public `API_PUBLIC_URL` — see `.env.example`
- ✅ `Notifications`: email invoices/quotes/contracts to clients, automatic payment receipts + owner alerts, scheduled overdue-invoice reminders, in-app notification bell, WhatsApp share links. Every email is logged in Postgres and delivered by a BullMQ worker (Redis) over SMTP with retries. Locally, `docker compose up -d mailpit` catches all mail at http://localhost:8027
- ✅ Creative Calendar: bookings, contract dates, invoice due dates, quote expiries, payments and your own entries (rehearsals, travel, releases, blocked days) in a month grid or agenda, with double-booking warnings and a private read-only iCal feed for Google/Apple/Outlook
- ✅ `AI` (AI Artist Manager): business briefing, pricing help from your own history, drafts for client messages and enquiry replies, and artist content (bio, tagline, press release, social posts), all streamed live. Uses Claude (`claude-opus-5`) via the Anthropic SDK behind a provider interface; every generation is logged with tokens and estimated cost, with a monthly cap per organisation. Set `ANTHROPIC_API_KEY` to enable it; `AI_DEMO_MODE=true` gives canned answers for local development without a key
