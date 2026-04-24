# RSIQ PRO - Complete Performance Audit Report
**Date**: 2026-04-20  
**Scope**: Data flow, liveness, and performance analysis across all devices, browsers, and PWA

---

## Executive Summary

Comprehensive analysis of the entire data pipeline from WebSocket workers through React rendering. The system has **robust performance mechanisms** in place, but several **optimization opportunities** have been identified to eliminate lags and freezes.

### Key Findings
✅ **Strong Foundation**: Zombie watchdog, exponential backoff, batch processing, backpressure guards  
✅ **PWA Optimizations**: Aggressive 1.5s resume threshold, immediate flush on visibility  
⚠️ **Optimization Opportunities**: Throttle timing misalignment, potential re-render cascades, IndexedDB blocking

---

## 1. Worker Layer Performance Analysis

### 1.1 Ticker Worker (`public/ticker-worker.js`)

#### ✅ Excellent Performance Mechanisms

1. **Zombie Connection Watchdog** (Line 15-16, 130-148)
   - Monitors data freshness every 30s
   - Force reconnects if no data for 15s (reduced from 60s)
   - **Status**: ✅ Optimal for fast dead connection detection

2. **Exponential Backoff with Jitter** (Line 11-12, 408-414)
   - Base delay: 2s, Max: 30s
   - Prevents thundering herd on reconnect
   - **Status**: ✅ Industry best practice

3. **Batch Processing** (Line 161-169)
   - Processes tickers in batches of 50
   - Prevents event loop blocking
   - **Status**: ✅ Prevents UI freezes during high volatility

4. **Backpressure Guard** (Line 913-919)
   - Flushes immediately if buffer exceeds 1000 entries
   - Prevents unbounded memory growth
   - **Status**: ✅ Critical safety mechanism

5. **PWA Resume Logic** (Line 1127-1165)
   - Aggressive 1.5s threshold for faster recovery
   - Immediate flush on visibility change
   - Force reconnects stuck CONNECTING sockets
   - **Status**: ✅ Excellent PWA optimization

6. **Staleness Detection** (Line 1653-1681)
   - 15s staleness threshold (reduced from 60s)
   - 5s check interval (reduced from 10s)
   - **Status**: ✅ Responsive detection

7. **Bybit Spot REST Fallback** (Line 18-19, 349-391)
   - Polls stale symbols every 2s
   - Batch requests (50 symbols per call)
   - **Status**: ✅ Handles WS subscription limits

#### ⚠️ Potential Issues

1. **Adaptive Flushing Timing** (Line 1683-1707)
   ```javascript
   let nextInterval = 100; // Reduced from 300ms
   if (currentSize > 100) nextInterval = 50; 
   else if (currentSize > 40) nextInterval = 75;
   else if (currentSize > 15) nextInterval = 100;
   ```
   - **Issue**: Variable flush intervals (50-100ms) can cause stuttering
   - **Impact**: Perceived "micro-freezes" during volatility transitions
   - **Recommendation**: Use fixed 50ms interval for consistent rhythm

2. **IndexedDB Persistence** (Line 1569-1587)
   ```javascript
   async function persistToDB(ticks) {
     const tx = database.transaction(STORE_NAME, 'readwrite');
     ticks.forEach(([sym, tick]) => {
       store.put(tick, sym);
     });
   }
   ```
   - **Issue**: Called on EVERY flush (every 50-100ms)
   - **Impact**: Can block main thread on slow devices
   - **Recommendation**: Throttle to max 1 write per second

3. **Drift Guard Recalibration** (Line 1709-1723)
   - Triggers full API fetch every 10 minutes
   - **Issue**: Can cause brief freeze during fetch
   - **Recommendation**: Add loading indicator or background fetch

---

## 2. Main Thread Performance Analysis

### 2.1 Price Engine (`hooks/use-live-prices.ts`)

#### ✅ Excellent Mechanisms

1. **Event-Based Architecture** (Line 23-24)
   - Individual components subscribe to specific symbols
   - Prevents parent-level re-render storms
   - **Status**: ✅ Critical for 600+ symbols

2. **Master Election** (Line 42-63)
   - Web Locks API for single-tab UI effects
   - Prevents duplicate sounds/toasts
   - **Status**: ✅ Excellent multi-tab coordination

3. **Visibility Wake-up** (Line 145-161)
   - Signals worker to resume on visibility
   - Warm-flushes cached data immediately
   - **Status**: ✅ Fast PWA recovery

4. **Network Recovery** (Line 163-169)
   - Force-resumes worker on 'online' event
   - **Status**: ✅ Critical for mobile PWA

#### ⚠️ Potential Issues

1. **Throttle Timing Misalignment** (Line 387-389, 419-420)
   ```typescript
   const throttleRef = useRef(Math.max(50, throttleMs)); // Hook default: 50ms
   
   const flushTimer = setInterval(() => {
     // ...
   }, 100); // Periodic flush: 100ms
   ```
   - **Issue**: Hook throttle (50ms) < periodic flush (100ms)
   - **Impact**: Can accumulate ticks without flushing, causing stuttering
   - **Recommendation**: Align both to 50ms for consistent rhythm

2. **Virtual Polling Overhead** (Line 171-227)
   ```typescript
   this.virtualPollInterval = setInterval(async () => {
     // Yahoo symbols poll
     // Bybit Spot REST poll
   }, 5000);
   ```
   - **Issue**: Runs every 5s regardless of visibility
   - **Impact**: Unnecessary CPU/network usage when backgrounded
   - **Recommendation**: Pause when document.hidden === true

3. **Recalibration Fetch** (Line 229-271)
   - Fetches full screener data every 10 minutes
   - **Issue**: Can block UI during fetch
   - **Recommendation**: Add AbortSignal timeout and loading state

---

### 2.2 Screener Dashboard (`components/screener-dashboard.tsx`)

#### ✅ Excellent Optimizations

1. **ScreenerRow Memoization** (Line 571)
   ```typescript
   const ScreenerRow = memo(function ScreenerRow({ ... })
   ```
   - **Status**: ✅ Prevents unnecessary row re-renders

2. **Viewport-Aware Rendering** (Line 663, 1642)
   ```typescript
   const tick = useSymbolPrice(entry.symbol, entry.price, isVisible);
   ```
   - Only subscribes to visible rows
   - **Status**: ✅ Critical for performance with 500+ rows

3. **useMemo for Expensive Computations** (Line 2731-3323)
   - `processedData` memoized with proper dependencies
   - **Status**: ✅ Prevents re-computation on every tick

4. **useCallback for Event Handlers** (Line 2508, 2516, 2523, etc.)
   - All handlers properly memoized
   - **Status**: ✅ Prevents prop changes triggering re-renders

#### ⚠️ Potential Issues

1. **Large processedData Memo** (Line 2731-3323)
   - 592 lines of processing logic
   - **Issue**: Even with memoization, dependency changes trigger full recompute
   - **Impact**: Can cause brief freeze when filters/sort change
   - **Recommendation**: Split into smaller memos (filtering, sorting, enrichment)

2. **Stats Computation** (Line 3325-3375)
   ```typescript
   const stats = useMemo(() => {
     // Iterates all processedData
   }, [processedData, activeAssetClass]);
   ```
   - **Issue**: Recomputes on every processedData change
   - **Impact**: Additional overhead during live updates
   - **Recommendation**: Compute incrementally or cache per asset class

3. **Global Win Rate Loading** (Line 2646-2652)
   ```typescript
   useEffect(() => {
     const loadGlobalWinRate = async () => {
       const rate = await getGlobalWinRate();
       setGlobalWinRate(rate);
     };
     loadGlobalWinRate();
   }, []);
   ```
   - **Status**: ✅ Fixed TDZ issue, but could add error handling

---

## 3. Derivatives Worker Analysis

### 3.1 Smart Money Calculation (`public/derivatives-worker.js`)

#### ✅ Good Mechanisms

1. **Separate Worker Thread**
   - Offloads heavy calculations from main thread
   - **Status**: ✅ Good architecture

2. **Batch Processing**
   - Processes derivatives data in batches
   - **Status**: ✅ Prevents blocking

#### ⚠️ Potential Issues

1. **Computation Frequency**
   - Need to verify how often Smart Money is recalculated
   - **Recommendation**: Add throttling if calculated on every tick

---

## 4. Critical Performance Bottlenecks Identified

### 🔴 HIGH PRIORITY

1. **Throttle Timing Misalignment**
   - **Location**: `hooks/use-live-prices.ts` Line 387-389, 419-420
   - **Issue**: Hook throttle (50ms) vs periodic flush (100ms) mismatch
   - **Impact**: Stuttering during updates
   - **Fix**: Align both to 50ms

2. **IndexedDB Write Frequency**
   - **Location**: `public/ticker-worker.js` Line 1569-1587
   - **Issue**: Writes on every flush (50-100ms)
   - **Impact**: Can block on slow devices
   - **Fix**: Throttle to max 1 write/second

3. **Large processedData Memo**
   - **Location**: `components/screener-dashboard.tsx` Line 2731-3323
   - **Issue**: 592 lines recompute on dependency change
   - **Impact**: Brief freeze when filters change
   - **Fix**: Split into smaller memos

### 🟡 MEDIUM PRIORITY

4. **Virtual Polling Runs When Hidden**
   - **Location**: `hooks/use-live-prices.ts` Line 171-227
   - **Issue**: Polls every 5s even when backgrounded
   - **Impact**: Unnecessary CPU/network usage
   - **Fix**: Pause when document.hidden === true

5. **Adaptive Flush Intervals**
   - **Location**: `public/ticker-worker.js` Line 1683-1707
   - **Issue**: Variable intervals (50-100ms) cause stuttering
   - **Impact**: Perceived micro-freezes
   - **Fix**: Use fixed 50ms interval

6. **Stats Recomputation**
   - **Location**: `components/screener-dashboard.tsx` Line 3325-3375
   - **Issue**: Recomputes on every processedData change
   - **Impact**: Additional overhead
   - **Fix**: Compute incrementally or cache

### 🟢 LOW PRIORITY

7. **Recalibration Fetch Blocking**
   - **Location**: `hooks/use-live-prices.ts` Line 229-271
   - **Issue**: Can block UI during 10-minute recalibration
   - **Impact**: Brief freeze every 10 minutes
   - **Fix**: Add AbortSignal timeout and loading state

8. **Drift Guard Fetch**
   - **Location**: `public/ticker-worker.js` Line 1709-1723
   - **Issue**: Full API fetch every 10 minutes
   - **Impact**: Brief freeze
   - **Fix**: Add loading indicator

---

## 5. Recommended Fixes (Priority Order)

### Fix 1: Align Throttle Timings (HIGH)
**File**: `hooks/use-live-prices.ts`

```typescript
// Line 387-389: Change from 50ms to 100ms to match periodic flush
const throttleRef = useRef(Math.max(100, throttleMs)); // Changed from 50

// Line 419-420: Keep at 100ms (already correct)
const flushTimer = setInterval(() => {
  // ...
}, 100);
```

**OR** (Alternative - more aggressive):

```typescript
// Line 387-389: Keep at 50ms
const throttleRef = useRef(Math.max(50, throttleMs));

// Line 419-420: Change to 50ms to match throttle
const flushTimer = setInterval(() => {
  // ...
}, 50); // Changed from 100
```

**Recommendation**: Use 50ms for both (more responsive)

---

### Fix 2: Throttle IndexedDB Writes (HIGH)
**File**: `public/ticker-worker.js`

```javascript
// Add at top with other state
let lastPersistTime = 0;
const PERSIST_THROTTLE_MS = 1000; // Max 1 write per second

// Modify startFlushing function (Line 1683-1707)
function startFlushing(interval) {
  if (flushInterval) clearInterval(flushInterval);
  
  const performFlush = () => {
    if (tickerBuffer.size > 0) {
      const payload = Array.from(tickerBuffer.entries());
      broadcast({
        type: 'TICKS',
        payload
      });
      
      // THROTTLED PERSISTENCE
      const now = Date.now();
      if (now - lastPersistTime >= PERSIST_THROTTLE_MS) {
        persistToDB(payload);
        lastPersistTime = now;
      }
      
      tickerBuffer.clear();
    }

    // Use fixed 50ms interval for consistent rhythm
    flushInterval = setTimeout(performFlush, 50);
  };

  flushInterval = setTimeout(performFlush, interval || 50);
}
```

---

### Fix 3: Split Large processedData Memo (HIGH)
**File**: `components/screener-dashboard.tsx`

```typescript
// Split into smaller memos (Line 2731-3323)

// Step 1: Filter data
const filteredByAssetClass = useMemo(() => {
  return data.filter(e => {
    // Asset class filtering logic
  });
}, [data, activeAssetClass]);

// Step 2: Enrich with live prices
const enrichedData = useMemo(() => {
  return filteredByAssetClass.map(entry => {
    const tick = livePrices.get(entry.symbol);
    // Enrichment logic
  });
}, [filteredByAssetClass, livePrices]);

// Step 3: Apply search/filters
const processedData = useMemo(() => {
  return enrichedData.filter(e => {
    // Search/filter logic
  });
}, [enrichedData, search, filters]);
```

---

### Fix 4: Pause Virtual Polling When Hidden (MEDIUM)
**File**: `hooks/use-live-prices.ts`

```typescript
// Modify startVirtualPolling (Line 171-227)
private startVirtualPolling() {
  if (this.virtualPollInterval) return;

  this.virtualPollInterval = setInterval(async () => {
    // SKIP if document is hidden
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }
    
    // Existing polling logic...
  }, 5000);
}
```

---

### Fix 5: Use Fixed Flush Interval (MEDIUM)
**File**: `public/ticker-worker.js`

```javascript
// Simplify adaptive flushing (Line 1683-1707)
function startFlushing(interval) {
  if (flushInterval) clearInterval(flushInterval);
  
  const performFlush = () => {
    if (tickerBuffer.size > 0) {
      const payload = Array.from(tickerBuffer.entries());
      broadcast({
        type: 'TICKS',
        payload
      });
      persistToDB(payload);
      tickerBuffer.clear();
    }

    // FIXED 50ms interval for consistent rhythm
    flushInterval = setTimeout(performFlush, 50);
  };

  flushInterval = setTimeout(performFlush, interval || 50);
}
```

---

## 6. Testing Recommendations

### 6.1 Performance Testing Checklist

- [ ] Test on low-end Android device (PWA)
- [ ] Test on iOS Safari (PWA)
- [ ] Test on desktop Chrome/Firefox/Edge
- [ ] Test with 100 / 200 / 500 symbols
- [ ] Test during high volatility (many price updates)
- [ ] Test app switching (PWA resume)
- [ ] Test network interruption recovery
- [ ] Test with slow 3G connection
- [ ] Monitor Chrome DevTools Performance tab
- [ ] Check for memory leaks (24h stress test)

### 6.2 Key Metrics to Monitor

1. **Frame Rate**: Should stay at 60fps during updates
2. **Main Thread Blocking**: Should be < 50ms per task
3. **Memory Usage**: Should stabilize after 1 hour
4. **WebSocket Reconnects**: Should be < 1 per hour
5. **IndexedDB Write Time**: Should be < 10ms per write

---

## 7. Additional Optimizations (Future)

### 7.1 Web Worker Pool
- Use multiple workers for parallel processing
- Distribute symbols across workers

### 7.2 Virtual Scrolling
- Only render visible rows in DOM
- Use react-window or react-virtualized

### 7.3 Service Worker Caching
- Cache API responses for instant cold starts
- Implement stale-while-revalidate strategy

### 7.4 WebAssembly for Indicators
- Move RSI/MACD calculations to WASM
- 10-100x faster than JavaScript

---

## 8. Conclusion

The system has a **strong performance foundation** with excellent mechanisms for handling real-time data at scale. The identified issues are **optimization opportunities** rather than fundamental flaws.

### Priority Actions:
1. ✅ **Align throttle timings** (50ms everywhere)
2. ✅ **Throttle IndexedDB writes** (max 1/second)
3. ✅ **Split large processedData memo** (smaller chunks)
4. ✅ **Pause virtual polling when hidden**
5. ✅ **Use fixed flush interval** (50ms)

**Expected Impact**: Elimination of perceived lags/freezes across all devices, browsers, and PWA.

---

**Audit Completed**: 2026-04-20  
**Next Review**: After implementing priority fixes
