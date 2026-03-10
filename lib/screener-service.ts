import { calculateRsi } from './rsi';
import {
  latestEma, detectEmaCross, calculateMacd,
  calculateBollinger, calculateStochRsi, calculateVwap,
  detectVolumeSpike, computeStrategyScore,
} from './indicators';
import type { ScreenerEntry, ScreenerResponse, BinanceTicker, BinanceKline } from './types';

const BINANCE_APIS = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
  'https://data-api.binance.vision',
] as const;
const FETCH_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (compatible; CryptoRSI/1.0)',
  'Accept': 'application/json',
};
const RSI_PERIOD = 14;
const KLINE_LIMIT = 900; // 900 1m candles (~15h): minimum for derived 1h RSI(14) + 15m indicators
const BATCH_SIZE = 50; // baseline parallel kline fetches per batch
const BATCH_DELAY_MS = 120; // low baseline delay – Binance allows 1200 req/min
const FETCH_RETRY_COUNT = 2; // retry failed kline fetches
const MAX_KLINE_FETCH = 80; // cap kline fetches per cycle (rolling refresh)

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

// ── Result cache to avoid re-computing on rapid refreshes ──
let resultCache: { data: ScreenerResponse; count: number; ts: number } | null = null;

function getResultCacheTtl(symbolCount: number): number {
  // Shorter TTL is fine — stale-first always returns cached data instantly
  // and rolling refresh keeps cycle time low.
  if (symbolCount >= 500) return 20_000;
  if (symbolCount >= 300) return 15_000;
  if (symbolCount >= 200) return 12_000;
  return 8_000;
}

// ── Per-symbol indicator cache to avoid refetch/recompute on every refresh ──
const indicatorCache = new Map<string, { entry: ScreenerEntry; ts: number }>();
const INDICATOR_CACHE_TTL = 180_000; // 3 min — indicators barely drift, WebSocket keeps prices live
const INDICATOR_CACHE_MAX = 1500;

function pruneIndicatorCache() {
  if (indicatorCache.size <= INDICATOR_CACHE_MAX) return;
  const sorted = [...indicatorCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const removeCount = indicatorCache.size - INDICATOR_CACHE_MAX;
  for (let i = 0; i < removeCount; i++) {
    indicatorCache.delete(sorted[i][0]);
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
    updatedAt: nowTs,
  };
}

function buildMeta(entries: ScreenerEntry[], computeTimeMs: number, fetchedAt = Date.now()): ScreenerResponse['meta'] {
  return {
    total: entries.length,
    oversold: entries.filter((e) => e.signal === 'oversold').length,
    overbought: entries.filter((e) => e.signal === 'overbought').length,
    strongBuy: entries.filter((e) => e.strategySignal === 'strong-buy').length,
    buy: entries.filter((e) => e.strategySignal === 'buy').length,
    neutral: entries.filter((e) => e.strategySignal === 'neutral').length,
    sell: entries.filter((e) => e.strategySignal === 'sell').length,
    strongSell: entries.filter((e) => e.strategySignal === 'strong-sell').length,
    computeTimeMs,
    fetchedAt,
  };
}

function fromCachedResult(symbolCount: number): ScreenerResponse | null {
  if (!resultCache) return null;
  // Don't serve data older than 10 minutes
  if (Date.now() - resultCache.ts > 600_000) return null;
  const sliced = resultCache.data.data.slice(0, symbolCount);
  return {
    data: sliced,
    meta: buildMeta(sliced, resultCache.data.meta.computeTimeMs, resultCache.data.meta.fetchedAt),
  };
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
        signal: AbortSignal.timeout(10000),
        headers: FETCH_HEADERS,
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

  throw lastError ?? new Error('All Binance ticker endpoints failed');
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
        // Exclude leverage tokens, stablecoins, and low-quality pairs
        const base = t.symbol.slice(0, -4);
        if (/^(USDC|BUSD|TUSD|DAI|FDUSD|USDP|USDD|EUR|GBP|AUD|BRL|TRY)$/.test(base)) return false;
        if (/UP$|DOWN$|BEAR$|BULL$/.test(base)) return false;
        const vol = parseFloat(t.quoteVolume);
        return Number.isFinite(vol) && vol > 0;
      })
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, Math.max(count, 500))
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
  for (let attempt = 0; attempt <= retries; attempt++) {
    const base = BINANCE_APIS[attempt % BINANCE_APIS.length];
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000), headers: FETCH_HEADERS });
      if (res.status === 429) {
        // Rate limited — wait and retry
        const wait = Math.min(2000 * (attempt + 1), 5000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`${label}: ${res.status} from ${base}`);
      return res.json();
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
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
  return fetchWithRetry(path, `Klines ${symbol}`);
}

async function fetchTickersSafe(): Promise<Map<string, BinanceTicker>> {
  try {
    return await fetchTickers();
  } catch {
    return tickerCache?.data ?? new Map<string, BinanceTicker>();
  }
}

/**
 * Fetch klines in batches to avoid overwhelming Binance API.
 */
async function fetchKlinesBatched(
  symbols: string[],
  fetcher: (symbol: string) => Promise<BinanceKline[]>,
): Promise<PromiseSettledResult<BinanceKline[]>[]> {
  const results: PromiseSettledResult<BinanceKline[]>[] = [];
  const batchSize = symbols.length >= 400 ? 40 : symbols.length >= 200 ? 45 : BATCH_SIZE;
  const batchDelay = symbols.length >= 60 ? 180 : BATCH_DELAY_MS;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fetcher));
    results.push(...batchResults);
    // Delay between batches to respect Binance rate limits
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, batchDelay));
    }
  }

  return results;
}

/**
 * Aggregate 1m klines into higher timeframe klines.
 * Returns full OHLCV for BB/VWAP calculations.
 */
function aggregateKlines(
  klines: BinanceKline[],
  minutes: number,
): { open: number; high: number; low: number; close: number; volume: number }[] {
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

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => v);
}

function deriveSignal(rsi: number | null): ScreenerEntry['signal'] {
  if (rsi === null) return 'neutral';
  if (rsi < 30) return 'oversold';
  if (rsi > 70) return 'overbought';
  return 'neutral';
}

function buildEntryFromKlines(
  sym: string,
  klines: BinanceKline[],
  ticker: BinanceTicker | undefined,
  nowTs: number,
): ScreenerEntry | null {
  try {
    // Filter out klines with invalid data
    const validKlines = klines.filter((k) => {
      const close = parseFloat(k[4]);
      return Number.isFinite(close) && close > 0;
    });
    if (validKlines.length < RSI_PERIOD + 2) return null;

  const closes1m = validKlines.map((k) => parseFloat(k[4]));
  const highs1m = validKlines.map((k) => parseFloat(k[2]));
  const lows1m = validKlines.map((k) => parseFloat(k[3]));
  const volumes1m = validKlines.map((k) => parseFloat(k[5]));

  const rsi1m = calculateRsi(closes1m, RSI_PERIOD);

  const agg5m = aggregateKlines(validKlines, 5);
  const closes5m = agg5m.map((c) => c.close);
  const rsi5m = closes5m.length >= RSI_PERIOD + 1 ? calculateRsi(closes5m, RSI_PERIOD) : null;

  const agg15m = aggregateKlines(validKlines, 15);
  const closes15m = agg15m.map((c) => c.close);
  const rsi15m = closes15m.length >= RSI_PERIOD + 1 ? calculateRsi(closes15m, RSI_PERIOD) : null;

  let rsi1h: number | null = null;
  const agg1h = aggregateKlines(validKlines, 60);
  const closes1h = agg1h.map((c) => c.close);
  if (closes1h.length >= RSI_PERIOD + 1) {
    rsi1h = calculateRsi(closes1h, RSI_PERIOD);
  }

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
  const signal = deriveSignal(rsi15m ?? rsi5m ?? rsi1m);

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
  });

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
    updatedAt: nowTs,
  };
  } catch (err) {
    console.warn(`[screener] buildEntry failed for ${sym}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const refreshInFlight = new Map<number, Promise<ScreenerResponse>>();

function runRefresh(symbolCount: number): Promise<ScreenerResponse> {
  const existing = refreshInFlight.get(symbolCount);
  if (existing) return existing;

  const work = (async (): Promise<ScreenerResponse> => {
    const start = Date.now();
    const nowTs = Date.now();

    // 1. Get top symbols + ticker data in parallel
    const [symbols, tickers] = await Promise.all([
      getTopSymbols(symbolCount),
      fetchTickersSafe(),
    ]);

    // 2. Fetch klines only for symbols with stale/missing indicator cache
    const staleBefore = nowTs - INDICATOR_CACHE_TTL;
    let symbolsToRefresh = symbols.filter((sym) => {
      const cached = indicatorCache.get(sym);
      return !cached || cached.ts < staleBefore;
    });

    // Rolling refresh: cap kline fetches per cycle.
    // Prioritise uncached (new) symbols, then oldest cached.
    if (symbolsToRefresh.length > MAX_KLINE_FETCH) {
      symbolsToRefresh.sort((a, b) => {
        const ta = indicatorCache.get(a)?.ts ?? 0;
        const tb = indicatorCache.get(b)?.ts ?? 0;
        return ta - tb; // oldest first
      });
      symbolsToRefresh = symbolsToRefresh.slice(0, MAX_KLINE_FETCH);
    }

    const klines1mResults = symbolsToRefresh.length > 0
      ? await fetchKlinesBatched(symbolsToRefresh, fetchKlines)
      : [];

    const klineResultBySymbol = new Map<string, PromiseSettledResult<BinanceKline[]>>();
    let failedCount = 0;
    for (let i = 0; i < symbolsToRefresh.length; i++) {
      const result = klines1mResults[i];
      klineResultBySymbol.set(symbolsToRefresh[i], result);
      if (result.status === 'rejected') failedCount++;
    }
    if (failedCount > 0) {
      console.warn(`[screener] ${failedCount}/${symbolsToRefresh.length} kline fetches failed`);
    }

    // 3. Process each symbol
    const entries: ScreenerEntry[] = [];

    for (const sym of symbols) {
      const ticker = tickers.get(sym);
      const refreshResult = klineResultBySymbol.get(sym);

      if (refreshResult?.status === 'fulfilled') {
        const freshEntry = buildEntryFromKlines(sym, refreshResult.value, ticker, nowTs);
        if (freshEntry) {
          entries.push(freshEntry);
          indicatorCache.set(sym, { entry: freshEntry, ts: nowTs });
          continue;
        }
      }

      const cached = indicatorCache.get(sym);
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

    const computeTimeMs = Date.now() - start;
    const response: ScreenerResponse = {
      data: entries,
      meta: buildMeta(entries, computeTimeMs),
    };

    // Cache the result if there is useful data; keep stale cache on total outage.
    if (response.data.length > 0) {
      resultCache = { data: response, count: symbolCount, ts: Date.now() };
      return response;
    }

    const stale = fromCachedResult(symbolCount);
    if (stale) return stale;

    return response;
  })()
    .catch(() => {
      const stale = fromCachedResult(symbolCount);
      if (stale) return stale;
      return {
        data: [],
        meta: buildMeta([], 0),
      };
    })
    .finally(() => {
      refreshInFlight.delete(symbolCount);
    });

  refreshInFlight.set(symbolCount, work);
  return work;
}

/**
 * Main screener function: fetch data, compute all indicators, return results.
 * Supports 500+ coins via batched parallel fetching.
 */
export async function getScreenerData(symbolCount = 100): Promise<ScreenerResponse> {
  // Return cached result if fresh enough and same count.
  const resultCacheTtl = getResultCacheTtl(symbolCount);
  if (resultCache && resultCache.count >= symbolCount && Date.now() - resultCache.ts < resultCacheTtl) {
    if (resultCache.count === symbolCount) return resultCache.data;
    const cached = fromCachedResult(symbolCount);
    if (cached) return cached;
  }

  // Stale-first: always return cached snapshot instantly.
  // WebSocket keeps prices live between indicator refreshes.
  const stale = fromCachedResult(symbolCount);
  if (stale) {
    void runRefresh(symbolCount);
    return stale;
  }

  // No usable stale snapshot available; compute (deduplicated by symbolCount).
  return runRefresh(symbolCount);
}
