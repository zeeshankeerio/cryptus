import { calculateRsi, calculateRsiWithState } from './rsi';
import {
  latestEma, detectEmaCross, calculateMacd,
  calculateBollinger, calculateStochRsi, calculateVwap,
  detectVolumeSpike, computeStrategyScore,
  detectRsiDivergence, calculateROC, calculateConfluence,
} from './indicators';
import type { ScreenerEntry, ScreenerResponse, BinanceTicker, BinanceKline } from './types';

interface ScreenerOptions {
  smartMode?: boolean;
  rsiPeriod?: number;
}

interface SmartTuningState {
  dynamicCap: number;
  lastFailureRate: number;
  lastComputeMs: number;
}

const SCREENER_DEBUG = process.env.SCREENER_DEBUG === '1';

function debugLog(message: string, ...args: unknown[]) {
  if (SCREENER_DEBUG) console.log(message, ...args);
}

function debugWarn(message: string, ...args: unknown[]) {
  if (SCREENER_DEBUG) console.warn(message, ...args);
}

const BINANCE_APIS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://data-api.binance.vision',
] as const;
const KUCOIN_TICKER_URL = 'https://api.kucoin.com/api/v1/market/allTickers';
const FETCH_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0',
  'Accept': 'application/json',
};
const RSI_PERIOD = 14;
const KLINE_LIMIT = 499; // 499 candles ensures weight 1 (500+ is weight 5). Great for 15m MACD/RSI stability.
const KLINE_LIMIT_1H = 40; // 40 1h candles: Perfect for 1h RSI (needs > 28 for Wilder stability)
const BATCH_SIZE = 16;
const FETCH_RETRY_COUNT = 4; // increased for 600-coin robustness
const MAX_KLINE_FETCH = 120; // cap kline fetches per cycle (rolling refresh)
const KLINE_TIMEOUT_MS = 22_000; // 22s per kline fetch to reduce timeouts at scale

// ── Binance API Weight Tracking (Rate Limit Protection) ──
let globalWeight = 0;
let lastWeightReset = Date.now();
const MAX_WEIGHT_PER_MIN = 1100; // conservative limit (standard is 1200)

function trackWeight(weight: number) {
  const now = Date.now();
  if (now - lastWeightReset > 60000) {
    globalWeight = 0;
    lastWeightReset = now;
  }
  globalWeight += weight;
}

function getWeightRemaining(): number {
  const now = Date.now();
  if (now - lastWeightReset > 60000) return MAX_WEIGHT_PER_MIN;
  return Math.max(0, MAX_WEIGHT_PER_MIN - globalWeight);
}

// ── In-memory symbol cache ──
let symbolCache: { data: string[]; ts: number } | null = null;
const SYMBOL_CACHE_TTL = 3600_000; // 1 hour

// ── Fallback symbols in case Binance API is unreachable ──
const FALLBACK_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'TRXUSDT', 'MATICUSDT', 'SHIBUSDT', 'UNIUSDT', 'ATOMUSDT',
  'LTCUSDT', 'ETCUSDT', 'NEARUSDT', 'APTUSDT', 'FILUSDT',
  'ARBUSDT', 'OPUSDT', 'AAVEUSDT', 'GRTUSDT', 'FTMUSDT',
  'SANDUSDT', 'MANAUSDT', 'RUNEUSDT', 'ICPUSDT', 'HBARUSDT',
  'SUIUSDT', 'SEIUSDT', 'PEPEUSDT', 'INJUSDT', 'FETUSDT',
  'RENDERUSDT', 'WIFUSDT', 'BONKUSDT', 'STXUSDT', 'TIAUSDT',
  'JUPUSDT', 'PENDLEUSDT', 'IMXUSDT', 'LDOUSDT', 'DYDXUSDT',
  'GMXUSDT', 'WLDUSDT', 'FLOKIUSDT', 'JASMYUSDT', 'BLURUSDT',
];

// ── Ticker cache for price + change data ──
let tickerCache: { data: Map<string, BinanceTicker>; ts: number } | null = null;
const TICKER_CACHE_TTL = 30_000; // 30 seconds
const TRAFFIC_WARM_COOLDOWN_MS = 45_000;

// ── Result cache to avoid re-computing on rapid refreshes ──
const resultCache = new Map<string, { data: ScreenerResponse; count: number; smartMode: boolean; ts: number }>();
const smartTuningByCount = new Map<number, SmartTuningState>();
const trafficWarmLastRun = new Map<string, number>();

function getResultCacheTtl(symbolCount: number): number {
  if (symbolCount >= 800) return 30_000;
  if (symbolCount >= 500) return 20_000;
  if (symbolCount >= 300) return 15_000;
  if (symbolCount >= 200) return 12_000;
  return 8_000;
}

function getSmartModeDefault(): boolean {
  return process.env.SMART_MODE_DEFAULT !== '0';
}

function makeCacheKey(symbolCount: number, smartMode: boolean, rsiPeriod: number): string {
  return `${symbolCount}:${smartMode ? 'smart' : 'classic'}:rsi${rsiPeriod}`;
}

function getTrafficWarmCandidates(symbolCount: number): number[] {
  if (symbolCount <= 100) return [300, 500];
  if (symbolCount <= 300) return [500, 100];
  return [300, 100];
}

function maybeTrafficWarm(symbolCount: number, smartMode: boolean): void {
  if (process.env.TRAFFIC_WARM_DISABLED === '1') return;

  const key = smartMode ? 'smart' : 'classic';
  const now = Date.now();
  const lastRun = trafficWarmLastRun.get(key) ?? 0;
  if (now - lastRun < TRAFFIC_WARM_COOLDOWN_MS) return;

  const candidates = getTrafficWarmCandidates(symbolCount);
  for (const candidate of candidates) {
    if (candidate === symbolCount) continue;
    const cache = resultCache.get(makeCacheKey(candidate, smartMode, 14)); // Warm defaults to 14
    const ttl = getResultCacheTtl(candidate);
    const fresh = cache && now - cache.ts < ttl;
    if (fresh) continue;

    trafficWarmLastRun.set(key, now);
    debugLog(`[screener] traffic-warm trigger: request=${symbolCount}, warming=${candidate}, smart=${smartMode}`);
    void runRefresh(candidate, smartMode, 14);
    break;
  }
}

// ── Per-symbol indicator cache to avoid refetch/recompute on every refresh ──
const indicatorCache = new Map<string, { entry: ScreenerEntry; ts: number }>();
const INDICATOR_CACHE_TTL = 300_000; // 5 min — indicators drift slowly, WebSocket keeps prices live
const INDICATOR_CACHE_MAX = 5000;

function pruneIndicatorCache() {
  const now = Date.now();
  // Aggressive cleanup: remove anything older than TTL
  for (const [key, value] of indicatorCache.entries()) {
    if (now - value.ts > INDICATOR_CACHE_TTL) {
      indicatorCache.delete(key);
    }
  }

  // Cap cleanup: if still too large, remove oldest
  if (indicatorCache.size > INDICATOR_CACHE_MAX) {
    const sorted = [...indicatorCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const removeCount = indicatorCache.size - INDICATOR_CACHE_MAX;
    for (let i = 0; i < removeCount; i++) {
      indicatorCache.delete(sorted[i][0]);
    }
  }
}

function toNum(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function withTickerOverlay(entry: ScreenerEntry, ticker: BinanceTicker | undefined, nowTs: number): ScreenerEntry {
  if (!ticker) return { ...entry, updatedAt: nowTs };
  return {
    ...entry,
    price: toNum(ticker.lastPrice, entry.price),
    change24h: toNum(ticker.priceChangePercent, entry.change24h),
    volume24h: toNum(ticker.quoteVolume, entry.volume24h),
    updatedAt: nowTs,
  };
}

function buildTickerOnlyEntry(sym: string, ticker: BinanceTicker, nowTs: number): ScreenerEntry {
  return {
    symbol: sym,
    price: toNum(ticker.lastPrice, 0),
    change24h: toNum(ticker.priceChangePercent, 0),
    volume24h: toNum(ticker.quoteVolume, 0),
    rsi1m: null, rsi5m: null, rsi15m: null, rsi1h: null,
    signal: 'neutral',
    ema9: null, ema21: null, emaCross: 'none',
    macdLine: null, macdSignal: null, macdHistogram: null,
    bbUpper: null, bbMiddle: null, bbLower: null, bbPosition: null,
    stochK: null, stochD: null,
    vwap: null, vwapDiff: null, volumeSpike: false,
    strategyScore: 0, strategySignal: 'neutral', strategyLabel: 'N/A',
    strategyReasons: [],
    confluence: 0, confluenceLabel: 'No Data', rsiDivergence: 'none',
    rsiDivergenceCustom: 'none',
    momentum: null, rsiState1m: null,
    rsiState5m: null, rsiState15m: null, rsiState1h: null,
    rsiCustom: null, rsiStateCustom: null,
    rsiPeriodAtCreation: 14,
    signalStartedAt: nowTs,
    updatedAt: nowTs,
  };
}

function buildMeta(
  entries: ScreenerEntry[],
  computeTimeMs: number,
  fetchedAt = Date.now(),
  smartMode = false,
  refreshCap = 0,
): ScreenerResponse['meta'] {
  const hasIndicators = (e: ScreenerEntry) => (
    e.rsi1m !== null || e.rsi5m !== null || e.rsi15m !== null || e.macdHistogram !== null
  );
  const indicatorEntries = entries.filter(hasIndicators);
  const indicatorReady = entries.filter((e) => e.rsi1m !== null || e.rsi5m !== null || e.rsi15m !== null || e.macdHistogram !== null).length;
  const indicatorCoveragePct = entries.length > 0 ? Math.round((indicatorReady / entries.length) * 100) : 0;

  return {
    total: entries.length,
    indicatorReady,
    indicatorCoveragePct,
    oversold: indicatorEntries.filter((e) => e.signal === 'oversold').length,
    overbought: indicatorEntries.filter((e) => e.signal === 'overbought').length,
    strongBuy: indicatorEntries.filter((e) => e.strategySignal === 'strong-buy').length,
    buy: indicatorEntries.filter((e) => e.strategySignal === 'buy').length,
    neutral: indicatorEntries.filter((e) => e.strategySignal === 'neutral').length,
    sell: indicatorEntries.filter((e) => e.strategySignal === 'sell').length,
    strongSell: indicatorEntries.filter((e) => e.strategySignal === 'strong-sell').length,
    computeTimeMs,
    fetchedAt,
    smartMode,
    refreshCap,
    apiWeight: globalWeight,
  };
}

function fromCachedResult(symbolCount: number, smartMode: boolean, rsiPeriod: number): ScreenerResponse | null {
  const cache = resultCache.get(makeCacheKey(symbolCount, smartMode, rsiPeriod));
  if (!cache) return null;
  // Don't serve data older than 10 minutes
  if (Date.now() - cache.ts > 600_000) return null;
  const sliced = cache.data.data.slice(0, symbolCount);
  return {
    data: sliced,
    meta: buildMeta(
      sliced,
      cache.data.meta.computeTimeMs,
      cache.data.meta.fetchedAt,
      smartMode,
      cache.data.meta.refreshCap,
    ),
  };
}

interface KucoinTickerRow {
  symbol: string;
  last: string;
  changeRate: string;
  volValue: string;
}

interface KucoinTickerResponse {
  code: string;
  data?: {
    ticker?: KucoinTickerRow[];
  };
}

async function fetchKucoinTickers(): Promise<Map<string, BinanceTicker>> {
  const res = await fetch(KUCOIN_TICKER_URL, {
    signal: AbortSignal.timeout(12000),
    cache: 'no-store' as RequestCache,
  });
  if (!res.ok) throw new Error(`KuCoin ticker API ${res.status}`);

  const payload = await res.json() as KucoinTickerResponse;
  const rows = payload.data?.ticker ?? [];
  const map = new Map<string, BinanceTicker>();

  for (const row of rows) {
    // KuCoin uses BTC-USDT format; normalize to BTCUSDT
    if (!row.symbol.endsWith('-USDT')) continue;
    const symbol = row.symbol.replace('-', '');
    const changePct = Number.isFinite(parseFloat(row.changeRate))
      ? (parseFloat(row.changeRate) * 100).toString()
      : '0';

    map.set(symbol, {
      symbol,
      lastPrice: row.last,
      priceChangePercent: changePct,
      quoteVolume: row.volValue,
    });
  }

  return map;
}

/**
 * Fetch 24hr tickers from Binance. Returns Map<symbol, ticker>.
 */
async function fetchTickers(): Promise<Map<string, BinanceTicker>> {
  if (tickerCache && Date.now() - tickerCache.ts < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }

  let lastError: unknown;
  for (const base of BINANCE_APIS) {
    try {
      const res = await fetch(`${base}/api/v3/ticker/24hr`, {
        signal: AbortSignal.timeout(12000),
        headers: FETCH_HEADERS,
        cache: 'no-store' as RequestCache,
      });
      if (!res.ok) throw new Error(`Binance ticker API ${res.status} from ${base}`);

      const raw: BinanceTicker[] = await res.json();
      const map = new Map<string, BinanceTicker>();
      for (const t of raw) {
        map.set(t.symbol, t);
      }

      tickerCache = { data: map, ts: Date.now() };
      return map;
    } catch (err) {
      lastError = err;
    }
  }

  // Free-source fallback: KuCoin public market tickers
  try {
    const map = await fetchKucoinTickers();
    if (map.size > 0) {
      tickerCache = { data: map, ts: Date.now() };
      return map;
    }
  } catch (err) {
    lastError = err;
  }

  throw lastError ?? new Error('All ticker providers failed');
}

/**
 * Get top N USDT trading pairs sorted by 24h quote volume.
 */
async function getTopSymbols(count: number): Promise<string[]> {
  if (symbolCache && Date.now() - symbolCache.ts < SYMBOL_CACHE_TTL) {
    return symbolCache.data.slice(0, count);
  }

  try {
    const tickers = await fetchTickers();
    const usdtPairs = [...tickers.values()]
      .filter((t) => {
        if (!t.symbol.endsWith('USDT')) return false;
        // Exclude leverage tokens, stablecoins, wrapped/pegged tokens, and fiat pairs
        const base = t.symbol.slice(0, -4);
        if (/^(USDC|BUSD|TUSD|DAI|FDUSD|USDP|USDD|PYUSD|USD1|PAXG|WBTC|WBETH|BFUSD|EUR|GBP|AUD|BRL|TRY|BIDR|IDRT|UAH|NGN|PLN|RON|ARS|CZK)$/.test(base)) return false;
        if (/UP$|DOWN$|BEAR$|BULL$/.test(base)) return false;
        const vol = parseFloat(t.quoteVolume);
        return Number.isFinite(vol) && vol > 0;
      })
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, Math.max(count, 1200))
      .map((t) => t.symbol);

    symbolCache = { data: usdtPairs, ts: Date.now() };
    return usdtPairs.slice(0, count);
  } catch {
    return FALLBACK_SYMBOLS.slice(0, count);
  }
}

/**
 * Fetch klines with retry logic for resilience at scale.
 */
async function fetchWithRetry(
  path: string,
  label: string,
  retries = FETCH_RETRY_COUNT,
): Promise<BinanceKline[]> {
  let lastError: unknown;
  // Randomize starting endpoint so parallel fetches spread across all APIs
  const startIdx = Math.floor(Math.random() * BINANCE_APIS.length);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const base = BINANCE_APIS[(startIdx + attempt) % BINANCE_APIS.length];
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(KLINE_TIMEOUT_MS),
        headers: FETCH_HEADERS,
        cache: 'no-store' as RequestCache,
      });
      if (res.status === 429) {
        const wait = Math.min(2000 * (attempt + 1), 8000);
        debugWarn(`[kline] 429 rate-limited from ${base}, waiting ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      
      const weightHeader = res.headers.get('x-mbx-used-weight-1m');
      if (weightHeader) {
        const hWeight = parseInt(weightHeader, 10);
        if (!isNaN(hWeight)) globalWeight = Math.max(globalWeight, hWeight);
      } else {
        trackWeight(1);
      }

      if (!res.ok) throw new Error(`${label}: HTTP ${res.status} from ${base}`);
      return res.json();
    } catch (err) {
      lastError = err;
      if (attempt === retries) {
        debugWarn(`[kline] ${label}: all ${retries + 1} attempts failed:`, err instanceof Error ? err.message : String(err));
        throw err;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error(`${label}: exhausted retries`);
}

/**
 * Fetch 1m klines for a single symbol.
 */
async function fetchKlines(symbol: string): Promise<BinanceKline[]> {
  const path = `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${KLINE_LIMIT}`;
  return fetchWithRetry(path, `Klines 1m ${symbol}`);
}

/**
 * Fetch 1h klines for a single symbol.
 */
async function fetchKlines1h(symbol: string): Promise<BinanceKline[]> {
  const path = `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=${KLINE_LIMIT_1H}`;
  return fetchWithRetry(path, `Klines 1h ${symbol}`);
}

async function fetchTickersSafe(): Promise<Map<string, BinanceTicker>> {
  try {
    return await fetchTickers();
  } catch {
    return tickerCache?.data ?? new Map<string, BinanceTicker>();
  }
}

/**
 * Fetch both 1m and 1h klines in a single concurrent pass per symbol.
 */
async function fetchAllKlinesBatched(
  symbols: string[]
): Promise<{ sym: string; res1m: PromiseSettledResult<BinanceKline[]>; res1h: PromiseSettledResult<BinanceKline[]> }[]> {
  const results = new Array<{ sym: string; res1m: PromiseSettledResult<BinanceKline[]>; res1h: PromiseSettledResult<BinanceKline[]> }>(symbols.length);
  const concurrency = symbols.length >= 500 ? 40 // Lowered for stability on Render
    : symbols.length >= 400 ? 32
    : symbols.length >= 250 ? 24
    : symbols.length >= 120 ? 16
    : BATCH_SIZE;

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= symbols.length) return;
      const sym = symbols[idx];

      // Fetch both in parallel for this symbol
      const [res1m, res1h] = await Promise.allSettled([
        fetchKlines(sym),
        fetchKlines1h(sym)
      ]);

      results[idx] = { sym, res1m, res1h };
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Aggregate 1m klines into higher timeframe klines.
 * Returns full OHLCV for BB/VWAP calculations.
 */
function aggregateKlines(
  klines: BinanceKline[],
  minutes: number,
  cache?: Map<number, any[]>
): { open: number; high: number; low: number; close: number; volume: number }[] {
  if (cache && cache.has(minutes)) return cache.get(minutes)!;

  const intervalMs = minutes * 60_000;
  const buckets = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

  for (const k of klines) {
    const openTime = k[0];
    const bucketStart = Math.floor(openTime / intervalMs) * intervalMs;
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);
    const volume = parseFloat(k[5]);

    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, { open: parseFloat(k[1]), high, low, close, volume });
    } else {
      existing.high = Math.max(existing.high, high);
      existing.low = Math.min(existing.low, low);
      existing.close = close;
      existing.volume += volume;
    }
  }

  const result = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
  
  if (cache) cache.set(minutes, result);
  return result;
}

function deriveSignal(rsi: number | null): ScreenerEntry['signal'] {
  if (rsi === null) return 'neutral';
  if (rsi < 30) return 'oversold';
  if (rsi > 70) return 'overbought';
  return 'neutral';
}

function buildEntry(
  sym: string,
  klines1m: BinanceKline[],
  klines1h: BinanceKline[] | null,
  ticker: BinanceTicker | undefined,
  nowTs: number,
  rsiPeriod: number = 14,
  prevEntry?: ScreenerEntry,
): ScreenerEntry | null {
  try {
    const validKlines = klines1m.filter((k) => k !== null && k.length >= 6);
    if (validKlines.length < rsiPeriod + 1) return null;

    const closes1m = validKlines.map((k) => parseFloat(k[4]));
    const highs1m = validKlines.map((k) => parseFloat(k[2]));
    const lows1m = validKlines.map((k) => parseFloat(k[3]));
    const volumes1m = validKlines.map((k) => parseFloat(k[5]));

    // Industry Standard RSIs (Period 14)
    const stdPeriod = 14;
    const rsi1m = calculateRsi(closes1m, stdPeriod);

    const aggCache = new Map<number, any[]>();
    const agg5m = aggregateKlines(validKlines, 5, aggCache);
    const closes5m = agg5m.map((c) => c.close);
    const rsi5m = closes5m.length >= stdPeriod + 1 ? calculateRsi(closes5m, stdPeriod) : null;

    const agg15m = aggregateKlines(validKlines, 15, aggCache);
    const closes15m = agg15m.map((c) => c.close);
    const rsi15m = closes15m.length >= stdPeriod + 1 ? calculateRsi(closes15m, stdPeriod) : null;

    let rsi1h: number | null = null;
    let closes1h: number[] = [];
    if (klines1h && klines1h.length >= stdPeriod + 1) {
      closes1h = klines1h.map((k) => parseFloat(k[4]));
      rsi1h = calculateRsi(closes1h, stdPeriod);
    } else {
      const agg1h = aggregateKlines(validKlines, 60, aggCache);
      closes1h = agg1h.map((c) => c.close);
      if (closes1h.length >= stdPeriod + 1) {
        rsi1h = calculateRsi(closes1h, stdPeriod);
      }
    }

    // Dynamic/Custom RSI (User Defined Period)
    const rsiCustom = calculateRsi(closes15m, rsiPeriod);
    const rsiStateCustom = calculateRsiWithState(closes15m, rsiPeriod);

    const ema9 = latestEma(closes15m, 9);
    const ema21 = latestEma(closes15m, 21);
    const emaCross = detectEmaCross(closes15m, 9, 21);
    const macd = calculateMacd(closes15m);
    const bb = calculateBollinger(closes15m);
    const stochRsi = calculateStochRsi(closes15m);

    const todayUtcMs = new Date().setUTCHours(0, 0, 0, 0);
    let vwapStart = 0;
    for (let j = 0; j < validKlines.length; j++) {
      if (validKlines[j][0] >= todayUtcMs) {
        vwapStart = j;
        break;
      }
    }

    const vwap = calculateVwap(
      highs1m.slice(vwapStart),
      lows1m.slice(vwapStart),
      closes1m.slice(vwapStart),
      volumes1m.slice(vwapStart),
    );

    const priceFromKline = closes1m[closes1m.length - 1];
    const price = toNum(ticker?.lastPrice, priceFromKline);
    const vwapDiff = vwap !== null && vwap > 0
      ? Math.round(((price - vwap) / vwap) * 10000) / 100
      : null;

    const volumeSpike = detectVolumeSpike(volumes1m);
    
    // Main signals and strategy ALWAYS use industry standard 14 for consistency
    const signal = deriveSignal(rsi15m ?? rsi1m);
    const stdRsiDivergence = detectRsiDivergence(closes15m, stdPeriod, 40);

    // Intelligence indicators (Standard baseline)
    const rsiState1m = calculateRsiWithState(closes1m, stdPeriod);
    const rsiState5m = calculateRsiWithState(closes5m, stdPeriod);
    const rsiState15m = calculateRsiWithState(closes15m, stdPeriod);
    const rsiState1h = closes1h.length >= stdPeriod + 1 ? calculateRsiWithState(closes1h, stdPeriod) : null;

    const momentum = calculateROC(closes15m, 10);
    const confluenceResult = calculateConfluence({
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: macd?.histogram ?? null,
      emaCross,
      stochK: stochRsi?.k ?? null,
      bbPosition: bb?.position ?? null,
    });

    const strategy = computeStrategyScore({
      rsi1m,
      rsi5m,
      rsi15m,
      rsi1h,
      macdHistogram: macd?.histogram ?? null,
      bbPosition: bb?.position ?? null,
      stochK: stochRsi?.k ?? null,
      stochD: stochRsi?.d ?? null,
      emaCross,
      vwapDiff,
      volumeSpike,
      price,
      confluence: confluenceResult.score,
      rsiDivergence: stdRsiDivergence,
      momentum,
    });

    // Custom analysis (Isolated from strategy)
    const customDivergence = detectRsiDivergence(closes15m, rsiPeriod, 40);

    let signalStartedAt = nowTs;
    if (prevEntry && prevEntry.strategySignal === strategy.signal) {
      signalStartedAt = prevEntry.signalStartedAt || prevEntry.updatedAt;
    }

    return {
      symbol: sym,
      price,
      change24h: toNum(ticker?.priceChangePercent, 0),
      volume24h: toNum(ticker?.quoteVolume, 0),
      rsi1m,
      rsi5m,
      rsi15m,
      signal,
      rsi1h,
      ema9,
      ema21,
      emaCross,
      macdLine: macd?.macdLine ?? null,
      macdSignal: macd?.signalLine ?? null,
      macdHistogram: macd?.histogram ?? null,
      bbUpper: bb?.upper ?? null,
      bbMiddle: bb?.middle ?? null,
      bbLower: bb?.lower ?? null,
      bbPosition: bb?.position ?? null,
      stochK: stochRsi?.k ?? null,
      stochD: stochRsi?.d ?? null,
      vwap,
      vwapDiff,
      volumeSpike,
      strategyScore: strategy.score,
      strategySignal: strategy.signal,
      strategyLabel: strategy.label,
      strategyReasons: strategy.reasons,
      confluence: confluenceResult.score,
      confluenceLabel: confluenceResult.label,
      rsiDivergence: stdRsiDivergence, // Global column stays at 14 standard
      rsiDivergenceCustom: customDivergence,
      momentum,
      rsiState1m,
      rsiState5m,
      rsiState15m,
      rsiState1h,
      rsiCustom,
      rsiStateCustom,
      rsiPeriodAtCreation: rsiPeriod,
      signalStartedAt,
      updatedAt: nowTs,
    };
  } catch (err) {
    debugWarn(`[screener] buildEntry failed for ${sym}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const refreshInFlight = new Map<string, Promise<ScreenerResponse>>();

function runRefresh(symbolCount: number, smartMode: boolean, rsiPeriod: number = 14): Promise<ScreenerResponse> {
  const inflightKey = makeCacheKey(symbolCount, smartMode, rsiPeriod);
  const existing = refreshInFlight.get(inflightKey);
  if (existing) return existing;

  const work = (async (): Promise<ScreenerResponse> => {
    const start = Date.now();
    const nowTs = Date.now();
    debugLog(`[screener] runRefresh(${symbolCount}, smart=${smartMode}) starting...`);

    // 1. Get top symbols + ticker data in parallel
    const [symbols, tickers] = await Promise.all([
      getTopSymbols(symbolCount),
      fetchTickersSafe(),
    ]);

    // 2. Fetch klines only for symbols with stale/missing indicator cache
    const staleBefore = nowTs - INDICATOR_CACHE_TTL;
    const uncachedSymbols = symbols.filter((sym) => !indicatorCache.has(`${sym}:${rsiPeriod}`));
    let symbolsToRefresh = symbols.filter((sym) => {
      const cached = indicatorCache.get(`${sym}:${rsiPeriod}`);
      return !cached || cached.ts < staleBefore;
    });

    // Bootstrap mode: prioritise full coverage so all selected pairs get indicators quickly.
    // Rolling mode: once coverage is warm, keep each cycle bounded.
    const tuning = smartTuningByCount.get(symbolCount) ?? {
      dynamicCap: symbolCount >= 800 ? 800 : symbolCount >= 500 ? 500 : symbolCount >= 400 ? 400 : 160,
      lastFailureRate: 0,
      lastComputeMs: 0,
    };

    const baseBootstrapCap = symbolCount;
    const baseRollingCap = symbolCount >= 800 ? 600 : symbolCount >= 500 ? 400 : symbolCount >= 400 ? 300 : 150;
    let refreshCap = smartMode
      ? (uncachedSymbols.length > 0
        ? Math.max(symbolCount, tuning.dynamicCap) // Fill gaps aggressively
        : Math.min(symbolCount, Math.max(baseRollingCap, tuning.dynamicCap)))
      : (uncachedSymbols.length > 0 ? symbolCount : baseRollingCap);

    const weightRemaining = getWeightRemaining();
    if (weightRemaining < 200 && symbolsToRefresh.length > 50) {
      debugWarn(`[screener] Rate limit critical (${globalWeight}/${MAX_WEIGHT_PER_MIN}), aggressive throttling enabled`);
      refreshCap = Math.min(refreshCap, 40);
    } else if (weightRemaining < 500 && symbolsToRefresh.length > 100) {
      refreshCap = Math.min(refreshCap, 80);
    }

    if (symbolsToRefresh.length > refreshCap) {
      symbolsToRefresh.sort((a, b) => {
        // Strict priority for uncached symbols to fill the "N/A" gaps first
        const aCached = indicatorCache.has(`${a}:${rsiPeriod}`);
        const bCached = indicatorCache.has(`${b}:${rsiPeriod}`);
        if (aCached !== bCached) return aCached ? 1 : -1;
        
        const ta = indicatorCache.get(`${a}:${rsiPeriod}`)?.ts ?? 0;
        const tb = indicatorCache.get(`${b}:${rsiPeriod}`)?.ts ?? 0;
        return ta - tb; // oldest first
      });
      symbolsToRefresh = symbolsToRefresh.slice(0, refreshCap);
    }

    debugLog(
      `[screener] coverage pre-refresh: ${symbols.length - uncachedSymbols.length}/${symbols.length}, refreshing ${symbolsToRefresh.length}, cap=${refreshCap}`,
    );

    const klineResultBySymbol1m = new Map<string, PromiseSettledResult<BinanceKline[]>>();
    const klineResultBySymbol1h = new Map<string, PromiseSettledResult<BinanceKline[]>>();
    let failedCount = 0;

    if (symbolsToRefresh.length > 0) {
      const batchResults = await fetchAllKlinesBatched(symbolsToRefresh);

      for (const { sym, res1m, res1h } of batchResults) {
        klineResultBySymbol1m.set(sym, res1m);
        klineResultBySymbol1h.set(sym, res1h);

        if (res1m.status === 'rejected' && res1h.status === 'rejected') {
          failedCount++;
        }
      }
    }

    if (failedCount > 0) {
      console.warn(`[screener] ${failedCount}/${symbolsToRefresh.length} kline fetches failed`);
      // Log first few failure reasons for diagnosis
      let logged = 0;
      for (const sym of symbolsToRefresh) {
        const res1m = klineResultBySymbol1m.get(sym);
        const res1h = klineResultBySymbol1h.get(sym);
        if (res1m?.status === 'rejected' && res1h?.status === 'rejected' && logged < 3) {
          debugWarn(`[screener] ${sym} 1m failed:`, res1m.reason instanceof Error ? res1m.reason.message : String(res1m.reason));
          debugWarn(`[screener] ${sym} 1h failed:`, res1h.reason instanceof Error ? res1h.reason.message : String(res1h.reason));
          logged++;
        }
      }
    }

    const successCount = symbolsToRefresh.length - failedCount;
    debugLog(`[screener] Klines: ${successCount} ok, ${failedCount} failed out of ${symbolsToRefresh.length} symbols`);

    // 3. Process each symbol
    const entries: ScreenerEntry[] = [];

    for (const sym of symbols) {
      const ticker = tickers.get(sym);
      const res1m = klineResultBySymbol1m.get(sym);
      const res1h = klineResultBySymbol1h.get(sym);

      if (res1m?.status === 'fulfilled') {
        const klines1m = res1m.value;
        const klines1h = res1h?.status === 'fulfilled' ? res1h.value : null;
        
        if (!klines1m || klines1m.length === 0) {
          debugWarn(`[screener] ${sym}: kline fetch returned empty`);
        } else {
          const prevEntry = indicatorCache.get(`${sym}:${rsiPeriod}`)?.entry;
          const freshEntry = buildEntry(sym, klines1m, klines1h, ticker, nowTs, rsiPeriod, prevEntry);
          if (freshEntry) {
            entries.push(freshEntry);
            indicatorCache.set(`${sym}:${rsiPeriod}`, { entry: freshEntry, ts: nowTs });
            continue;
          }
        }
      }

      const cached = indicatorCache.get(`${sym}:${rsiPeriod}`);
      if (cached) {
        entries.push(withTickerOverlay(cached.entry, ticker, nowTs));
        continue;
      }

      // Ticker-only fallback: show price data even when indicators unavailable
      // (common on Vercel cold starts where kline endpoints may be blocked)
      if (ticker) {
        entries.push(buildTickerOnlyEntry(sym, ticker, nowTs));
      }
    }

    pruneIndicatorCache();

    const withIndicators = entries.filter((e) => e.rsi15m !== null).length;
    const computeTimeMs = Date.now() - start;
    debugLog(`[screener] Done: ${entries.length} entries (${withIndicators} with indicators, ${entries.length - withIndicators} ticker-only) in ${computeTimeMs}ms`);

    if (smartMode) {
      const failureRate = symbolsToRefresh.length > 0 ? failedCount / symbolsToRefresh.length : 0;
      let nextCap = tuning.dynamicCap;
      if (failureRate > 0.35 || computeTimeMs > 45_000) {
        nextCap = Math.max(80, tuning.dynamicCap - 30);
      } else if (failureRate < 0.15 && computeTimeMs < 25_000) {
        nextCap = Math.min(symbolCount, tuning.dynamicCap + 20);
      }
      smartTuningByCount.set(symbolCount, {
        dynamicCap: nextCap,
        lastFailureRate: failureRate,
        lastComputeMs: computeTimeMs,
      });
    }

    const response: ScreenerResponse = {
      data: entries,
      meta: buildMeta(entries, computeTimeMs, Date.now(), smartMode, refreshCap),
    };

    // Cache the result if there is useful data; keep stale cache on total outage.
    if (response.data.length > 0) {
      resultCache.set(makeCacheKey(symbolCount, smartMode, rsiPeriod), {
        data: response,
        count: symbolCount,
        smartMode,
        ts: Date.now(),
      });
      return response;
    }

    const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod);
    if (stale) return stale;

    return response;
  })()
    .catch(() => {
      const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod);
      if (stale) return stale;
      return {
        data: [],
        meta: buildMeta([], 0, Date.now(), smartMode, 0),
      };
    })
    .finally(() => {
      refreshInFlight.delete(inflightKey);
    });

  refreshInFlight.set(inflightKey, work);
  return work;
}

/**
 * Main screener function: fetch data, compute all indicators, return results.
 * Supports 500+ coins via batched parallel fetching.
 */
export async function getScreenerData(symbolCount = 100, options: ScreenerOptions = {}): Promise<ScreenerResponse> {
  const smartMode = options.smartMode ?? getSmartModeDefault();
  const rsiPeriod = options.rsiPeriod ?? 14;
  maybeTrafficWarm(symbolCount, smartMode);

  // Return cached result if fresh enough and same count.
  const resultCacheTtl = getResultCacheTtl(symbolCount);
  const cachedEntry = resultCache.get(makeCacheKey(symbolCount, smartMode, rsiPeriod));
  if (cachedEntry && cachedEntry.count >= symbolCount && Date.now() - cachedEntry.ts < resultCacheTtl) {
    if (cachedEntry.count === symbolCount) return cachedEntry.data;
    const cached = fromCachedResult(symbolCount, smartMode, rsiPeriod);
    if (cached) return cached;
  }

  // Stale-first: always return cached snapshot instantly.
  // WebSocket keeps prices live between indicator refreshes.
  const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod);
  if (stale) {
    void runRefresh(symbolCount, smartMode, rsiPeriod);
    return stale;
  }

  // No usable stale snapshot available; compute (deduplicated by symbolCount).
  return runRefresh(symbolCount, smartMode, rsiPeriod);
}
