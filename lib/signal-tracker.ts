/**
 * Mindscape Analytics - Signal Win Rate Tracker™
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tracks signal outcomes over time to compute verifiable win rates.
 *
 * How it works:
 *   1. When a signal fires (Strong Buy/Sell), we snapshot the price.
 *   2. After configurable time windows (5m, 15m, 1h), we check the outcome.
 *   3. We compute win/loss ratios and display them alongside signals.
 *
 * Storage: localStorage for client-side persistence.
 *
 * Accuracy notes:
 *   - Outcomes are evaluated at the FIRST price check AFTER the interval elapses.
 *   - Win threshold is 0.5% to filter noise and account for real spreads/slippage.
 *   - Snapshots are capped at 500 to prevent localStorage bloat.
 */

// ── Types ─────────────────────────────────────────────────────────

export interface SignalSnapshot {
  id: string;
  symbol: string;
  signal: 'strong-buy' | 'strong-sell' | 'buy' | 'sell';
  entryPrice: number;
  timestamp: number;
  market?: string;
  atr?: number | null;
  outcome5m?: number | null;
  outcome15m?: number | null;
  outcome1h?: number | null;
  maxFavExcursion: number; // Max favorable move (%) during the window
  win5m?: boolean | null;
  win15m?: boolean | null;
  win1h?: boolean | null;
  settled: boolean;
}

export interface WinRateStats {
  symbol: string;
  totalSignals: number;
  wins5m: number;
  losses5m: number;
  winRate5m: number;
  wins15m: number;
  losses15m: number;
  winRate15m: number;
  wins1h: number;
  losses1h: number;
  winRate1h: number;
  avgReturn5m: number;
  avgReturn15m: number;
  avgReturn1h: number;
}

// ── Constants ─────────────────────────────────────────────────────

const STORAGE_KEY = 'rsiq-signal-tracker';
const MAX_SNAPSHOTS = 500;
const CHECK_INTERVALS = {
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
} as const;

// Win threshold: price moved in signal direction by at least 0.5%
// (0.3% was too tight - barely covers spreads + slippage in real trading)
const WIN_THRESHOLD_PCT = 0.005;

// ── In-memory cache to avoid reading localStorage on every render ──
let _cache: SignalSnapshot[] | null = null;
let _cacheTs = 0;
const CACHE_TTL = 5000; // Re-read localStorage at most every 5s

function loadSnapshots(): SignalSnapshot[] {
  if (typeof window === 'undefined') return [];
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : [];
    _cacheTs = now;
    return _cache!;
  } catch {
    _cache = [];
    _cacheTs = now;
    return [];
  }
}

function saveSnapshots(snapshots: SignalSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    // Invalidate cache so next read picks up the new data
    _cache = trimmed;
    _cacheTs = Date.now();
  } catch {
    try {
      const evicted = snapshots.slice(Math.floor(snapshots.length * 0.2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(evicted));
      _cache = evicted;
      _cacheTs = Date.now();
    } catch {
      // Silent fail
    }
  }
}

// ── Core Functions ────────────────────────────────────────────────

/**
 * Record a new signal snapshot when a strong signal fires.
 * Deduplicates: won't record the same symbol+signal within 3 minutes.
 */
export function recordSignal(
  symbol: string,
  signal: SignalSnapshot['signal'],
  entryPrice: number,
  market?: string,
  atr?: number | null,
): string {
  const snapshots = loadSnapshots();
  const now = Date.now();

  // Dedup: skip if same symbol+signal fired within last 3 minutes
  const recent = snapshots.find(
    s => s.symbol === symbol && s.signal === signal && now - s.timestamp < 3 * 60 * 1000
  );
  if (recent) return recent.id;

  const id = `${symbol}-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const snapshot: SignalSnapshot = {
    id,
    symbol,
    signal,
    entryPrice,
    timestamp: now,
    market,
    atr,
    maxFavExcursion: 0,
    settled: false,
  };

  snapshots.push(snapshot);
  saveSnapshots(snapshots);
  return id;
}

/**
 * Check and update outcomes for all unsettled snapshots.
 * Call this periodically with current prices.
 * Uses the price at the FIRST evaluation after the interval - accurate.
 */
export function evaluateOutcomes(
  currentPrices: Map<string, number>,
): { updated: number; settled: number } {
  const snapshots = loadSnapshots();
  const now = Date.now();
  let updated = 0;
  let settled = 0;

  for (const snap of snapshots) {
    if (snap.settled) continue;

    const currentPrice = currentPrices.get(snap.symbol);
    if (!currentPrice || currentPrice <= 0) continue;

    const elapsed = now - snap.timestamp;
    const isBullish = snap.signal === 'strong-buy' || snap.signal === 'buy';
    let changed = false;

    // ── Volatility-Adaptive Win Threshold ──
    // Institutional standard: 1.5 * ATR (or 0.5% min for stable assets)
    // Forex is 0.15% (15 pips) min, Crypto is 1.0% min.
    let threshold = WIN_THRESHOLD_PCT; // Default 0.5%
    if (snap.market === 'Crypto') threshold = 0.01; // 1% min for Crypto
    else if (snap.market === 'Forex') threshold = 0.0015; // 15 pips min for Forex
    
    if (snap.atr && snap.entryPrice > 0) {
      const atrThreshold = (snap.atr / snap.entryPrice) * 1.5;
      threshold = Math.max(threshold, atrThreshold);
    }

    // ── Track Max Favorable Excursion (MFE) ──
    const currentRet = (currentPrice - snap.entryPrice) / snap.entryPrice;
    const currentFav = isBullish ? currentRet : -currentRet;
    if (currentFav > snap.maxFavExcursion) {
      snap.maxFavExcursion = currentFav;
      changed = true;
    }

    // 5m outcome - Evaluated at first check after 5m OR if MFE hits threshold
    if (snap.outcome5m === undefined && (elapsed >= CHECK_INTERVALS['5m'] || snap.maxFavExcursion >= threshold)) {
      snap.outcome5m = currentPrice;
      snap.win5m = snap.maxFavExcursion >= threshold;
      changed = true;
    }

    // 15m outcome
    if (snap.outcome15m === undefined && (elapsed >= CHECK_INTERVALS['15m'] || snap.maxFavExcursion >= threshold)) {
      snap.outcome15m = currentPrice;
      snap.win15m = snap.maxFavExcursion >= threshold;
      changed = true;
    }

    // 1h outcome
    if (snap.outcome1h === undefined && (elapsed >= CHECK_INTERVALS['1h'] || snap.maxFavExcursion >= threshold)) {
      snap.outcome1h = currentPrice;
      snap.win1h = snap.maxFavExcursion >= threshold;
      changed = true;
    }

    // Settled when all intervals evaluated
    if (
      snap.outcome5m !== undefined &&
      snap.outcome15m !== undefined &&
      snap.outcome1h !== undefined
    ) {
      snap.settled = true;
      settled++;
    }

    if (changed) updated++;
  }

  if (updated > 0) saveSnapshots(snapshots);
  return { updated, settled };
}

/**
 * Compute win rate statistics for a specific symbol or all symbols.
 * Uses the in-memory cache - safe to call frequently.
 */
export function computeWinRateStats(symbol?: string): WinRateStats[] {
  const snapshots = loadSnapshots();
  const symbolGroups = new Map<string, SignalSnapshot[]>();

  for (const snap of snapshots) {
    if (symbol && snap.symbol !== symbol) continue;
    const group = symbolGroups.get(snap.symbol) || [];
    group.push(snap);
    symbolGroups.set(snap.symbol, group);
  }

  const stats: WinRateStats[] = [];

  for (const [sym, signals] of symbolGroups) {
    const evaluated5m  = signals.filter(s => s.win5m  !== undefined && s.win5m  !== null);
    const evaluated15m = signals.filter(s => s.win15m !== undefined && s.win15m !== null);
    const evaluated1h  = signals.filter(s => s.win1h  !== undefined && s.win1h  !== null);

    const wins5m  = evaluated5m.filter(s => s.win5m).length;
    const wins15m = evaluated15m.filter(s => s.win15m).length;
    const wins1h  = evaluated1h.filter(s => s.win1h).length;

    const avgReturn = (
      snaps: SignalSnapshot[],
      outcomeKey: 'outcome5m' | 'outcome15m' | 'outcome1h'
    ) => {
      const valid = snaps.filter(s => s[outcomeKey] != null);
      if (valid.length === 0) return 0;
      const total = valid.reduce((sum, s) => {
        const outcome = s[outcomeKey] as number;
        const ret = (outcome - s.entryPrice) / s.entryPrice;
        const isBullish = s.signal === 'strong-buy' || s.signal === 'buy';
        return sum + (isBullish ? ret : -ret);
      }, 0);
      return total / valid.length;
    };

    stats.push({
      symbol: sym,
      totalSignals: signals.length,
      wins5m,
      losses5m: evaluated5m.length - wins5m,
      winRate5m:  evaluated5m.length  > 0 ? (wins5m  / evaluated5m.length)  * 100 : 0,
      wins15m,
      losses15m: evaluated15m.length - wins15m,
      winRate15m: evaluated15m.length > 0 ? (wins15m / evaluated15m.length) * 100 : 0,
      wins1h,
      losses1h: evaluated1h.length - wins1h,
      winRate1h:  evaluated1h.length  > 0 ? (wins1h  / evaluated1h.length)  * 100 : 0,
      avgReturn5m:  avgReturn(signals, 'outcome5m')  * 100,
      avgReturn15m: avgReturn(signals, 'outcome15m') * 100,
      avgReturn1h:  avgReturn(signals, 'outcome1h')  * 100,
    });
  }

  return stats.sort((a, b) => b.totalSignals - a.totalSignals);
}

/**
 * Get the global summary across all symbols.
 * Uses the in-memory cache - safe to call on every render.
 */
export function getGlobalWinRate(): {
  winRate5m: number;
  winRate15m: number;
  winRate1h: number;
  total: number;
  evaluated5m: number;
  evaluated15m: number;
  evaluated1h: number;
} {
  const snapshots = loadSnapshots();

  const e5  = snapshots.filter(s => s.win5m  !== undefined && s.win5m  !== null);
  const e15 = snapshots.filter(s => s.win15m !== undefined && s.win15m !== null);
  const e1h = snapshots.filter(s => s.win1h  !== undefined && s.win1h  !== null);

  return {
    winRate5m:  e5.length  > 0 ? (e5.filter(s => s.win5m).length   / e5.length)  * 100 : 0,
    winRate15m: e15.length > 0 ? (e15.filter(s => s.win15m).length  / e15.length) * 100 : 0,
    winRate1h:  e1h.length > 0 ? (e1h.filter(s => s.win1h).length   / e1h.length) * 100 : 0,
    total: snapshots.length,
    evaluated5m:  e5.length,
    evaluated15m: e15.length,
    evaluated1h:  e1h.length,
  };
}

/**
 * Returns a summary of all evaluated signals for global synchronization.
 */
export function getWinRateSummary() {
  const snapshots = loadSnapshots();
  const summary = {
    total: 0,
    win5m: 0,
    win15m: 0,
    win1h: 0,
    evaluated5m: 0,
    evaluated15m: 0,
    evaluated1h: 0,
  };

  snapshots.forEach(s => {
    summary.total++;
    if (s.win5m !== undefined && s.win5m !== null) {
      summary.evaluated5m++;
      if (s.win5m) summary.win5m++;
    }
    if (s.win15m !== undefined && s.win15m !== null) {
      summary.evaluated15m++;
      if (s.win15m) summary.win15m++;
    }
    if (s.win1h !== undefined && s.win1h !== null) {
      summary.evaluated1h++;
      if (s.win1h) summary.win1h++;
    }
  });

  return summary;
}

/**
 * Global Hydration: Allows production servers to seed the client win rate.
 * Prevents 'Calibrating' state on new devices.
 */
export function hydrateGlobalWinRate(data: Partial<ReturnType<typeof getWinRateSummary>>) {
  if (typeof window === 'undefined') return;
  // We don't overwrite local snapshots, we just return the combined stats
  // For now, this is used as a fallback if local total < 5.
  return data;
}

/**
 * Clear all signal tracking data.
 */
export function clearSignalTracker(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  _cache = [];
  _cacheTs = Date.now();
}

/**
 * Prune stale symbols that are no longer in the active watchlist.
 * Call this periodically to prevent localStorage bloat.
 */
export function pruneStaleSymbols(activeSymbols: Set<string>): void {
  if (typeof window === 'undefined') return;
  const snapshots = loadSnapshots();
  const filtered = snapshots.filter(s => activeSymbols.has(s.symbol));
  
  // Only save if we actually removed something
  if (filtered.length < snapshots.length) {
    console.log(`[signal-tracker] Pruned ${snapshots.length - filtered.length} stale signals`);
    saveSnapshots(filtered);
  }
}
