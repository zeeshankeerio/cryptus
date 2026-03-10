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
] as const;
const RSI_PERIOD = 14;
const KLINE_LIMIT = 1000; // 1000 1m candles → ~66 15m candles (MACD needs 35, StochRSI needs 34)
const KLINE_1H_LIMIT = 100; // for 1h RSI
const BATCH_SIZE = 50; // parallel kline fetches per batch (conservative for Binance rate limits)
const BATCH_DELAY_MS = 300; // delay between batches to stay within rate limits
const FETCH_RETRY_COUNT = 2; // retry failed kline fetches

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
const RESULT_CACHE_TTL = 12_000; // 12 seconds (shorter than typical 15s refresh)

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
        signal: AbortSignal.timeout(8000),
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
      .filter((t) => t.symbol.endsWith('USDT'))
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
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000) });
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

/**
 * Fetch 1h klines for a single symbol.
 */
async function fetchKlines1h(symbol: string): Promise<BinanceKline[]> {
  const path = `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=${KLINE_1H_LIMIT}`;
  return fetchWithRetry(path, `Klines1h ${symbol}`);
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

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(fetcher));
    results.push(...batchResults);
    // Delay between batches to respect Binance rate limits
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
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

/**
 * Main screener function: fetch data, compute all indicators, return results.
 * Supports 500+ coins via batched parallel fetching.
 */
export async function getScreenerData(symbolCount = 100): Promise<ScreenerResponse> {
  // Return cached result if fresh enough and same count
  if (resultCache && resultCache.count >= symbolCount && Date.now() - resultCache.ts < RESULT_CACHE_TTL) {
    if (resultCache.count === symbolCount) return resultCache.data;
    const cached = fromCachedResult(symbolCount);
    if (cached) return cached;
  }

  try {
    const start = Date.now();

    // 1. Get top symbols + ticker data in parallel
    const [symbols, tickers] = await Promise.all([
      getTopSymbols(symbolCount),
      fetchTickersSafe(),
    ]);

    // 2. Fetch 1m + 1h klines in batched parallel
    const [klines1mResults, klines1hResults] = await Promise.all([
      fetchKlinesBatched(symbols, fetchKlines),
      fetchKlinesBatched(symbols, fetchKlines1h),
    ]);

    // 3. Process each symbol
    const entries: ScreenerEntry[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const result1m = klines1mResults[i];
      const result1h = klines1hResults[i];

      if (result1m.status !== 'fulfilled') continue;

      const klines = result1m.value;
      if (klines.length < RSI_PERIOD + 2) continue;

      const closes1m = klines.map((k) => parseFloat(k[4]));
      const highs1m = klines.map((k) => parseFloat(k[2]));
      const lows1m = klines.map((k) => parseFloat(k[3]));
      const volumes1m = klines.map((k) => parseFloat(k[5]));

    // ── RSI (original, kept) ──
      const rsi1m = calculateRsi(closes1m, RSI_PERIOD);

      const agg5m = aggregateKlines(klines, 5);
      const closes5m = agg5m.map((c) => c.close);
      const rsi5m = closes5m.length >= RSI_PERIOD + 1
        ? calculateRsi(closes5m, RSI_PERIOD)
        : null;

      const agg15m = aggregateKlines(klines, 15);
      const closes15m = agg15m.map((c) => c.close);
      const rsi15m = closes15m.length >= RSI_PERIOD + 1
        ? calculateRsi(closes15m, RSI_PERIOD)
        : null;

    // ── RSI 1h (new) ──
      let rsi1h: number | null = null;
      if (result1h.status === 'fulfilled' && result1h.value.length >= RSI_PERIOD + 1) {
        const closes1h = result1h.value.map((k) => parseFloat(k[4]));
        rsi1h = calculateRsi(closes1h, RSI_PERIOD);
      }

    // ── EMA 9/21 on 15m closes (new) ──
      const ema9 = latestEma(closes15m, 9);
      const ema21 = latestEma(closes15m, 21);
      const emaCross = detectEmaCross(closes15m, 9, 21);

    // ── MACD on 15m closes (new) ──
      const macd = calculateMacd(closes15m);

    // ── Bollinger Bands on 15m closes (new) ──
      const bb = calculateBollinger(closes15m);

    // ── Stochastic RSI on 15m closes (new) ──
      const stochRsi = calculateStochRsi(closes15m);

    // ── VWAP on 1m data (daily reset at UTC midnight) ──
      const todayUtcMs = new Date().setUTCHours(0, 0, 0, 0);
      let vwapStart = 0;
      for (let j = 0; j < klines.length; j++) {
        if (klines[j][0] >= todayUtcMs) { vwapStart = j; break; }
      }
      const vwap = calculateVwap(
        highs1m.slice(vwapStart), lows1m.slice(vwapStart),
        closes1m.slice(vwapStart), volumes1m.slice(vwapStart),
      );
      const price = closes1m[closes1m.length - 1];
      const vwapDiff = vwap !== null && vwap > 0
        ? Math.round(((price - vwap) / vwap) * 10000) / 100
        : null;

    // ── Volume spike (new) ──
      const volumeSpike = detectVolumeSpike(volumes1m);

    // ── Original signal (kept) ──
      const signal = deriveSignal(rsi15m ?? rsi5m ?? rsi1m);

    // ── Composite strategy score ──
      const strategy = computeStrategyScore({
        rsi1m, rsi5m, rsi15m, rsi1h,
        macdHistogram: macd?.histogram ?? null,
        bbPosition: bb?.position ?? null,
        stochK: stochRsi?.k ?? null,
        stochD: stochRsi?.d ?? null,
        emaCross,
        vwapDiff,
        volumeSpike,
        price,
      });

      const ticker = tickers.get(sym);

      entries.push({
        symbol: sym,
        price,
        change24h: ticker ? parseFloat(ticker.priceChangePercent) : 0,
        volume24h: ticker ? parseFloat(ticker.quoteVolume) : 0,
        // Original
        rsi1m,
        rsi5m,
        rsi15m,
        signal,
        // New
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
        updatedAt: Date.now(),
      });
    }

    const computeTimeMs = Date.now() - start;

    const response: ScreenerResponse = {
      data: entries,
      meta: buildMeta(entries, computeTimeMs),
    };

    // Cache the result if there is useful data; keep stale cache on total outage.
    if (response.data.length > 0) {
      resultCache = { data: response, count: symbolCount, ts: Date.now() };
    }

    // If this run produced zero rows but we have a stale cache, return stale cache instead.
    if (response.data.length === 0) {
      const stale = fromCachedResult(symbolCount);
      if (stale) return stale;
    }

    return response;
  } catch {
    const stale = fromCachedResult(symbolCount);
    if (stale) return stale;
    return {
      data: [],
      meta: buildMeta([], 0),
    };
  }
}
