/**
 * RSIQ Pro - SUPER_SIGNAL Type Definitions
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Type definitions for the institutional-grade SUPER_SIGNAL system.
 * This module defines all interfaces and types used across the super-signal components.
 */

import type { ScreenerEntry } from '../types';

// ── Asset Classification ──────────────────────────────────────────

export type AssetClass = 'Crypto' | 'Metal' | 'Forex' | 'Stocks' | 'Index';

// ── Component Scores ──────────────────────────────────────────────

export interface ComponentScore {
  score: number;        // 0-100 normalized score
  confidence?: number;  // Optional confidence level (0-100)
  error?: string;       // Error message if computation failed
  computeTimeMs?: number; // Time taken to compute this component
}

export interface ComponentScores {
  regime: ComponentScore;
  liquidity: ComponentScore;
  entropy: ComponentScore;
  crossAsset: ComponentScore;
  risk: ComponentScore;
}

// ── SUPER_SIGNAL Result ───────────────────────────────────────────

export type SuperSignalCategory = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';

export interface SuperSignalResult {
  value: number;                    // 0-100 composite score
  category: SuperSignalCategory;    // Signal category
  components: ComponentScores;      // Individual component scores
  confidence: number;               // Blended component confidence (0-100)
  status: 'ok' | 'low-confidence' | 'insufficient-data';
  diagnostics: string[];
  algorithmVersion: string;         // Version tag for audit trail
  computeTimeMs: number;            // Total computation time
  timestamp: number;                // Unix timestamp
  inputHash?: string;               // SHA-256 hash of inputs for replay
}

// ── Configuration ─────────────────────────────────────────────────

export interface ComponentWeights {
  regime: number;      // Default: 0.25
  liquidity: number;   // Default: 0.25
  entropy: number;     // Default: 0.20
  crossAsset: number;  // Default: 0.20
  risk: number;        // Default: 0.10
}

export interface ThresholdBands {
  strongBuy: number;   // Default: 75
  buy: number;         // Default: 60
  neutral: number;     // Default: 40
  sell: number;        // Default: 25
}

export interface RegimeConfig {
  algorithm: 'volatility-clustering' | 'hmm';
  hmmMinBars: number;  // Minimum bars required for HMM (default: 200)
  hmmSeed: number;     // Random seed for HMM (default: 42)
}

export interface SuperSignalConfig {
  version: string;
  enabled: boolean;
  defaultWeights: ComponentWeights;
  assetClassWeights?: {
    Crypto?: Partial<ComponentWeights>;
    Metal?: Partial<ComponentWeights>;
    Forex?: Partial<ComponentWeights>;
    Stocks?: Partial<ComponentWeights>;
    Index?: Partial<ComponentWeights>;
  };
  thresholds: ThresholdBands;
  regime: RegimeConfig;
  cache: {
    componentTtlMs: number;    // Default: 15000 (15s)
    crossAssetTtlMs: number;   // Default: 60000 (60s)
    entropyTtlMs: number;      // Default: 10000 (10s)
  };
  entropy: {
    windowSize: number;        // Default: 20 (bars)
    minWindowSize: number;     // Default: 5 (bars)
    maxWindowSize: number;     // Default: 50 (bars)
    numBuckets: number;        // Default: 10 (for discretization)
  };
  liquidity: {
    vwapDeviationThreshold: number;  // Default: 2.0 (%)
    volumeImbalanceThreshold: number; // Default: 0.6 (60%)
  };
  crossAsset: {
    agreementThreshold: number;  // Default: 0.7 (70%)
    disagreementThreshold: number; // Default: 0.4 (40%)
  };
  risk: {
    atrMultipliers: {
      Crypto: number;   // Default: 1.5
      Forex: number;    // Default: 1.0
      Metal: number;    // Default: 1.2
      Stocks: number;   // Default: 1.3
      Index: number;    // Default: 1.1
    };
    maxPositionPct: number;  // Default: 0.10 (10% of account)
    defaultRiskPct: number;  // Default: 0.01 (1% of account)
  };
  performance: {
    timeoutMs: number;         // Default: 60000 (60s)
    maxComponentFailures: number; // Default: 2
  };
  audit: {
    enabled: boolean;
    retentionDays: number;     // Default: 90
    failureAlertThreshold: number; // Default: 0.05 (5%)
  };
}

// ── Input Data ────────────────────────────────────────────────────

export interface SuperSignalInput {
  symbol: string;
  price: number;
  assetClass: AssetClass;
  
  // Existing indicators from ScreenerEntry
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  rsi1h: number | null;
  rsi4h: number | null;
  rsi1d: number | null;
  
  atr: number | null;
  adx: number | null;
  
  vwap: number | null;
  vwapDiff: number | null;
  
  volume24h: number;
  avgVolume1m: number | null;
  curCandleVol: number | null;
  
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  
  change24h: number;
  
  strategySignal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
  
  // Smart Money derivatives intelligence (-100 to +100)
  smartMoneyScore?: number | null;
  fundingRate?: number | null;
  orderFlowRatio?: number | null;
  
  // Historical data for entropy
  historicalCloses?: number[];
  
  // Regime data
  regime?: {
    regime: 'trending' | 'ranging' | 'volatile' | 'breakout';
    confidence: number;
    details: string;
  } | null;
  correlatedSignals?: Map<string, 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'>;
}

// ── Cache Entry ───────────────────────────────────────────────────

export interface CachedComponentScore {
  score: ComponentScore;
  timestamp: number;
}

// ── Audit Log Entry ───────────────────────────────────────────────

export interface AuditLogEntry {
  symbol: string;
  timestamp: number;
  algorithmVersion: string;
  componentScores: ComponentScores;
  finalValue: number;
  category: SuperSignalCategory;
  inputHash: string;
  computeTimeMs: number;
  assetClass: AssetClass;
  failedComponents?: string[];
}

// ── Query Interface ───────────────────────────────────────────────

export interface AuditLogQuery {
  symbol?: string;
  fromTs?: number;
  toTs?: number;
  minScore?: number;
  maxScore?: number;
  assetClass?: AssetClass;
  limit?: number;
}
