import { calculateRsi } from './rsi';
import type { ScreenerEntry, ScreenerResponse, BinanceTicker, BinanceKline } from './types';

const BINANCE_API = 'https://api.binance.com';
const RSI_PERIOD = 14;
const KLINE_LIMIT = 500; // enough for 15m RSI (500/15 = 33 candles, need 15 for RSI-14)

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

/**
 * Fetch 24hr tickers from Binance. Returns Map<symbol, ticker>.
 */
async function fetchTickers(): Promise<Map<string, BinanceTicker>> {
  if (tickerCache && Date.now() - tickerCache.ts < TICKER_CACHE_TTL) {
    return tickerCache.data;
  }

  const res = await fetch(`${BINANCE_API}/api/v3/ticker/24hr`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Binance ticker API ${res.status}`);

  const raw: BinanceTicker[] = await res.json();
  const map = new Map<string, BinanceTicker>();
  for (const t of raw) {
    map.set(t.symbol, t);
  }

  tickerCache = { data: map, ts: Date.now() };
  return map;
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
      .slice(0, Math.max(count, 200))
      .map((t) => t.symbol);

    symbolCache = { data: usdtPairs, ts: Date.now() };
    return usdtPairs.slice(0, count);
  } catch {
    return FALLBACK_SYMBOLS.slice(0, count);
  }
}

/**
 * Fetch 1m klines for a single symbol.
 */
async function fetchKlines(symbol: string): Promise<BinanceKline[]> {
  const url = `${BINANCE_API}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=${KLINE_LIMIT}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Klines ${symbol}: ${res.status}`);
  return res.json();
}

/**
 * Aggregate 1m klines into higher timeframe klines.
 */
function aggregateKlines(
  klines: BinanceKline[],
  minutes: number,
): { close: number }[] {
  const intervalMs = minutes * 60_000;
  const buckets = new Map<number, { open: number; high: number; low: number; close: number }>();

  for (const k of klines) {
    const openTime = k[0];
    const bucketStart = Math.floor(openTime / intervalMs) * intervalMs;
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);

    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, { open: parseFloat(k[1]), high, low, close });
    } else {
      existing.high = Math.max(existing.high, high);
      existing.low = Math.min(existing.low, low);
      existing.close = close;
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
 * Main screener function: fetch data, compute RSI, return results.
 */
export async function getScreenerData(symbolCount = 100): Promise<ScreenerResponse> {
  const start = Date.now();

  // 1. Get top symbols + ticker data in parallel
  const [symbols, tickers] = await Promise.all([
    getTopSymbols(symbolCount),
    fetchTickers(),
  ]);

  // 2. Fetch 1m klines for all symbols in parallel
  const klinesResults = await Promise.allSettled(
    symbols.map((s) => fetchKlines(s)),
  );

  // 3. Process each symbol
  const entries: ScreenerEntry[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const result = klinesResults[i];
    if (result.status !== 'fulfilled') continue;

    const klines = result.value;
    if (klines.length < RSI_PERIOD + 2) continue;

    // RSI for 1m
    const closes1m = klines.map((k) => parseFloat(k[4]));
    const rsi1m = calculateRsi(closes1m, RSI_PERIOD);

    // RSI for 5m
    const agg5m = aggregateKlines(klines, 5);
    const rsi5m = agg5m.length >= RSI_PERIOD + 1
      ? calculateRsi(agg5m.map((c) => c.close), RSI_PERIOD)
      : null;

    // RSI for 15m
    const agg15m = aggregateKlines(klines, 15);
    const rsi15m = agg15m.length >= RSI_PERIOD + 1
      ? calculateRsi(agg15m.map((c) => c.close), RSI_PERIOD)
      : null;

    const ticker = tickers.get(sym);
    const price = closes1m[closes1m.length - 1];

    entries.push({
      symbol: sym,
      price,
      change24h: ticker ? parseFloat(ticker.priceChangePercent) : 0,
      volume24h: ticker ? parseFloat(ticker.quoteVolume) : 0,
      rsi1m,
      rsi5m,
      rsi15m,
      signal: deriveSignal(rsi15m ?? rsi5m ?? rsi1m),
      updatedAt: Date.now(),
    });
  }

  const computeTimeMs = Date.now() - start;

  return {
    data: entries,
    meta: {
      total: entries.length,
      oversold: entries.filter((e) => e.signal === 'oversold').length,
      overbought: entries.filter((e) => e.signal === 'overbought').length,
      computeTimeMs,
      fetchedAt: Date.now(),
    },
  };
}
