// ── Screener domain types ──

export interface ScreenerEntry {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  // ── Original RSI indicators (kept) ──
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  signal: 'oversold' | 'overbought' | 'neutral';
  // ── New: 1h RSI ──
  rsi1h: number | null;
  // ── New: EMA cross ──
  ema9: number | null;
  ema21: number | null;
  emaCross: 'bullish' | 'bearish' | 'none';
  // ── New: MACD (15m) ──
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  // ── New: Bollinger Bands (15m) ──
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbPosition: number | null;
  // ── New: Stochastic RSI (15m) ──
  stochK: number | null;
  stochD: number | null;
  // ── New: VWAP ──
  vwap: number | null;
  vwapDiff: number | null;
  // ── New: Volume spike ──
  volumeSpike: boolean;
  // ── New: Composite strategy ──
  strategyScore: number;
  strategySignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  strategyLabel: string;
  strategyReasons: string[];
  // ── Intelligence indicators ──
  confluence: number;
  confluenceLabel: string;
  rsiDivergence: 'bullish' | 'bearish' | 'none';
  momentum: number | null;
  // ── New: Dynamic/Custom RSI ──
  rsiCustom: number | null;
  rsiStateCustom: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiDivergenceCustom: 'bullish' | 'bearish' | 'none';
  // ── Live RSI state (for client-side approximation) ──
  rsiState1m: { avgGain: number; avgLoss: number; lastClose: number } | null;
  isLiveRsi?: boolean;
  updatedAt: number;
}

export interface ScreenerResponse {
  data: ScreenerEntry[];
  meta: {
    total: number;
    indicatorReady: number;
    indicatorCoveragePct: number;
    oversold: number;
    overbought: number;
    // ── New: strategy breakdown ──
    strongBuy: number;
    buy: number;
    neutral: number;
    sell: number;
    strongSell: number;
    computeTimeMs: number;
    fetchedAt: number;
    smartMode: boolean;
    refreshCap: number;
  };
}

export interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

// Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
export type BinanceKline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string,
];

export type SortKey =
  | 'symbol' | 'price' | 'change24h' | 'volume24h'
  | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h' | 'rsiCustom'
  | 'macdHistogram' | 'bbPosition' | 'stochK' | 'vwapDiff'
  | 'strategyScore' | 'signal' | 'emaCross' | 'rsiDivergence'
  | 'confluence' | 'momentum';

export type SortDir = 'asc' | 'desc';
export type SignalFilter = 'all' | 'oversold' | 'overbought' | 'neutral'
  | 'strong-buy' | 'buy' | 'sell' | 'strong-sell';
