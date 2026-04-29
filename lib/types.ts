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
  // ── New: 1h, 4h, 1d RSI ──
  rsi1h: number | null;
  rsi4h: number | null;
  rsi1d: number | null;
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
  // ── Pre-coherence strategy values (preserved for audit/display) ──
  /** Original strategy score before coherence gate / FINAL alignment. */
  rawStrategyScore?: number;
  /** Original strategy signal before coherence gate / FINAL alignment. */
  rawStrategySignal?: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  /** Original strategy label before coherence gate / FINAL alignment. */
  rawStrategyLabel?: string;
  /** True if the coherence gate forced strategy to neutral due to Super Signal conflict. */
  coherenceGated?: boolean;
  // ── Intelligence indicators ──
  confluence: number;
  confluenceLabel?: string;
  rsiDivergence?: 'bullish' | 'bearish' | 'none';
  momentum: number | null;
  // ── New: ATR & ADX ──
  atr: number | null;
  adx: number | null;
  cci: number | null;
  // ── New: OBV & Williams %R (2026 Intelligence Upgrade) ──
  obvTrend: 'bullish' | 'bearish' | 'none';
  williamsR: number | null;
  // ── New: Candle & Volume Detectors ──
  avgBarSize1m: number | null;
  avgVolume1m: number | null;
  curCandleSize: number | null;
  curCandleVol: number | null;
  candleDirection: 'bullish' | 'bearish' | 'neutral' | null;
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
  rsiState4h: { avgGain: number; avgLoss: number; lastClose: number } | null;
  rsiState1d: { avgGain: number; avgLoss: number; lastClose: number } | null;
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
  // ── 2026 Intelligence: ATR-Based Risk Parameters ──
  riskParams?: {
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    riskRewardRatio: number;
    atrUsed: number;
    atrMultiplier: number;
  } | null;
  // ── 2026 Intelligence: Hidden Divergence (Continuation) ──
  hiddenDivergence?: 'hidden-bullish' | 'hidden-bearish' | 'none';
  // ── 2026 Intelligence: Market Regime Classification ──
  regime?: {
    regime: 'trending' | 'ranging' | 'volatile' | 'breakout';
    confidence: number;
    details: string;
  } | null;
  // ── 2026 Intelligence: Fibonacci Levels ──
  fibLevels?: {

    swingHigh: number;
    swingLow: number;
    level236: number;
    level382: number;
    level500: number;
    level618: number;
    level786: number;
  } | null;
  // ── 2026 Intelligence: Smart Money Concepts (SMC) ──
  smc?: {
    fvg?: {
      type: 'bullish' | 'bearish';
      top: number;
      bottom: number;
    } | null;
    orderBlock?: {
      type: 'bullish' | 'bearish';
      top: number;
      bottom: number;
      strength: 'weak' | 'moderate' | 'strong';
    } | null;
  } | null;
  // ── Derivatives / Smart Money (injected at display layer) ──
  /** Smart Money Pressure Index score (-100 to +100). Injected from useDerivativesIntel. */
  smartMoneyScore?: number | null;
  /** Funding rate (decimal, e.g. 0.0005 = 0.05%). */
  fundingRate?: number | null;
  /** Order flow buy ratio (0..1). */
  orderFlowRatio?: number | null;
  // ── 2026 Intelligence: SUPER_SIGNAL (Institutional-Grade Composite Signal) ──
  /** SUPER_SIGNAL: Composite institutional-grade signal fusing regime, liquidity, entropy, cross-asset, and risk analysis. */
  superSignal?: {
    value: number;                    // 0-100 composite score
    category: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
    confidence?: number;
    status?: 'ok' | 'low-confidence' | 'insufficient-data';
    diagnostics?: string[];
    components: {
      regime: { score: number; confidence?: number; error?: string };
      liquidity: { score: number; confidence?: number; error?: string };
      entropy: { score: number; confidence?: number; error?: string };
      crossAsset: { score: number; confidence?: number; error?: string };
      risk: { score: number; confidence?: number; error?: string };
    };
    algorithmVersion: string;
    computeTimeMs: number;
    timestamp: number;
    inputHash?: string;
  } | null;
  // ── FINAL column (unified decision output) ──
  /** Fused final signal from Strategy + Super Signal + RSI Signal. */
  finalSignal?: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  /** Fused final score (-100 to +100). */
  finalScore?: number;
  /** Attribution source for the final decision. */
  finalSource?: 'super' | 'strategy';
}

export interface ScreenerResponse {
  data: ScreenerEntry[];
  meta: {
    total: number;
    indicatorReady: number;
    indicatorCoveragePct: number;
    oversold: number;
    overbought: number;
    // ── Strategy breakdown ──
    strongBuy: number;
    buy: number;
    neutral: number;
    sell: number;
    strongSell: number;
    // ── SUPER_SIGNAL breakdown ──
    strongBuySuper?: number;
    buySuper?: number;
    neutralSuper?: number;
    sellSuper?: number;
    strongSellSuper?: number;
    computeTimeMs: number;
    fetchedAt: number;
    smartMode: boolean;
    refreshCap: number;
    calibrating?: boolean;
    apiWeight?: number;
    syncMode?: 'LEADER' | 'SHARED';
    lastGlobalRefresh?: number;
    apiUnavailable?: boolean;
    geoBlocked?: boolean;
    error?: string;
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
  | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h' | 'rsi4h' | 'rsi1d'
  | 'ema9' | 'ema21' | 'macdHistogram' | 'bbUpper' | 'bbLower' | 'bbPosition' | 'stochK' | 'vwapDiff' | 'volumeSpike'
  | 'strategyScore' | 'signal' | 'emaCross' | 'rsiDivergence'
  | 'confluence' | 'momentum' | 'atr' | 'adx' | 'cci' | 'longCandle'
  | 'fundingRate' | 'orderFlow' | 'smartMoney' | 'superSignal'
  | 'finalScore';

export type SortDir = 'asc' | 'desc';
export type TradingStyle = 'scalping' | 'intraday' | 'swing' | 'position';

export interface ScreenerOptions {
  smartMode?: boolean;
  rsiPeriod?: number;
  search?: string;
  prioritySymbols?: string[];
  exchange?: string;
  tradingStyle?: TradingStyle;
}

export type SignalFilter = 'all' | 'oversold' | 'overbought' | 'neutral'
  | 'strong-buy' | 'buy' | 'sell' | 'strong-sell';
