Optimizing tool selection...

Created 6 todos

Searched codebase for "screener API response structure partial data calibration status", 25 results

Searched codebase for "hydration batch size adaptive prioritization", 29 results

Searched codebase for "indicator cache persistent redis indexeddb cold start", 16 results

Searched codebase for "screener dashboard UI progress partial data warming up", 27 results

Searched codebase for "prisma coin_config alert_log index slow query", 24 results

Searched codebase for "metrics hydration calibration logging alert", 29 results

Here is a best-practices, actionable plan to fix all data feed gaps and roadblocks for a robust, intelligent, real-time system:

---

## 1. **API: Always Serve Partial Data + Calibration Status**
- Refactor `/api/screener` to always return available data, even if some symbols are still “warming up.”
- Add a `meta` field with:
  - `indicatorCoveragePct`
  - `missingSymbols` (list of symbols not yet ready)
  - `calibrating: boolean`
- UI should display available data and a “warming up” badge for incomplete symbols.

---

## 2. **Hydration: Adaptive, Prioritized, and Persistent**
- **Adaptive Batching:**  
  - Start with large batches (e.g., 100) on cold start, then reduce as system warms up.
  - Prioritize user-visible, alert-active, and top-100 symbols.
- **Persistent Cache:**  
  - Use Redis (with longer TTL) and IndexedDB/localStorage for client-side warm starts.
  - On startup, hydrate from persistent cache before fetching from exchanges.

---

## 3. **UI/UX: Progress, Partial Results, and Feedback**
- Show a progress bar or “warming up” list of symbols.
- Display which symbols are ready and which are still loading.
- Show real-time health status (feeds, cache, API, etc.).
- Use localStorage/IndexedDB to show last-known data instantly while live data loads.

---

## 4. **DB: Optimize Queries and Indexes**
- Ensure all config and alert tables have proper indexes (especially on `userId`, `symbol`, `createdAt`).
- Use pagination and only fetch what’s needed for the current view.
- Use upsert/bulk operations for config changes.

---

## 5. **Observability: Metrics, Logging, and Alerts**
- Add metrics for:
  - Hydration/calibration time
  - Cache hit/miss rates
  - API latency
  - Feed health (active/stale feeds)
- Expose these via `/api/health` and admin dashboard.
- Alert if calibration takes too long or if feeds are degraded.

---

## 6. **Worker/Feed Robustness**
- Ensure all workers have:
  - Zombie watchdogs (auto-reconnect if no data for 60s)
  - Batch processing (50+ updates per batch)
  - REST fallback for stale or missing WS data
- Use IndexedDB for instant-start and config mirroring.

---

## 7. **Schema & Migration Hygiene**
- Keep DB schema in sync with Prisma (run `prisma db push` and `prisma generate` after changes).
- Use migration scripts for all schema changes.
- Document all new fields and tables.

---

## 8. **Testing & Verification**
- Add property-based and integration tests for:
  - LRU cache eviction
  - Zone state cleanup
  - Alert de-duplication
  - Data hydration and fallback logic

---

## 9. **Documentation**
- Document all API changes, cache key formats, and health metrics.
- Update onboarding docs for DB sync and migration.

---

**Would you like to start with the API/data hydration refactor, UI improvements, or DB/index optimization? I can provide code-level changes for any of these next.**