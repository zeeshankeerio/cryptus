/**
 * RSIQ Pro - Derivatives Intelligence Types
 * Data structures for funding rates, liquidations, whale trades, and order flow.
 */

// ── Funding Rate ────────────────────────────────────────────────

export interface FundingRateData {
  symbol: string;
  rate: number;          // e.g., 0.0001 = 0.01%
  annualized: number;    // rate * 3 * 365 (3 funding periods per day)
  nextFundingTime: number;
  markPrice: number;
  indexPrice: number;
  updatedAt: number;
}

// ── Liquidation ─────────────────────────────────────────────────

export interface LiquidationEvent {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';   // Buy = short liquidated, Sell = long liquidated
  size: number;            // quantity in base asset
  price: number;           // bankruptcy price
  valueUsd: number;        // size * price
  exchange: 'binance' | 'bybit';
  timestamp: number;
}

// ── Whale Trade ─────────────────────────────────────────────────

export interface WhaleTradeEvent {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';   // taker side
  price: number;
  quantity: number;
  valueUsd: number;
  exchange: 'binance' | 'bybit';
  timestamp: number;
}

// ── Order Flow ──────────────────────────────────────────────────

export interface OrderFlowData {
  symbol: string;
  buyVolume1m: number;     // USD value of buy-side volume in last 1 min
  sellVolume1m: number;    // USD value of sell-side volume in last 1 min
  ratio: number;           // buyVolume / (buyVolume + sellVolume), 0-1
  pressure: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  tradeCount1m: number;
  updatedAt: number;
}

// ── Open Interest ───────────────────────────────────────────────

export interface OpenInterestData {
  symbol: string;
  value: number;           // OI in USD
  change1h: number;        // % change from 1h ago
  change24h: number;       // % change from 24h ago
  updatedAt: number;
}

// ── Smart Money Pressure Index ──────────────────────────────────

export interface SmartMoneyPressure {
  symbol: string;
  score: number;           // -100 to +100
  label: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  components: {
    fundingSignal: number;       // -100 to +100
    liquidationImbalance: number; // -100 to +100 (positive = shorts liquidated more)
    whaleDirection: number;       // -100 to +100
    orderFlowPressure: number;   // -100 to +100
    cvdSignal?: number;          // -100 to +100 (Phase 1 addition)
    optionsSignal?: number;      // -100 to +100 (Phase 1 addition)
  };
  updatedAt: number;
}

// ── CVD (Cumulative Volume Delta) - Phase 1 ────────────────────

export interface CVDData {
  symbol: string;
  cvd1h: number;              // Cumulative delta last 1 hour
  cvd4h: number;              // Cumulative delta last 4 hours
  cvd24h: number;             // Cumulative delta last 24 hours
  cvdTrend: 'accumulation' | 'distribution' | 'neutral';
  divergence: 'bullish' | 'bearish' | 'none';  // CVD vs price
  strength: number;           // 0-100
  updatedAt: number;
}

// ── Funding Rate Historical Context - Phase 1 ──────────────────

export interface FundingRateHistory {
  symbol: string;
  current: number;
  avg1h: number;
  avg4h: number;
  avg24h: number;
  percentile: number;      // 0-100 (where current rate sits historically)
  trend: 'increasing' | 'decreasing' | 'stable';
  extremeLevel: 'normal' | 'elevated' | 'extreme';
  divergence: 'bullish' | 'bearish' | 'none';  // vs price
  momentum: number;        // Rate of change
  reversal: boolean;       // True if trend reversing
  updatedAt: number;
}

// ── Open Interest Analysis - Phase 1 ───────────────────────────

export interface OpenInterestAnalysis {
  symbol: string;
  value: number;
  change1h: number;
  change4h: number;
  change24h: number;
  changeRate: 'accelerating' | 'steady' | 'decelerating';
  oiVolumeRatio: number;   // OI / 24h volume
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  divergence: 'bullish' | 'bearish' | 'none';
  liquidationRisk: number; // 0-100 score
  updatedAt: number;
}

// ── Liquidation Cascade Risk - Phase 1 ─────────────────────────

export interface LiquidationCascadeRisk {
  symbol: string;
  riskScore: number;          // 0-100
  triggerPrice: number;       // Price that triggers cascade
  estimatedCascadeValue: number; // USD value of potential cascade
  affectedLevels: number[];   // Price levels in cascade path
  timeToTrigger: number;      // Estimated seconds
  severity: 'low' | 'medium' | 'high' | 'extreme';
  direction: 'long' | 'short';
  updatedAt: number;
}

// ── Options Intelligence - Phase 1 ──────────────────────────────

export interface OptionsIntelligence {
  symbol: string;
  putCallRatio: number;      // < 1 = bullish, > 1 = bearish
  impliedVolatility: number; // 0-100
  maxPainPrice: number;      // Price level magnet
  openInterest: number;      // Options OI
  sentiment: 'bullish' | 'bearish' | 'neutral';
  updatedAt: number;
}

// ── Aggregated Derivatives State ────────────────────────────────

export interface DerivativesState {
  fundingRates: Map<string, FundingRateData>;
  liquidations: LiquidationEvent[];       // last 100
  whaleAlerts: WhaleTradeEvent[];         // last 50
  orderFlow: Map<string, OrderFlowData>;
  openInterest: Map<string, OpenInterestData>;
  smartMoney: Map<string, SmartMoneyPressure>;
  // Phase 1 additions
  cvd: Map<string, CVDData>;
  fundingHistory: Map<string, FundingRateHistory>;
  oiAnalysis: Map<string, OpenInterestAnalysis>;
  cascadeRisk: Map<string, LiquidationCascadeRisk>;
  optionsIntel: Map<string, OptionsIntelligence>;
  isConnected: boolean;
  lastUpdate: number;
}

// ── Worker Message Types ────────────────────────────────────────

export type DerivativesWorkerMessage =
  | { type: 'START'; payload: { symbols: string[] } }
  | { type: 'STOP' }
  | { type: 'UPDATE_SYMBOLS'; payload: { symbols: string[] } }
  | { type: 'FUNDING_UPDATE'; payload: [string, FundingRateData][] }
  | { type: 'LIQUIDATION'; payload: LiquidationEvent }
  | { type: 'WHALE_TRADE'; payload: WhaleTradeEvent }
  | { type: 'ORDER_FLOW_UPDATE'; payload: [string, OrderFlowData][] }
  | { type: 'OI_UPDATE'; payload: [string, OpenInterestData][] }
  // Phase 1 message types
  | { type: 'CVD_UPDATE'; payload: [string, CVDData][] }
  | { type: 'FUNDING_HISTORY_UPDATE'; payload: [string, FundingRateHistory][] }
  | { type: 'OI_ANALYSIS_UPDATE'; payload: [string, OpenInterestAnalysis][] }
  | { type: 'CASCADE_RISK_UPDATE'; payload: [string, LiquidationCascadeRisk][] }
  | { type: 'OPTIONS_UPDATE'; payload: [string, OptionsIntelligence][] };
