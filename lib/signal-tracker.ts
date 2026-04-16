/**
 * Mindscape Analytics — Signal Win Rate Tracker™
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tracks signal outcomes over time to compute verifiable win rates.
 * This is a UNIQUE feature — no competitor shows signal accuracy metrics.
 *
 * How it works:
 *   1. When a signal fires (Strong Buy/Sell), we snapshot the price.
 *   2. After configurable time windows (5m, 15m, 1h), we check the outcome.
 *   3. We compute win/loss ratios and display them alongside signals.
 *
 * Storage: localStorage for client-side persistence, with optional API sync.
 */

// ── Types ─────────────────────────────────────────────────────────

export interface SignalSnapshot {
  id: string;
  symbol: string;
  signal: 'strong-buy' | 'strong-sell' | 'buy' | 'sell';
  entryPrice: number;
  timestamp: number;
  /** Prices at check intervals (filled asynchronously) */
  outcome5m?: number | null;
  outcome15m?: number | null;
  outcome1h?: number | null;
  /** Win/loss at each interval (calculated) */
  win5m?: boolean | null;
  win15m?: boolean | null;
  win1h?: boolean | null;
  /** Whether all outcomes have been evaluated */
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
const MAX_SNAPSHOTS = 500; // Keep last 500 signals
const CHECK_INTERVALS = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
} as const;

// Win threshold: price moved in signal direction by at least 0.1%
const WIN_THRESHOLD_PCT = 0.001;

// ── Storage Helpers ───────────────────────────────────────────────

function loadSnapshots(): SignalSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: SignalSnapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Trim to max size, keeping most recent
    const trimmed = snapshots.slice(-MAX_SNAPSHOTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full — evict oldest 20%
    try {
      const evicted = snapshots.slice(Math.floor(snapshots.length * 0.2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(evicted));
    } catch {
      // Silent fail
    }
  }
}

// ── Core Functions ────────────────────────────────────────────────

/**
 * Record a new signal snapshot when a strong signal fires.
 */
export function recordSignal(
  symbol: string,
  signal: SignalSnapshot['signal'],
  entryPrice: number,
): string {
  const id = `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const snapshot: SignalSnapshot = {
    id,
    symbol,
    signal,
    entryPrice,
    timestamp: Date.now(),
    settled: false,
  };

  const snapshots = loadSnapshots();
  snapshots.push(snapshot);
  saveSnapshots(snapshots);

  return id;
}

/**
 * Check and update outcomes for all unsettled snapshots.
 * Call this periodically with current prices.
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
    const priceChange = (currentPrice - snap.entryPrice) / snap.entryPrice;
    let changed = false;

    // Check 5m outcome
    if (snap.outcome5m === undefined && elapsed >= CHECK_INTERVALS['5m']) {
      snap.outcome5m = currentPrice;
      snap.win5m = isBullish
        ? priceChange >= WIN_THRESHOLD_PCT
        : priceChange <= -WIN_THRESHOLD_PCT;
      changed = true;
    }

    // Check 15m outcome
    if (snap.outcome15m === undefined && elapsed >= CHECK_INTERVALS['15m']) {
      snap.outcome15m = currentPrice;
      snap.win15m = isBullish
        ? priceChange >= WIN_THRESHOLD_PCT
        : priceChange <= -WIN_THRESHOLD_PCT;
      changed = true;
    }

    // Check 1h outcome
    if (snap.outcome1h === undefined && elapsed >= CHECK_INTERVALS['1h']) {
      snap.outcome1h = currentPrice;
      snap.win1h = isBullish
        ? priceChange >= WIN_THRESHOLD_PCT
        : priceChange <= -WIN_THRESHOLD_PCT;
      changed = true;
    }

    // Mark as settled when all intervals are evaluated
    if (snap.outcome5m !== undefined && snap.outcome15m !== undefined && snap.outcome1h !== undefined) {
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
    const evaluated5m = signals.filter(s => s.win5m !== undefined && s.win5m !== null);
    const evaluated15m = signals.filter(s => s.win15m !== undefined && s.win15m !== null);
    const evaluated1h = signals.filter(s => s.win1h !== undefined && s.win1h !== null);

    const wins5m = evaluated5m.filter(s => s.win5m).length;
    const wins15m = evaluated15m.filter(s => s.win15m).length;
    const wins1h = evaluated1h.filter(s => s.win1h).length;

    // Average returns
    const avgReturn = (snaps: SignalSnapshot[], outcomeKey: 'outcome5m' | 'outcome15m' | 'outcome1h') => {
      const valid = snaps.filter(s => s[outcomeKey] !== undefined && s[outcomeKey] !== null);
      if (valid.length === 0) return 0;
      const totalReturn = valid.reduce((sum, s) => {
        const outcome = s[outcomeKey] as number;
        const ret = (outcome - s.entryPrice) / s.entryPrice;
        const isBullish = s.signal === 'strong-buy' || s.signal === 'buy';
        return sum + (isBullish ? ret : -ret);
      }, 0);
      return totalReturn / valid.length;
    };

    stats.push({
      symbol: sym,
      totalSignals: signals.length,
      wins5m,
      losses5m: evaluated5m.length - wins5m,
      winRate5m: evaluated5m.length > 0 ? (wins5m / evaluated5m.length) * 100 : 0,
      wins15m,
      losses15m: evaluated15m.length - wins15m,
      winRate15m: evaluated15m.length > 0 ? (wins15m / evaluated15m.length) * 100 : 0,
      wins1h,
      losses1h: evaluated1h.length - wins1h,
      winRate1h: evaluated1h.length > 0 ? (wins1h / evaluated1h.length) * 100 : 0,
      avgReturn5m: avgReturn(signals, 'outcome5m') * 100,
      avgReturn15m: avgReturn(signals, 'outcome15m') * 100,
      avgReturn1h: avgReturn(signals, 'outcome1h') * 100,
    });
  }

  return stats.sort((a, b) => b.totalSignals - a.totalSignals);
}

/**
 * Get the global summary across all symbols.
 */
export function getGlobalWinRate(): { winRate5m: number; winRate15m: number; winRate1h: number; total: number } {
  const snapshots = loadSnapshots();

  const e5 = snapshots.filter(s => s.win5m !== undefined && s.win5m !== null);
  const e15 = snapshots.filter(s => s.win15m !== undefined && s.win15m !== null);
  const e1h = snapshots.filter(s => s.win1h !== undefined && s.win1h !== null);

  return {
    winRate5m: e5.length > 0 ? (e5.filter(s => s.win5m).length / e5.length) * 100 : 0,
    winRate15m: e15.length > 0 ? (e15.filter(s => s.win15m).length / e15.length) * 100 : 0,
    winRate1h: e1h.length > 0 ? (e1h.filter(s => s.win1h).length / e1h.length) * 100 : 0,
    total: snapshots.length,
  };
}

/**
 * Clear all signal tracking data.
 */
export function clearSignalTracker(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
