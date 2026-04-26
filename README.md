# RSIQ Pro - Crypto RSI Market Screener

Real-time multi-pair RSI screener with live WebSocket price feeds, multi-exchange support, alert engine, and PWA capabilities.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL via Prisma
- **Cache**: Upstash Redis
- **Auth**: Better Auth
- **Payments**: Stripe + NowPayments
- **Real-time**: Binance & Bybit WebSocket streams via SharedWorker
- **Push Notifications**: Web Push (VAPID)
- **Deployment**: Vercel

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

Required variables:
```env
DATABASE_URL=
BETTER_AUTH_SECRET=
NEXT_PUBLIC_APP_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### 3. Set Up Database

```bash
npm run db:sync
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests (single pass) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:sync` | Sync Prisma schema to database |
| `npm run db:sync:force` | Force sync (accepts data loss) |
| `npm run db:push` | Push schema only |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:status` | Check migration status |

---

## Project Structure

```
├── app/                    # Next.js App Router pages & API routes
│   ├── (auth)/             # Login, register, verify
│   ├── api/                # API endpoints
│   │   ├── admin/          # Admin management
│   │   ├── alerts/         # Alert history
│   │   ├── config/         # Coin configuration
│   │   ├── screener/       # Main screener data
│   │   ├── stripe/         # Stripe billing
│   │   └── subscription/   # Subscription management
│   ├── account/            # User account page
│   ├── admin/              # Admin dashboard
│   ├── subscription/       # Subscription page
│   └── terminal/           # Trading terminal
│
├── components/             # React components
│   ├── screener-dashboard.tsx   # Main dashboard
│   ├── bulk-actions-toolbar.tsx # Bulk alert config
│   ├── alert-history-panel.tsx  # Alert history
│   └── ...
│
├── hooks/                  # Custom React hooks
│   ├── use-live-prices.ts  # WebSocket price engine
│   ├── use-alert-engine.ts # Alert evaluation
│   └── ...
│
├── lib/                    # Shared utilities & business logic
│   ├── indicators.ts       # RSI, EMA, MACD calculations
│   ├── auth.ts             # Better Auth config
│   ├── db.ts               # Prisma client
│   └── ...
│
├── prisma/                 # Database schema
│   └── schema.prisma
│
├── public/                 # Static assets
│   ├── ticker-worker.js    # WebSocket SharedWorker
│   ├── derivatives-worker.js
│   └── sw.js               # Service Worker (PWA)
│
├── scripts/                # Utility scripts
│   ├── sync-database.js    # DB sync helper
│   ├── sync-assets.js      # Post-build asset sync
│   └── ...
│
├── doc/                    # Project documentation
│   ├── project_overview.md
│   └── up-comming-features.md
│
├── worker/                 # Service worker source
│   └── index.ts
│
└── archive/                # Development notes & analysis docs
```

---

## Database

This project uses **Prisma db push** (no migration files).

### After pulling schema changes:
```bash
npm run db:sync
npm run dev
```

### After modifying `prisma/schema.prisma`:
```bash
npm run db:sync
```

See `README_DATABASE.md` for full database documentation.

---

## Real-Time Architecture

Price updates flow through a **SharedWorker** (`public/ticker-worker.js`) that:

1. Connects to Binance/Bybit WebSocket streams
2. Calculates live RSI, EMA, MACD, Bollinger Bands
3. Evaluates alert conditions
4. Broadcasts batched updates to all open tabs (max 100ms flush interval)

The UI subscribes via `hooks/use-live-prices.ts` using a custom `EventTarget`-based engine that enables per-symbol subscriptions with zero parent re-renders.

---

## PWA

The app is a full PWA with:
- Offline support via Service Worker
- Web Push notifications (background alerts)
- IndexedDB price persistence for instant cold-start
- Periodic background sync

---

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

Environment variables must be set in the Vercel dashboard.

### Self-Hosted

```bash
npm run build
npm run start
```

Requires Node.js 18+ and a PostgreSQL database.

---

## Generate VAPID Keys (Push Notifications)

```bash
node scripts/generate-vapid.js
```

Add the output to your `.env.local`.

---

## License

ISC
