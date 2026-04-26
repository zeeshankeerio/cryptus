# Real-Time Screener - Performance Audit & Root Cause Analysis

## Why the Browser Hangs After a Few Minutes

### Root Cause #1 - CRITICAL: `processedData` useMemo Runs on Every Tick

**Location**: `components/screener-dashboard.tsx` ~line 2610

**Problem**: `livePrices` is in the dependency array of `processedData`. Every time any price updates (every 100ms), the entire `processedData` memo re-runs. With 500 symbols, this memo:
- Iterates all 500 entries
- Calls `computeStrategyScore()` for each entry with a zero score
- Spreads entire entry objects (`{ ...entry, ... }`)
- Runs `approximateRsi()` for custom period check
- Runs signal logic for each entry

**Frequency**: Up to 10 times/second × 500 entries = **5,000 heavy computations/second**

**Fix**: Remove `livePrices` from `processedData` deps. The live price merging should happen at the row level (already done via `useSymbolPrice`), not at the parent level.

---

### Root Cause #2 - CRITICAL: `lastGlobalUpdate` setState on Every Tick

**Location**: `components/screener-dashboard.tsx` ~line 2565

**Problem**:
```typescript
useEffect(() => {
  if (livePrices.size > 0) {
    setLastGlobalUpdate(Date.now());
  }
}, [livePrices]); // livePrices changes every 100ms
```

Every 100ms, `livePrices` changes → `setLastGlobalUpdate` fires → **entire ScreenerDashboard re-renders** → all 500 `ScreenerRow` components check their memo deps → massive re-render cascade.

**Fix**: Use a ref for lastGlobalUpdate, only update state at 1s intervals.

---

### Root Cause #3 - HIGH: Alert Engine Runs `computeStrategyScore` on Every Tick for Every Symbol

**Location**: `hooks/use-alert-engine.ts` ~line 200

**Problem**: The `handleBatchTicks` handler runs on every `ticks` event. For each symbol in the batch, it calls `computeStrategyScore()` if `alertOnStrategyShift` is enabled. With 500 symbols and 10 ticks/sec = **5,000 strategy computations/second** in the main thread.

**Fix**: Only compute strategy score for symbols that have `alertOnStrategyShift` enabled, and debounce to max once per 500ms per symbol.

---

### Root Cause #4 - HIGH: `PriceTickEngine` Fires Individual `tick:${sym}` Events for Every Symbol in Every Batch

**Location**: `hooks/use-live-prices.ts` ~line 130

**Problem**:
```typescript
payload.forEach(([sym, tick]) => {
  this.prices.set(sym, tick);
  batch.set(sym, tick);
  this.dispatchEvent(new CustomEvent(`tick:${sym}`, { detail: tick })); // ← FIRES 500 EVENTS
});
this.dispatchEvent(new CustomEvent('ticks', { detail: batch })); // ← FIRES 1 EVENT
```

With 500 symbols per batch, this fires **501 CustomEvents** per flush. Each `tick:${sym}` event wakes up the corresponding `useSymbolPrice` hook. This is correct for visible rows, but the `alert engine` also listens to the `ticks` event AND processes all 500 symbols.

**Fix**: The individual `tick:${sym}` events are fine (they only wake visible rows). The alert engine should use the batch `ticks` event (already does). No change needed here.

---

### Root Cause #5 - HIGH: `use-derivatives-intel` `smartMoney` useMemo Runs on Every Liquidation/Whale

**Location**: `hooks/use-derivatives-intel.ts` ~line 60

**Problem**:
```typescript
const smartMoney = useMemo(() => {
  return computeAllSmartMoney(Array.from(symbols), fundingRates, liquidations, whaleAlerts, orderFlow);
}, [symbols, fundingRates, liquidations, whaleAlerts, orderFlow, enabled]);
```

`liquidations` and `whaleAlerts` are arrays that get a new reference on every event. `computeAllSmartMoney` iterates all symbols. This runs on every liquidation event.

**Fix**: Debounce the smartMoney computation to max once per 2 seconds.

---

### Root Cause #6 - MEDIUM: `syncStates` useEffect Runs on Every `processedData` Change

**Location**: `components/screener-dashboard.tsx` ~line 2900

**Problem**: The `syncStates` effect has `processedData` in its deps. Since `processedData` changes every 100ms (due to `livePrices` dep), this effect fires every 100ms, iterating all 500 entries and posting a large message to the worker.

**Fix**: Debounce this effect to run at most once per 5 seconds (RSI states don't change that fast).

---

### Root Cause #7 - MEDIUM: `LiveStatusIndicator` Has a 1-Second `setInterval` That Causes Re-Renders

**Location**: `components/screener-dashboard.tsx` (LiveStatusIndicator component)

**Problem**: The component runs `setInterval(() => setNow(Date.now()), 1000)`. This causes the component to re-render every second. While the component itself is memoized, the parent `ScreenerDashboard` passes `lastGlobalUpdate` which changes every 100ms, defeating the memo.

**Fix**: Already fixed by fixing Root Cause #2.

---

### Root Cause #8 - MEDIUM: `IntersectionObserver` Created for Every Row, Never Pooled

**Location**: `components/screener-dashboard.tsx` ScreenerRow component

**Problem**: Each of 500 rows creates its own `IntersectionObserver`. With 500 rows, that's 500 observers. Each observer fires callbacks on scroll.

**Fix**: Use a single shared `IntersectionObserver` with `observe()` per element (already the correct pattern, but the current implementation creates one observer per row which is fine - this is lower priority).

---

## Memory Leak Analysis

### Leak #1: `PriceTickEngine` Event Listeners Not Cleaned Up on Exchange Change

When `setExchange()` is called, the old worker's `onmessage` handler is replaced but the `visibilitychange` and `online` event listeners added in `start()` are **never removed**. After multiple exchange switches, multiple listeners accumulate.

### Leak #2: `use-alert-engine` Audio Nodes Not Disconnected

In `playAlertSound`, oscillator and gain nodes are created but only disconnected after a `setTimeout`. If many alerts fire rapidly, hundreds of audio nodes can accumulate before cleanup.

### Leak #3: `liquidations` Array Grows Unbounded in `use-derivatives-intel`

The array is capped at 200 entries, but each new entry creates a new array reference, triggering the `smartMoney` useMemo.

---

## Fix Priority

| # | Issue | Impact | Fix Time |
|---|-------|--------|----------|
| 1 | `processedData` runs on every tick | CRITICAL - hangs browser | 5 min |
| 2 | `lastGlobalUpdate` setState every 100ms | CRITICAL - re-render storm | 5 min |
| 3 | Alert engine strategy score on every tick | HIGH - CPU spike | 10 min |
| 5 | smartMoney recomputes on every liquidation | HIGH - CPU spike | 5 min |
| 6 | syncStates fires every 100ms | MEDIUM - worker overload | 5 min |
