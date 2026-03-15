import { calculateRsi, calculateRsiWithState } from './rsi';
import {
  latestEma, detectEmaCross, calculateMacd, calculateEma,
  calculateBollinger, calculateStochRsi, calculateVwap,
  detectVolumeSpike, computeStrategyScore,
  detectRsiDivergence, calculateROC, calculateConfluence,
  calculateATR, calculateADX,
} from './indicators';
import type { ScreenerEntry, ScreenerResponse, BinanceTicker, BinanceKline } from './types';
import { getAllCoinConfigs, type CoinConfig } from './coin-config';
import { getSymbolAlias } from './symbol-utils';

interface ScreenerOptions {
  smartMode?: boolean;
  rsiPeriod?: number;
  search?: string;
  prioritySymbols?: string[]; // Viewport symbols to prioritise
  exchange?: string;
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
const KLINE_LIMIT = 499; // 499 candles (Weight=1 on Binance, saves 50% API limit vs 1000) - enough for 15m divergence (499/15 = 33)
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
const symbolCache = new Map<string, { data: string[]; ts: number }>();
const SYMBOL_CACHE_TTL = 3600_000; // 1 hour

// ── Fallback symbols in case Binance API is unreachable ──
const FALLBACK_SYMBOLS = [
  'SPX', 'NDAQ', 'SILVER', 'PAXGUSDT', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
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

// ── Multi-Market definitions ──
const BINANCE_NATIVE_SPECIAL = ['PAXGUSDT', 'EURUSDT', 'GBPUSDT', 'AUDUSDT', 'JPYUSDT'];
const YAHOO_MARKET_MAP: Record<string, string> = {
  'SPX': '^GSPC',    // S&P 500
  'NDAQ': '^IXIC',   // NASDAQ
  'DOW': '^DJI',    // Dow Jones
  'SILVER': 'XAGUSD=X',
  'FTSE': '^FTSE',
  'DAX': '^GDAXI',
  'NKY': '^N225',    // Nikkei 225
};
const YAHOO_SYMBOLS = Object.keys(YAHOO_MARKET_MAP);

function getMarketType(symbol: string): ScreenerEntry['market'] {
  if (symbol === 'PAXGUSDT' || symbol === 'SILVER') return 'Metal';
  if (['SPX', 'NDAQ', 'DOW', 'FTSE', 'DAX', 'NKY'].includes(symbol)) return 'Index';
  if (['EURUSDT', 'GBPUSDT', 'AUDUSDT', 'JPYUSDT'].includes(symbol)) return 'Forex';
  return 'Crypto';
}


// ── Ticker cache for price + change data ──
const tickerCache = new Map<string, { data: Map<string, BinanceTicker>; ts: number }>();
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

function makeCacheKey(symbolCount: number, smartMode: boolean, rsiPeriod: number, exchange: string = 'binance'): string {
  return `${symbolCount}:${smartMode ? 'smart' : 'classic'}:rsi${rsiPeriod}:${exchange}`;
}

function getTrafficWarmCandidates(symbolCount: number): number[] {
  if (symbolCount <= 100) return [300, 500];
  if (symbolCount <= 300) return [500, 100];
  return [300, 100];
}

function maybeTrafficWarm(symbolCount: number, smartMode: boolean, exchange: string = 'binance', rsiPeriod: number = 14): void {
  if (process.env.TRAFFIC_WARM_DISABLED === '1') return;

  const key = smartMode ? 'smart' : 'classic';
  const now = Date.now();
  const lastRun = trafficWarmLastRun.get(key) ?? 0;
  if (now - lastRun < TRAFFIC_WARM_COOLDOWN_MS) return;

  const candidates = getTrafficWarmCandidates(symbolCount);
  for (const candidate of candidates) {
    if (candidate === symbolCount) continue;
    const cache = resultCache.get(makeCacheKey(candidate, smartMode, rsiPeriod, exchange));
    const ttl = getResultCacheTtl(candidate);
    const fresh = cache && now - cache.ts < ttl;
    if (fresh) continue;

    trafficWarmLastRun.set(key, now);
    debugLog(`[screener] traffic-warm trigger: request=${symbolCount}, warming=${candidate}, smart=${smartMode}, exchange=${exchange}`);
    void runRefresh(candidate, smartMode, rsiPeriod, undefined, [], exchange);
    break;
  }
}

// ── Per-symbol indicator cache to avoid refetch/recompute on every refresh ──
const indicatorCache = new Map<string, { entry: ScreenerEntry; ts: number }>();
const INDICATOR_CACHE_TTL = 120_000; // 2 min — standard symbols
const INDICATOR_CACHE_TTL_ALERT = 60_000; // 1 min — alert-active symbols (tighter accuracy)
const INDICATOR_CACHE_MAX = 5000;

/**
 * Force-evict a specific symbol from all caches.
 * Used when a user updates their specific coin configuration.
 */
export function invalidateSymbolCache(symbol: string) {
  // 1. Remove from indicator cache for any combination of cache keys
  const prefix = `${symbol}:`;
  for (const key of indicatorCache.keys()) {
    if (key.startsWith(prefix)) {
      indicatorCache.delete(key);
    }
  }

  // 2. Clear aggregate result cache so the next master fetch computes fresh
  resultCache.clear();
  
  debugLog(`[screener] Cache invalidated for ${symbol}`);
}

/**
 * Clear all caches scoped to a specific exchange.
 * Used on exchange switch to ensure fresh data from the new exchange.
 */
export function invalidateExchangeCache(exchange: string) {
  // 1. Remove indicator cache entries for this exchange
  for (const key of indicatorCache.keys()) {
    if (key.endsWith(`:${exchange}`)) {
      indicatorCache.delete(key);
    }
  }

  // 2. Clear result cache entries for this exchange
  for (const key of resultCache.keys()) {
    if (key.endsWith(`:${exchange}`)) {
      resultCache.delete(key);
    }
  }

  // 3. Clear ticker cache for this exchange
  tickerCache.delete(exchange);

  // 4. Clear symbol cache for this exchange
  symbolCache.delete(exchange);

  debugLog(`[screener] Exchange cache invalidated for ${exchange}`);
}

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
    momentum: null, atr: null, adx: null, rsiState1m: null,
    rsiState5m: null, rsiState15m: null, rsiState1h: null,
    ema9State: null, ema21State: null, macdFastState: null,
    macdSlowState: null, macdSignalState: null,
    rsiCustom: null, rsiStateCustom: null,
    rsiPeriodAtCreation: 14,
    signalStartedAt: nowTs,
    updatedAt: nowTs,
    market: 'Crypto',
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

function fromCachedResult(symbolCount: number, smartMode: boolean, rsiPeriod: number, exchange: string = 'binance'): ScreenerResponse | null {
  const cache = resultCache.get(makeCacheKey(symbolCount, smartMode, rsiPeriod, exchange));
  if (!cache) {
    // Partial match: find any cached result for this exchange/mode/period and slice it
    for (const [key, val] of resultCache.entries()) {
      if (key.includes(`:${smartMode ? 'smart' : 'classic'}:rsi${rsiPeriod}:${exchange}`) && val.data.data.length > 0) {
        const sliced = val.data.data.slice(0, symbolCount);
        return {
          ...val.data,
          data: sliced,
          meta: buildMeta(sliced, val.data.meta.computeTimeMs, val.data.meta.fetchedAt, smartMode, val.data.meta.refreshCap),
        };
      }
    }
    return null;
  }

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

interface BybitTickerResponse {
  retCode: number;
  result: {
    list: {
      symbol: string;
      lastPrice: string;
      price24hPcnt: string;
      turnover24h: string;
    }[];
  };
}

async function fetchBybitTickers(exchange: string): Promise<Map<string, BinanceTicker>> {
  // 'bybit' = spot, 'bybit-linear' = linear (perpetual)
  const category = exchange === 'bybit-linear' ? 'linear' : 'spot';
  const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`, {
    signal: AbortSignal.timeout(12000),
    cache: 'no-store' as RequestCache,
  });
  if (!res.ok) throw new Error(`Bybit ticker API ${res.status}`);

  const payload = await res.json() as BybitTickerResponse;
  const rows = payload.result?.list ?? [];
  const map = new Map<string, BinanceTicker>();

  for (const row of rows) {
    if (!row.symbol.endsWith('USDT')) continue;
    const changePct = Number.isFinite(parseFloat(row.price24hPcnt))
      ? (parseFloat(row.price24hPcnt) * 100).toString()
      : '0';

    map.set(row.symbol, {
      symbol: row.symbol,
      lastPrice: row.lastPrice,
      priceChangePercent: changePct,
      quoteVolume: row.turnover24h,
    });
  }

  return map;
}

/**
 * Fetch 24hr tickers from Binance or Bybit. Returns Map<symbol, ticker>.
 */
async function fetchTickers(exchange: string = 'binance'): Promise<Map<string, BinanceTicker>> {
  const cached = tickerCache.get(exchange);
  if (cached && Date.now() - cached.ts < TICKER_CACHE_TTL) {
    return cached.data;
  }

  if (exchange.startsWith('bybit')) {
    const map = await fetchBybitTickers(exchange);
    tickerCache.set(exchange, { data: map, ts: Date.now() });
    return map;
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

      tickerCache.set(exchange, { data: map, ts: Date.now() });
      return map;
    } catch (err) {
      lastError = err;
    }
  }

  // Free-source fallback: KuCoin public market tickers
  // IMPORTANT: Cache under 'kucoin-fallback' key, NOT the original exchange key,
  // to prevent misattributing KuCoin prices as Binance data.
  try {
    const map = await fetchKucoinTickers();
    if (map.size > 0) {
      tickerCache.set('kucoin-fallback', { data: map, ts: Date.now() });
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
/**
 * Search all available Binance + Yahoo symbols for a match.
 * Returns up to 50 matches.
 */
async function searchSymbols(query: string, exchange: string = 'binance'): Promise<string[]> {
  const q = query.toUpperCase();
  const tickers = await fetchTickers(exchange);
  const matches: string[] = [];

  // Search Yahoo Indices first (Binance only)
  if (exchange === 'binance') {
    for (const s of YAHOO_SYMBOLS) {
      const alias = getSymbolAlias(s).toUpperCase();
      if (s.includes(q) || alias.includes(q)) {
        matches.push(s);
      }
    }
  }

  // Search Binance Tickers
  for (const [s, t] of tickers.entries()) {
    const alias = getSymbolAlias(s).toUpperCase();
    if (s.includes(q) || alias.includes(q)) {
      matches.push(s);
    }
    if (matches.length >= 50) break;
  }

  return [...new Set(matches)];
}

async function getTopSymbols(count: number, exchange: string = 'binance'): Promise<string[]> {
  const cached = symbolCache.get(exchange);
  if (cached && Date.now() - cached.ts < SYMBOL_CACHE_TTL) {
    return cached.data.slice(0, count);
  }

  try {
    const tickers = await fetchTickers(exchange);
    const usdtPairs = [...tickers.values()]
      .filter((t) => {
        // Always include forced symbols (Gold, Forex) ONLY for Binance
        if (exchange === 'binance' && BINANCE_NATIVE_SPECIAL.includes(t.symbol)) return true;
        
        if (!t.symbol.endsWith('USDT')) return false;
        // Exclude leverage tokens, stablecoins, wrapped/pegged tokens, and fiat pairs
        const base = t.symbol.slice(0, -4);
        
        // Smart filter: keep PAXG and major Forex, exclude junk
        if (/^(USDC|BUSD|TUSD|DAI|FDUSD|USDP|USDD|PYUSD|USD1|WBTC|WBETH|BFUSD|EUR|GBP|AUD|BRL|TRY|BIDR|IDRT|UAH|NGN|PLN|RON|ARS|CZK)$/.test(base)) {
           // Allow if it's explicitly in our SPECIAL list (Binance only)
           if (exchange !== 'binance' || !BINANCE_NATIVE_SPECIAL.includes(t.symbol)) return false;
        }

        if (/UP$|DOWN$|BEAR$|BULL$/.test(base)) return false;
        const vol = parseFloat(t.quoteVolume);
        return Number.isFinite(vol) && vol > 0;
      })
      .sort((a, b) => {
        // Prioritize special assets so they always make the cut (Binance only)
        if (exchange === 'binance') {
          const specA = BINANCE_NATIVE_SPECIAL.includes(a.symbol) ? 1 : 0;
          const specB = BINANCE_NATIVE_SPECIAL.includes(b.symbol) ? 1 : 0;
          if (specA !== specB) return specB - specA;
        }
        return parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume);
      })
    // Map back to strings
    const sortedBinance = usdtPairs.map((t) => t.symbol);

    // Final merge: Yahoo symbols + Binance Specials first (Binance only), then the rest of sortedBinance
    const finalSymbols = exchange === 'binance' 
      ? [...new Set([...YAHOO_SYMBOLS, ...BINANCE_NATIVE_SPECIAL, ...sortedBinance])]
      : sortedBinance;
    
    symbolCache.set(exchange, { data: finalSymbols, ts: Date.now() });
    return finalSymbols.slice(0, count);
  } catch {
    const list = exchange === 'binance' 
      ? FALLBACK_SYMBOLS 
      : FALLBACK_SYMBOLS.filter(s => !YAHOO_SYMBOLS.includes(s) && !BINANCE_NATIVE_SPECIAL.includes(s));
    return list.slice(0, count);
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
 * Yahoo Finance kline adapter for Global Indices.
 * Maps Yahoo JSON structure to standard BinanceKline format.
 */
async function fetchYahooKlines(symbol: string, interval: string = '1m'): Promise<BinanceKline[]> {
  const yahooSym = YAHOO_MARKET_MAP[symbol] || symbol;
  // interval mapping: 1m -> 1m, 1h -> 1h
  const range = interval === '1h' ? '5d' : '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    const json = await res.json();
    const result = json.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;

    // Filter out bars with null close to prevent NaN in RSI calculations
    const klines: BinanceKline[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close[i];
      if (close == null || !Number.isFinite(close)) continue; // Skip incomplete candles

      const open = quote.open[i] ?? close;
      const high = quote.high[i] ?? close;
      const low = quote.low[i] ?? close;
      const volume = quote.volume[i] ?? 0;
      const ts = timestamps[i];

      klines.push([
        ts * 1000,
        open.toString(),
        high.toString(),
        low.toString(),
        close.toString(),
        volume.toString(),
        (ts * 1000) + 59999,
        "0", 0, "0", "0", "0"
      ] as BinanceKline);
    }
    return klines;
  } catch (err) {
    debugWarn(`[yahoo] fetch failed for ${symbol}:`, err);
    return [];
  }
}

interface BybitKlineResponse {
  retCode: number;
  result: {
    list: string[][];
  };
}

async function fetchBybitKlines(symbol: string, interval: string, exchange: string): Promise<BinanceKline[]> {
  try {
    const limit = interval === '60' ? KLINE_LIMIT_1H : KLINE_LIMIT;
    // 'bybit' = spot, 'bybit-linear' = linear (perpetual)
    const category = exchange === 'bybit-linear' ? 'linear' : 'spot';
    const res = await fetch(`https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}&limit=${limit}`, {
      signal: AbortSignal.timeout(KLINE_TIMEOUT_MS),
      cache: 'no-store' as RequestCache,
    });
    if (!res.ok) throw new Error(`Bybit kline API ${res.status}`);
    const payload = await res.json() as BybitKlineResponse;
    const rows = payload.result?.list ?? [];

    // Bybit returns newest first, reverse to match Binance (oldest first)
    rows.reverse();

    return rows.map((row) => {
      const ts = parseInt(row[0], 10);
      return [
        ts,
        row[1], // open
        row[2], // high
        row[3], // low
        row[4], // close
        row[5], // volume
        ts + (interval === '60' ? 3600000 : 60000) - 1, // closeTime
        row[6], // turnover
        0, "0", "0", "0"
      ] as BinanceKline;
    });
  } catch (err) {
    debugWarn(`[bybit] kline fetch failed for ${symbol}:`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Fetch 1m klines for a single symbol.
 */
async function fetchKlines(symbol: string, exchange: string = 'binance'): Promise<BinanceKline[]> {
  if (YAHOO_SYMBOLS.includes(symbol)) {
    return fetchYahooKlines(symbol, '1m');
  }
  if (exchange.startsWith('bybit')) {
    return fetchBybitKlines(symbol, '1', exchange);
  }
  return fetchWithRetry(`/api/v3/klines?symbol=${symbol}&interval=1m&limit=${KLINE_LIMIT}`, `1m candle for ${symbol}`);
}

/**
 * Fetch 1h klines for a single symbol.
 */
async function fetchKlines1h(symbol: string, exchange: string = 'binance'): Promise<BinanceKline[]> {
  if (YAHOO_SYMBOLS.includes(symbol)) {
    return fetchYahooKlines(symbol, '1h');
  }
  if (exchange.startsWith('bybit')) {
    return fetchBybitKlines(symbol, '60', exchange);
  }
  return fetchWithRetry(`/api/v3/klines?symbol=${symbol}&interval=1h&limit=${KLINE_LIMIT_1H}`, `1h candle for ${symbol}`);
}

async function fetchTickersSafe(exchange: string = 'binance'): Promise<Map<string, BinanceTicker>> {
  try {
    return await fetchTickers(exchange);
  } catch {
    return tickerCache.get(exchange)?.data ?? new Map<string, BinanceTicker>();
  }
}

/**
 * Fetch both 1m and 1h klines in a single concurrent pass per symbol.
 */
async function fetchAllKlinesBatched(
  symbols: string[],
  exchange: string = 'binance'
): Promise<{ sym: string; res1m: PromiseSettledResult<BinanceKline[]>; res1h: PromiseSettledResult<BinanceKline[]> }[]> {
  const results = new Array<{ sym: string; res1m: PromiseSettledResult<BinanceKline[]>; res1h: PromiseSettledResult<BinanceKline[]> }>(symbols.length);
  // Greatly reduced concurrency for stability on Vercel/Cloud functions to avoid 429 Too Many Requests
  const concurrency = Math.min(15, Math.max(4, Math.floor(symbols.length / 10)));

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= symbols.length) return;
      const sym = symbols[idx];

      // Fetch both in parallel for this symbol
      const [res1m, res1h] = await Promise.allSettled([
        fetchKlines(sym, exchange),
        fetchKlines1h(sym, exchange)
      ]);

      // Adaptive stagger to avoid slamming all API end-points at exactly the same microsecond
      if (symbols.length > 100) {
        // More aggressive stagger for larger sets to smooth out the request curve
        await new Promise(r => setTimeout(r, Math.random() * 100));
      }

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

/**
 * Derive signal from RSI value and thresholds.
 * Supports contrarian (inverted) mode where overbought < oversold (e.g., OB=30, OS=70).
 */
function deriveSignal(
  rsi: number | null,
  overbought: number = 70,
  oversold: number = 30
): ScreenerEntry['signal'] {
  if (rsi === null) return 'neutral';
  
  const isInverted = overbought < oversold;
  if (isInverted) {
    // Contrarian: OB=30, OS=70 → oversold when RSI ≥ 70, overbought when RSI ≤ 30
    if (rsi >= oversold) return 'oversold';
    if (rsi <= overbought) return 'overbought';
  } else {
    // Standard: OB=70, OS=30 → oversold when RSI < 30, overbought when RSI > 70
    if (rsi < oversold) return 'oversold';
    if (rsi > overbought) return 'overbought';
  }
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
  config?: CoinConfig,
): ScreenerEntry | null {
  try {
    const validKlines = klines1m.filter((k) => k !== null && k.length >= 6);
    if (validKlines.length < rsiPeriod + 1) return null;

    const closes1m = validKlines.map((k) => parseFloat(k[4]));
    const highs1m = validKlines.map((k) => parseFloat(k[2]));
    const lows1m = validKlines.map((k) => parseFloat(k[3]));
    const volumes1m = validKlines.map((k) => parseFloat(k[5]));

    const stdPeriod = 14;
    const r1mP = config?.rsi1mPeriod ?? stdPeriod;
    const r5mP = config?.rsi5mPeriod ?? stdPeriod;
    const r15mP = config?.rsi15mPeriod ?? stdPeriod;
    const r1hP = config?.rsi1hPeriod ?? stdPeriod;

    const rsi1m = calculateRsi(closes1m, r1mP);

    const aggCache = new Map<number, any[]>();
    const agg5m = aggregateKlines(validKlines, 5, aggCache);
    const closes5m = agg5m.map((c) => c.close);
    const rsi5m = closes5m.length >= r5mP + 1 ? calculateRsi(closes5m, r5mP) : null;

    const agg15m = aggregateKlines(validKlines, 15, aggCache);
    const closes15m = agg15m.map((c) => c.close);
    const highs15m = agg15m.map((c) => c.high);
    const lows15m = agg15m.map((c) => c.low);
    const rsi15m = closes15m.length >= r15mP + 1 ? calculateRsi(closes15m, r15mP) : null;

    let rsi1h: number | null = null;
    let closes1h: number[] = [];
    if (klines1h && klines1h.length >= r1hP + 1) {
      closes1h = klines1h.map((k) => parseFloat(k[4]));
      rsi1h = calculateRsi(closes1h, r1hP);
    } else {
      const agg1h = aggregateKlines(validKlines, 60, aggCache);
      closes1h = agg1h.map((c) => c.close);
      if (closes1h.length >= r1hP + 1) {
        rsi1h = calculateRsi(closes1h, r1hP);
      }
    }

    // Dynamic/Custom RSI (User Defined Period)
    const rsiCustom = calculateRsi(closes15m, rsiPeriod);
    const rsiStateCustom = calculateRsiWithState(closes15m, rsiPeriod);

    const ema9Val = latestEma(closes15m, 9);
    const ema21Val = latestEma(closes15m, 21);
    const emaCross = detectEmaCross(closes15m, 9, 21);
    
    // MACD states (12, 26, 9)
    const ema12Arr = calculateEma(closes15m, 12);
    const ema26Arr = calculateEma(closes15m, 26);
    const ema12 = ema12Arr.length > 0 ? ema12Arr[ema12Arr.length - 1] : null;
    const ema26 = ema26Arr.length > 0 ? ema26Arr[ema26Arr.length - 1] : null;
    
    let macdLineVal: number | null = null;
    let macdSignalVal: number | null = null;
    let macdHistogramVal: number | null = null;
    let macdSignalState: { ema: number } | null = null;

    if (ema12 !== null && ema26 !== null) {
      const offset = ema12Arr.length - ema26Arr.length;
      const macdLineArr: number[] = [];
      for (let i = 0; i < ema26Arr.length; i++) {
        macdLineArr.push(ema12Arr[i + offset] - ema26Arr[i]);
      }
      const signalArr = calculateEma(macdLineArr, 9);
      if (signalArr.length > 0) {
        macdLineVal = macdLineArr[macdLineArr.length - 1];
        macdSignalVal = signalArr[signalArr.length - 1];
        if (macdLineVal !== null && macdSignalVal !== null) {
          macdHistogramVal = macdLineVal - macdSignalVal;
          macdSignalState = { ema: macdSignalVal };
        }
      }
    }

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
    
    // Signals use custom thresholds if provided, else standard 70/30
    const signal = deriveSignal(rsi15m ?? rsi1m, config?.overboughtThreshold, config?.oversoldThreshold);
    const stdRsiDivergence = detectRsiDivergence(closes15m, r15mP, 40);

    // Intelligence indicators (Using coin-specific periods)
    const rsiState1m = calculateRsiWithState(closes1m, r1mP);
    const rsiState5m = calculateRsiWithState(closes5m, r5mP);
    const rsiState15m = calculateRsiWithState(closes15m, r15mP);
    const rsiState1h = closes1h.length >= r1hP + 1 ? calculateRsiWithState(closes1h, r1hP) : null;

    const momentum = calculateROC(closes15m, 10);

    // ATR & ADX (15m timeframe) — pro volatility + trend strength
    const atr = calculateATR(highs15m, lows15m, closes15m);
    const adx = calculateADX(highs15m, lows15m, closes15m);

    const confluenceResult = calculateConfluence({
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: macdHistogramVal,
      emaCross,
      stochK: stochRsi?.k ?? null,
      bbPosition: bb?.position ?? null,
    });

    const strategy = computeStrategyScore({
      rsi1m,
      rsi5m,
      rsi15m,
      rsi1h,
      macdHistogram: macdHistogramVal,
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
      ema9: ema9Val,
      ema21: ema21Val,
      emaCross,
      macdLine: macdLineVal,
      macdSignal: macdSignalVal,
      macdHistogram: macdHistogramVal,
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
      rsiDivergence: stdRsiDivergence,
      rsiDivergenceCustom: customDivergence,
      momentum,
      atr,
      adx,
      rsiState1m,
      rsiState5m,
      rsiState15m,
      rsiState1h,
      ema9State: ema9Val !== null ? { ema: ema9Val } : null,
      ema21State: ema21Val !== null ? { ema: ema21Val } : null,
      macdFastState: ema12 !== null ? { ema: ema12 } : null,
      macdSlowState: ema26 !== null ? { ema: ema26 } : null,
      macdSignalState,
      rsiCustom,
      rsiStateCustom,
      rsiPeriodAtCreation: rsiPeriod,
      signalStartedAt,
      updatedAt: nowTs,
      market: getMarketType(sym),
    };
  } catch (err) {
    debugWarn(`[screener] buildEntry failed for ${sym}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const refreshInFlight = new Map<string, Promise<ScreenerResponse>>();

function runRefresh(
  symbolCount: number,
  smartMode: boolean,
  rsiPeriod: number = 14,
  search?: string,
  prioritySymbols: string[] = [],
  exchange: string = 'binance'
): Promise<ScreenerResponse> {
  const inflightKey = `${makeCacheKey(symbolCount, smartMode, rsiPeriod, exchange)}:${search || ''}:${prioritySymbols.join(',')}`;
  const existing = refreshInFlight.get(inflightKey);
  if (existing) return existing;

  const work = (async (): Promise<ScreenerResponse> => {
    const start = Date.now();
    const nowTs = Date.now();
    debugLog(`[screener] runRefresh(${symbolCount}, smart=${smartMode}, exchange=${exchange}) starting...`);

    // 1. Get top symbols + ticker data + custom configs in parallel
    const [topSymbols, searchMatches, tickers, coinConfigs] = await Promise.all([
      getTopSymbols(symbolCount, exchange),
      search ? searchSymbols(search, exchange) : Promise.resolve([]),
      fetchTickersSafe(exchange),
      getAllCoinConfigs(),
    ]);

    // Merge: search matches first, then top symbols (uniquely)
    const symbols = [...new Set([...searchMatches, ...topSymbols])];

    // 2. Fetch klines only for symbols with stale/missing indicator cache
    // Alert-active symbols use a shorter TTL for more accurate RSI state refresh
    const uncachedSymbols = symbols.filter((sym) => !indicatorCache.has(`${sym}:${rsiPeriod}:${exchange}`));
    let symbolsToRefresh = symbols.filter((sym) => {
      const cached = indicatorCache.get(`${sym}:${rsiPeriod}:${exchange}`);
      if (!cached) return true;
      const cfg = coinConfigs.get(sym);
      const hasAlerts = cfg && (cfg.alertOn1m || cfg.alertOn5m || cfg.alertOn15m || cfg.alertOn1h || cfg.alertOnCustom || cfg.alertOnStrategyShift);
      const ttl = hasAlerts ? INDICATOR_CACHE_TTL_ALERT : INDICATOR_CACHE_TTL;
      return cached.ts < nowTs - ttl;
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
        // 0. Strict priority for Viewport symbols (Ensure the user sees live data first)
        const aPriority = prioritySymbols.includes(a) ? 1 : 0;
        const bPriority = prioritySymbols.includes(b) ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;

        // 1. Strict priority for search matches
        const aSearch = search?.toUpperCase().includes(a) || searchMatches.includes(a) ? 1 : 0;
        const bSearch = search?.toUpperCase().includes(b) || searchMatches.includes(b) ? 1 : 0;
        if (aSearch !== bSearch) return bSearch - aSearch;

        // 2. Volatility Boost (Prioritise coins that are actually moving)
        const tickA = tickers.get(a);
        const tickB = tickers.get(b);
        const volA = Math.abs(parseFloat(tickA?.priceChangePercent || '0'));
        const volB = Math.abs(parseFloat(tickB?.priceChangePercent || '0'));
        if (Math.abs(volA - volB) > 2) return volB - volA;

        // 3. Gap Fill priority (Uncached symbols)
        const aCached = indicatorCache.has(`${a}:${rsiPeriod}:${exchange}`);
        const bCached = indicatorCache.has(`${b}:${rsiPeriod}:${exchange}`);
        if (aCached !== bCached) return aCached ? 1 : -1;
        
        const ta = indicatorCache.get(`${a}:${rsiPeriod}:${exchange}`)?.ts ?? 0;
        const tb = indicatorCache.get(`${b}:${rsiPeriod}:${exchange}`)?.ts ?? 0;
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
      const batchResults = await fetchAllKlinesBatched(symbolsToRefresh, exchange);

      for (const { sym, res1m, res1h } of batchResults) {
        klineResultBySymbol1m.set(sym, res1m);
        klineResultBySymbol1h.set(sym, res1h);

        if (res1m.status === 'rejected' && res1h.status === 'rejected') {
          failedCount++;
          debugWarn(`[kline] Both 1m and 1h failed for ${sym}. Reason 1m: ${res1m.reason}, 1h: ${res1h.reason}`);
        }
      }
    }

    if (failedCount > 0) {
      console.warn(`[screener] ${failedCount}/${symbolsToRefresh.length} kline fetches failed or were throttled. Check BINANCE_APIS connectivity.`);
      // Log first few failure reasons for diagnosis
      let logged = 0;
      for (const sym of symbolsToRefresh) {
        const res1m = klineResultBySymbol1m.get(sym);
        const res1h = klineResultBySymbol1h.get(sym);
        if (res1m?.status === 'rejected' && res1h?.status === 'rejected' && logged < 3) {
          console.error(`[screener] ${sym} 1m failed:`, res1m.reason instanceof Error ? res1m.reason.message : String(res1m.reason));
          console.error(`[screener] ${sym} 1h failed:`, res1h.reason instanceof Error ? res1h.reason.message : String(res1h.reason));
          logged++;
        }
      }
    }

    const successCount = symbolsToRefresh.length - failedCount;
    debugLog(`[screener] Klines: ${successCount} ok, ${failedCount} failed out of ${symbolsToRefresh.length} symbols`);

    // 3. Process each symbol
    const entries: ScreenerEntry[] = [];

    for (const sym of symbols) {
      let ticker = tickers.get(sym);
      const res1m = klineResultBySymbol1m.get(sym);
      const res1h = klineResultBySymbol1h.get(sym);

      // Simulation for Yahoo symbols (they don't have a Binance ticker)
      if (!ticker && YAHOO_SYMBOLS.includes(sym) && res1m?.status === 'fulfilled') {
        const lastKline = res1m.value[res1m.value.length - 1];
        if (lastKline) {
          ticker = {
            symbol: sym,
            lastPrice: lastKline[4],
            priceChangePercent: "0", // Could compute from first kline, but 0 is safe
            quoteVolume: lastKline[5]
          };
        }
      }

      if (res1m?.status === 'fulfilled') {
        const klines1m = res1m.value;
        const klines1h = res1h?.status === 'fulfilled' ? res1h.value : null;
        
        if (!klines1m || klines1m.length === 0) {
          debugWarn(`[screener] ${sym}: kline fetch returned empty`);
        } else {
          const prevEntry = indicatorCache.get(`${sym}:${rsiPeriod}:${exchange}`)?.entry;
          const entry = buildEntry(
            sym,
            klines1m,
            klines1h,
            ticker,
            nowTs,
            rsiPeriod,
            prevEntry,
            coinConfigs.get(sym),
          );
          if (entry) {
            entries.push(entry);
            indicatorCache.set(`${sym}:${rsiPeriod}:${exchange}`, { entry: entry, ts: nowTs });
            continue;
          }
        }
      }

      const cached = indicatorCache.get(`${sym}:${rsiPeriod}:${exchange}`);
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
      resultCache.set(makeCacheKey(symbolCount, smartMode, rsiPeriod, exchange), {
        data: response,
        count: symbolCount,
        smartMode,
        ts: Date.now(),
      });
      return response;
    }

    const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod, exchange);
    if (stale) return stale;

    return response;
  })()
    .catch(() => {
      const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod, exchange);
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
  const exchange = options.exchange ?? 'binance';
  maybeTrafficWarm(symbolCount, smartMode, exchange, rsiPeriod);

  // Return cached result if fresh enough and same count.
  const resultCacheTtl = getResultCacheTtl(symbolCount);
  const cachedEntry = resultCache.get(makeCacheKey(symbolCount, smartMode, rsiPeriod, exchange));
  if (cachedEntry && cachedEntry.count >= symbolCount && Date.now() - cachedEntry.ts < resultCacheTtl) {
    if (cachedEntry.count === symbolCount) return cachedEntry.data;
    const cached = fromCachedResult(symbolCount, smartMode, rsiPeriod, exchange);
    if (cached) return cached;
  }

  // Stale-first: always return cached snapshot instantly.
  // WebSocket keeps prices live between indicator refreshes.
  const stale = fromCachedResult(symbolCount, smartMode, rsiPeriod, exchange);
  if (stale) {
    void runRefresh(symbolCount, smartMode, rsiPeriod, options.search, options.prioritySymbols, exchange);
    return stale;
  }

  // No usable stale snapshot available; compute (deduplicated by symbolCount).
  return runRefresh(symbolCount, smartMode, rsiPeriod, options.search, options.prioritySymbols, exchange);
}
