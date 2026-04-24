# Real-Time Data Flow Deep Dive & Critical Fixes

## Executive Summary

**Status**: 🔴 **CRITICAL ISSUES IDENTIFIED**

Your real-time data flow has **3 major gaps** causing data freezes and service worker errors:

1. **Service Worker Registration Race Condition** - Notifications fail when SW isn't fully active
2. **Cron Jobs on Vercel** - Will fail in production (Vercel doesn't support cron routes)
3. **Data Freeze After Inactivity** - Multiple timeout/polling mechanisms causing conflicts

---

## 🔍 Complete Data Flow Architecture

### Current Flow (With Issues)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT BROWSER                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. screener-dashboard.tsx                                       │
│     ├─ useLivePrices() hook                                     │
│     │  └─ PriceTickEngine (singleton)                           │
│     │     └─ ticker-worker.js (SharedWorker/Worker)             │
│     │        ├─ Binance WebSocket (wss://stream.binance.com)    │
│     │        ├─ Bybit WebSocket (wss://stream.bybit.com)        │
│     │        └─ REST polling fallback (10s interval)            │
│     │                                                             │
│     ├─ useSymbolPrice() per-row subscription                    │
│     │  └─ Event-based updates (zero parent re-renders)          │
│     │                                                             │
│     └─ Multiple setInterval/setTimeout (ISSUE #1)               │
│        ├─ Refresh timer (user-configurable)                     │
│        ├─ Countdown ticker (1s)                                 │
│        ├─ Global update throttle (2s)                           │
│        ├─ Config save debounce (3s)                             │
│        └─ Flash animations (600ms-3s)                           │
│                                                                   │
│  2. Service Worker (worker/index.ts → /sw.js)                   │
│     ├─ Push notifications (VAPID)                               │
│     ├─ Periodic background sync                                 │
│     ├─ Alert channel (BroadcastChannel)                         │
│     └─ ISSUE #2: showNotification() called before ready         │
│                                                                   │
│  3. Notification Engine (lib/notification-engine.ts)            │
│     ├─ Toast notifications (sonner)                             │
│     ├─ Audio alerts (AudioContext)                              │
│     ├─ Native notifications                                     │
│     └─ ISSUE #3: Race condition with SW registration            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Next.js API)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  /api/screener                                                   │
│  └─ lib/screener-service.ts                                     │
│     ├─ Binance REST API (fallback)                              │
│     ├─ Bybit REST API (fallback)                                │
│     └─ Yahoo Finance (Forex/Metals/Stocks)                      │
│                                                                   │
│  /api/cron/check-alerts (ISSUE #4: Won't work on Vercel)        │
│  /api/cron/seo-content (ISSUE #4: Won't work on Vercel)         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🐛 Critical Issues Identified

### Issue #1: Service Worker Notification Race Condition

**Location**: `lib/notification-engine.ts:40-47`, `worker/index.ts:173`

**Problem**: 
```typescript
// notification-engine.ts
const registration = await navigator.serviceWorker.ready;
if (registration && registration.showNotification) {
  registration.showNotification(title, { ... }); // ❌ Fails if SW not active
}
```

**Error**:
```
TypeError: Failed to execute 'showNotification' on 'ServiceWorkerRegistration': 
No active registration available on the ServiceWorkerRegistration.
```

**Root Cause**: 
- `navigator.serviceWorker.ready` resolves when SW is **installed**, not **activated**
- `showNotification()` requires an **active** service worker
- Race condition during initial page load or SW updates

**Impact**: 
- Notifications fail silently
- Users miss critical alerts
- Error spam in console (seen in your logs)

---

### Issue #2: Cron Jobs Won't Work on Vercel

**Location**: 
- `app/api/cron/check-alerts/route.ts`
- `app/api/cron/seo-content/route.ts`

**Problem**: 
Vercel **does not support** cron job routes like `/api/cron/*`. You need to use:
1. **Vercel Cron** (configured in `vercel.json`)
2. **External scheduler** (GitHub Actions, Upstash QStash, etc.)

**Current Code**:
```typescript
// ❌ This won't be triggered automatically on Vercel
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... cron logic
}
```

**Impact**:
- Background alerts won't fire
- SEO content won't update
- Users won't receive push notifications when app is closed

---

### Issue #3: Data Freeze After Inactivity

**Location**: Multiple files with competing timers

**Problem**: 
Too many `setInterval`/`setTimeout` causing conflicts:

1. **screener-dashboard.tsx**:
   - Line 503: `setInterval(() => setNow(Date.now()), 1000)` (countdown)
   - Line 2670: `setInterval(update, 30_000)` (global win rate)
   - Line 4110: `setInterval(() => fetchDataRef.current(true), refreshInterval * 1000)` (data refresh)
   - Line 4116: `setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)` (tick timer)

2. **hooks/use-live-prices.ts**:
   - Line 259: Virtual polling (10s)
   - Line 503: Flush timer (100ms)
   - Connection check (5s)
   - Heartbeat (5min)

3. **public/ticker-worker.js**:
   - Zombie watchdog (30s)
   - Bybit REST poll (2s)
   - Staleness check (configurable)

**Root Cause**:
- When tab goes to background, browsers throttle timers
- Multiple competing intervals cause drift
- WebSocket connections may close but timers keep running
- No centralized timer coordination

**Impact**:
- Data appears frozen after 10-30 seconds
- CPU waste from redundant timers
- Battery drain on mobile
- Inconsistent refresh rates

---

### Issue #4: Missing Visibility State Management

**Location**: `hooks/use-live-prices.ts:259-292`

**Problem**:
```typescript
// Virtual polling runs even when document is hidden
if (typeof document !== 'undefined' && document.hidden) {
  return; // ✅ Good, but not enough
}
```

**Missing**:
- No pause/resume for WebSocket when tab is hidden
- Timers keep running in background
- IndexedDB writes continue unnecessarily
- No coordination between tabs (SharedWorker helps but not complete)

---

## ✅ Comprehensive Fixes

### Fix #1: Bulletproof Service Worker Notifications

**File**: `lib/notification-engine.ts`

**Strategy**: 
1. Wait for **active** worker, not just ready
2. Add retry logic with exponential backoff
3. Fallback to legacy Notification API
4. Add proper error handling

