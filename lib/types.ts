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
  // ── New: Volume & Candle detector spikes ──
  volumeSpike: boolean;
  longCandle: boolean;
  // ── New: Composite strategy ──
  strategyScore: number;
  strategySignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  strategyLabel: string;
  strategyReasons: string[];
  // ── Intelligence indicators ──
  confluence: number;
  confluenceLabel?: string;
  rsiDivergence?: 'bullish' | 'bearish' | 'none';
  momentum: number | null;
  // ── New: ATR & ADX ──
  atr: number | null;
  adx: number | null;
  // ── New: Candle & Volume Detectors ──
  avgBarSize1m: number | null;
  avgVolume1m: number | null;
  curCandleSize: number | null;
  curCandleVol: number | null;
  candleDirection: 'bullish' | 'bearish' | null;
  // ── New: Dynamic/Custom RSI ──
  rsiCustom: number | null;
  rsiStateCustom: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiDivergenceCustom?: 'bullish' | 'bearish' | 'none';
  rsiCrossover?: 'bullish_reversal' | 'bearish_reversal' | 'none';
  rsiPeriodAtCreation?: number; // The period used for rsiCustom and rsiStateCustom
  // ── Live RSI state (for client-side approximation) ──
  rsiState1m: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiState5m: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiState15m: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiState1h: { avgGain: number; avgLoss: number; lastClose: number } | null;
  // ── Indicator states for live shadowing ──
  ema9State: { ema: number } | null;
  ema21State: { ema: number } | null;
  macdFastState: { ema: number } | null;
  macdSlowState: { ema: number } | null;
  macdSignalState: { ema: number } | null;
  isLiveRsi?: boolean;
  signalStartedAt?: number;
  lastPriceChange?: number;
  updatedAt?: number;
  market: 'Crypto' | 'Metal' | 'Forex' | 'Index' | 'Stocks';
  marketState: string | null;
  // ── High-Accuracy Real-time Initialization ──
  open1m: number | null;
  volStart1m: number | null;
  momentumPriceBaseline?: number | null;
  vwapPriceBaseline?: number | null;
  // ── Historical data for correlation analysis ──
  historicalCloses?: number[];
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
    apiWeight?: number;
  };
}

export interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
  marketState?: string;
}

// Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
export type BinanceKline = [
  number, string, string, string, string, string,
  number, string, number, string, string, string,
];

export type SortKey =
  | 'symbol' | 'price' | 'change24h' | 'volume24h'
  | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h'
  | 'ema9' | 'ema21' | 'macdHistogram' | 'bbUpper' | 'bbLower' | 'bbPosition' | 'stochK' | 'vwapDiff' | 'volumeSpike'
  | 'strategyScore' | 'signal' | 'emaCross' | 'rsiDivergence'
  | 'confluence' | 'momentum' | 'atr' | 'adx' | 'longCandle'
  | 'fundingRate' | 'orderFlow' | 'smartMoney';

export type SortDir = 'asc' | 'desc';
export type SignalFilter = 'all' | 'oversold' | 'overbought' | 'neutral'
  | 'strong-buy' | 'buy' | 'sell' | 'strong-sell';
