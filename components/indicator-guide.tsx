'use client';

import { useState } from 'react';
import Link from 'next/link';

// ─── Data ──────────────────────────────────────────────────────

interface Indicator {
  id: string;
  name: string;
  icon: string;
  category: 'momentum' | 'trend' | 'volatility' | 'volume' | 'strategy';
  tagColor: string;
  summary: string;
  formula: string[];
  parameters: { name: string; value: string; description: string }[];
  interpretation: { condition: string; meaning: string; color: string }[];
  usage: string;
}

const CATEGORIES: { key: Indicator['category']; label: string; color: string }[] = [
  { key: 'momentum', label: 'Momentum', color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
  { key: 'trend', label: 'Trend', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  { key: 'volatility', label: 'Volatility', color: 'text-purple-400 border-purple-500/40 bg-purple-500/10' },
  { key: 'volume', label: 'Volume', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  { key: 'strategy', label: 'Strategy', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
];

const INDICATORS: Indicator[] = [
  {
    id: 'rsi',
    name: 'Relative Strength Index (RSI)',
    icon: '📊',
    category: 'momentum',
    tagColor: 'text-blue-400',
    summary: 'Measures the speed and magnitude of recent price changes to evaluate overbought or oversold conditions. Uses Wilder\'s smoothing method for stability across volatile crypto markets.',
    formula: [
      'RSI = 100 − 100 / (1 + RS)',
      'RS = Average Gain / Average Loss',
      'First Average Gain = Sum of gains over period / period',
      'Subsequent Average Gain = (prev × (period − 1) + current gain) / period',
      'Subsequent Average Loss = (prev × (period − 1) + current loss) / period',
    ],
    parameters: [
      { name: 'Period', value: '14', description: 'Standard Wilder period for all timeframes' },
      { name: 'Timeframes', value: '1m, 5m, 15m, 1h', description: 'Multi-timeframe analysis from 1-minute to 1-hour candles' },
      { name: 'Data source', value: 'REST API', description: '1000 × 1m candles aggregated into higher timeframes' },
    ],
    interpretation: [
      { condition: 'RSI ≤ 20', meaning: 'Deeply oversold — strong buy signal', color: 'text-emerald-400' },
      { condition: 'RSI ≤ 30', meaning: 'Oversold — potential reversal zone', color: 'text-emerald-300' },
      { condition: 'RSI 30–70', meaning: 'Neutral — no extreme condition', color: 'text-gray-400' },
      { condition: 'RSI ≥ 70', meaning: 'Overbought — potential reversal zone', color: 'text-red-300' },
      { condition: 'RSI ≥ 80', meaning: 'Deeply overbought — strong sell signal', color: 'text-red-400' },
    ],
    usage: 'The screener computes RSI across 4 timeframes (1m, 5m, 15m, 1h) simultaneously. 1m RSI captures scalping opportunities, while 1h RSI reveals macro trends. The RSI-based signal (Oversold/Overbought) is derived from the longest available timeframe using a fallback chain: 15m → 5m → 1m.',
  },
  {
    id: 'ema-cross',
    name: 'EMA Cross (9/21)',
    icon: '📈',
    category: 'trend',
    tagColor: 'text-emerald-400',
    summary: 'Detects trend direction using the relationship between fast (9) and slow (21) Exponential Moving Averages on 15-minute candles. Reports both crossover events and current trend state.',
    formula: [
      'EMA = Price × k + EMA_prev × (1 − k)',
      'k = 2 / (period + 1)',
      'Seed: SMA of first N values',
      'Bullish Cross: EMA9_prev ≤ EMA21_prev AND EMA9_now > EMA21_now',
      'Bearish Cross: EMA9_prev ≥ EMA21_prev AND EMA9_now < EMA21_now',
      'Trend: EMA9 > EMA21 → Bullish, EMA9 < EMA21 → Bearish',
    ],
    parameters: [
      { name: 'Fast Period', value: '9', description: 'Responsive to recent price action' },
      { name: 'Slow Period', value: '21', description: 'Smooths out short-term noise' },
      { name: 'Timeframe', value: '15m candles', description: 'Aggregated from 1-minute klines' },
    ],
    interpretation: [
      { condition: '▲ Bullish', meaning: 'Fast EMA above slow EMA — uptrend', color: 'text-emerald-400' },
      { condition: '▼ Bearish', meaning: 'Fast EMA below slow EMA — downtrend', color: 'text-red-400' },
      { condition: '— None', meaning: 'Insufficient data or EMAs converged', color: 'text-gray-500' },
    ],
    usage: 'EMA Cross provides trend context for other indicators. A bullish RSI oversold reading in a bullish EMA trend is a stronger buy signal than one in a bearish trend. The screener shows the current trend state, not just the single crossover candle.',
  },
  {
    id: 'macd',
    name: 'MACD (Moving Average Convergence Divergence)',
    icon: '🔀',
    category: 'momentum',
    tagColor: 'text-blue-400',
    summary: 'Tracks the relationship between two EMAs to identify trend momentum and direction. The histogram reveals acceleration or deceleration of the trend.',
    formula: [
      'MACD Line = EMA(12) − EMA(26)',
      'Signal Line = EMA(9) of MACD Line',
      'Histogram = MACD Line − Signal Line',
      'Positive histogram → bullish momentum increasing',
      'Negative histogram → bearish momentum increasing',
    ],
    parameters: [
      { name: 'Fast EMA', value: '12', description: 'Standard fast period' },
      { name: 'Slow EMA', value: '26', description: 'Standard slow period' },
      { name: 'Signal EMA', value: '9', description: 'Smoothing for the signal line' },
      { name: 'Timeframe', value: '15m candles', description: 'Requires ~35 candles for stable output' },
    ],
    interpretation: [
      { condition: 'Histogram > 0', meaning: 'Bullish momentum — MACD above signal', color: 'text-emerald-400' },
      { condition: 'Histogram < 0', meaning: 'Bearish momentum — MACD below signal', color: 'text-red-400' },
      { condition: 'Histogram → 0', meaning: 'Momentum fading — potential reversal', color: 'text-gray-400' },
    ],
    usage: 'The strategy scoring normalizes the MACD histogram as a percentage of the current price, ensuring fair comparison across assets from BTC ($60K+) to micro-cap coins ($0.001). This prevents high-priced assets from always dominating the signal.',
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    icon: '📏',
    category: 'volatility',
    tagColor: 'text-purple-400',
    summary: 'Measures volatility using a moving average with standard deviation bands. The band position (0–1) indicates where the current price sits relative to the expected range.',
    formula: [
      'Middle Band = SMA(20) of close prices',
      'Upper Band = Middle + 2 × σ',
      'Lower Band = Middle − 2 × σ',
      'σ = √(Σ(close − mean)² / N)',
      'Position = (Price − Lower) / (Upper − Lower)',
    ],
    parameters: [
      { name: 'Period', value: '20', description: 'Standard lookback window' },
      { name: 'Std Dev Multiplier', value: '2', description: 'Width of bands (covers ~95% of price action)' },
      { name: 'Timeframe', value: '15m candles', description: 'Balances sensitivity and stability' },
    ],
    interpretation: [
      { condition: 'Position ≤ 0.10', meaning: 'At lower band — strongly oversold', color: 'text-emerald-400' },
      { condition: 'Position ≤ 0.25', meaning: 'Near lower band — mildly oversold', color: 'text-emerald-300' },
      { condition: 'Position ≈ 0.50', meaning: 'At middle — neutral territory', color: 'text-gray-400' },
      { condition: 'Position ≥ 0.75', meaning: 'Near upper band — mildly overbought', color: 'text-red-300' },
      { condition: 'Position ≥ 0.90', meaning: 'At upper band — strongly overbought', color: 'text-red-400' },
    ],
    usage: 'BB Position is a normalized 0–1 value where 0 = price at the lower band and 1 = at the upper band. This makes it directly comparable across all assets regardless of price or volatility levels. Mean reversion traders look for extreme positions (<0.1 or >0.9).',
  },
  {
    id: 'stoch-rsi',
    name: 'Stochastic RSI',
    icon: '🌀',
    category: 'momentum',
    tagColor: 'text-blue-400',
    summary: 'Applies the Stochastic oscillator formula to RSI values instead of price. More sensitive than standard RSI, generating earlier signals at the cost of more noise.',
    formula: [
      'Step 1: Compute full RSI series (Wilder\'s smoothing, period 14)',
      'Step 2: StochRSI = (RSI − min(RSI, N)) / (max(RSI, N) − min(RSI, N)) × 100',
      '%K = SMA(3) of raw StochRSI values',
      '%D = SMA(3) of %K values',
      'When RSI range is 0 (flat market), StochRSI = 50',
    ],
    parameters: [
      { name: 'RSI Period', value: '14', description: 'Underlying RSI lookback' },
      { name: 'Stoch Period', value: '14', description: 'Stochastic lookback on RSI series' },
      { name: '%K Smoothing', value: '3', description: 'SMA smoothing for %K' },
      { name: '%D Smoothing', value: '3', description: 'SMA smoothing for %D' },
    ],
    interpretation: [
      { condition: 'K < 20 & D < 20', meaning: 'Both lines in oversold zone — strong buy', color: 'text-emerald-400' },
      { condition: 'K < 30', meaning: 'K entering oversold zone', color: 'text-emerald-300' },
      { condition: 'K > 80 & D > 80', meaning: 'Both lines in overbought zone — strong sell', color: 'text-red-400' },
      { condition: 'K > 70', meaning: 'K entering overbought zone', color: 'text-red-300' },
      { condition: 'K crosses above D (K < 50)', meaning: 'Bullish crossover in lower half — buy bias', color: 'text-emerald-300' },
      { condition: 'K crosses below D (K > 50)', meaning: 'Bearish crossover in upper half — sell bias', color: 'text-red-300' },
    ],
    usage: 'Stochastic RSI oscillates more aggressively than standard RSI. The %K/%D crossover provides additional directional bias. In the strategy score, K/D crossovers in their respective halves add a ±20 bonus to the composite score.',
  },
  {
    id: 'vwap',
    name: 'VWAP (Volume-Weighted Average Price)',
    icon: '💹',
    category: 'volume',
    tagColor: 'text-amber-400',
    summary: 'Calculates the average price weighted by volume, resetting at UTC midnight. Institutional-grade benchmark that reveals whether the asset is trading above or below its "fair" price.',
    formula: [
      'Typical Price (TP) = (High + Low + Close) / 3',
      'Cumulative TP × Volume = Σ(TP_i × Volume_i)',
      'Cumulative Volume = Σ(Volume_i)',
      'VWAP = Cumulative(TP × Volume) / Cumulative(Volume)',
      'VWAP Diff = ((Price − VWAP) / VWAP) × 100%',
    ],
    parameters: [
      { name: 'Reset', value: 'UTC midnight', description: 'Daily reset for standard session VWAP' },
      { name: 'Data', value: '1-minute candles', description: 'High granularity for accurate weighting' },
      { name: 'Display', value: 'Deviation %', description: 'How far price is from VWAP as a percentage' },
    ],
    interpretation: [
      { condition: 'VWAP Diff < −2%', meaning: 'Significantly below VWAP — buying opportunity', color: 'text-emerald-400' },
      { condition: 'VWAP Diff ≈ 0%', meaning: 'Trading near fair value', color: 'text-gray-400' },
      { condition: 'VWAP Diff > +2%', meaning: 'Significantly above VWAP — selling pressure zone', color: 'text-red-400' },
    ],
    usage: 'VWAP is the primary benchmark for institutional crypto traders. Price below VWAP suggests the asset is being accumulated at a discount (bullish), while price above VWAP suggests distribution (bearish). The ±2% threshold filters out noise.',
  },
  {
    id: 'volume-spike',
    name: 'Volume Spike Detection',
    icon: '🔥',
    category: 'volume',
    tagColor: 'text-amber-400',
    summary: 'Identifies unusually high trading activity by comparing the current candle\'s volume against recent historical average. Spikes amplify existing signals in the composite strategy.',
    formula: [
      'Average Volume = mean(last 20 candles, excluding current)',
      'Spike detected when: Current Volume ≥ Average × 2.0',
      'When spike detected: Strategy score amplified by ×1.15',
    ],
    parameters: [
      { name: 'Lookback', value: '20 candles', description: 'Recent volume history for baseline' },
      { name: 'Threshold', value: '2.0×', description: 'Current volume must be at least 2× average' },
      { name: 'Amplifier', value: '1.15×', description: 'Strategy score boost when spike detected' },
    ],
    interpretation: [
      { condition: '🔥 Spike', meaning: 'Volume 2× above recent average — high conviction', color: 'text-amber-400' },
      { condition: '— No spike', meaning: 'Normal volume levels', color: 'text-gray-500' },
    ],
    usage: 'Volume spikes indicate institutional activity or significant market events. When combined with other signals (e.g., RSI oversold + volume spike), the conviction is much higher. The 1.15× amplifier boosts the composite score in either direction.',
  },
  {
    id: 'strategy',
    name: 'Composite Strategy Score',
    icon: '🎯',
    category: 'strategy',
    tagColor: 'text-rose-400',
    summary: 'Combines all indicators into a single -100 to +100 score using a weighted average system. Heavier weights on longer timeframes and trend indicators for robust signals.',
    formula: [
      'Score = Σ(indicator_contribution × weight) / Σ(active_weights)',
      'Each indicator converts its reading to a -100...+100 sub-score',
      'Volume spike applies a 1.15× amplifier to the raw score before normalization',
      'Final score clamped to [-100, +100]',
    ],
    parameters: [
      { name: 'RSI 1m', value: 'Weight 0.5', description: 'Lowest weight — noisy but timely' },
      { name: 'RSI 5m', value: 'Weight 1.0', description: 'Short-term momentum' },
      { name: 'RSI 15m', value: 'Weight 1.5', description: 'Core momentum timeframe' },
      { name: 'RSI 1h', value: 'Weight 2.0', description: 'Highest RSI weight — macro trend' },
      { name: 'MACD', value: 'Weight 1.5', description: 'Price-normalized histogram momentum' },
      { name: 'Bollinger', value: 'Weight 1.0', description: 'Mean reversion signal' },
      { name: 'Stochastic RSI', value: 'Weight 1.0', description: 'Oversold/overbought sensitivity' },
      { name: 'EMA Cross', value: 'Weight 1.5', description: 'Trend direction (±60 contribution)' },
      { name: 'VWAP', value: 'Weight 0.5', description: 'Institutional fair value deviation' },
    ],
    interpretation: [
      { condition: 'Score ≥ +50', meaning: 'Strong Buy — multiple indicators aligned bullish', color: 'text-emerald-400' },
      { condition: 'Score +20 to +49', meaning: 'Buy — moderate bullish bias', color: 'text-emerald-300' },
      { condition: 'Score −19 to +19', meaning: 'Neutral — mixed or insufficient signals', color: 'text-gray-400' },
      { condition: 'Score −49 to −20', meaning: 'Sell — moderate bearish bias', color: 'text-red-300' },
      { condition: 'Score ≤ −50', meaning: 'Strong Sell — multiple indicators aligned bearish', color: 'text-red-400' },
    ],
    usage: 'The strategy score is the screener\'s crown jewel. It only considers indicators with data available (null values are excluded from the denominator), preventing partial data from skewing results. The normalization ensures fair scoring from micro-cap to large-cap. Sort by Strategy Score to find the strongest setups.',
  },
];

// ─── Components ────────────────────────────────────────────────

function CategoryBadge({ category }: { category: Indicator['category'] }) {
  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-full border tracking-wide uppercase ${cat.color}`}>
      {cat.label}
    </span>
  );
}

function FormulaBlock({ lines }: { lines: string[] }) {
  return (
    <div className="bg-dark-900/70 border border-dark-700 rounded-lg p-4 font-mono text-sm space-y-1.5">
      {lines.map((line, i) => (
        <div key={i} className="text-gray-300 leading-relaxed">
          <span className="text-gray-600 select-none mr-3">{i + 1}.</span>
          {line}
        </div>
      ))}
    </div>
  );
}

function ParameterTable({ params }: { params: Indicator['parameters'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dark-700">
            <th className="py-2 pr-4 text-left text-xs text-gray-500 uppercase tracking-wider">Parameter</th>
            <th className="py-2 pr-4 text-left text-xs text-gray-500 uppercase tracking-wider">Value</th>
            <th className="py-2 text-left text-xs text-gray-500 uppercase tracking-wider">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={i} className="border-b border-dark-700/50">
              <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">{p.name}</td>
              <td className="py-2.5 pr-4 text-blue-400 font-mono whitespace-nowrap">{p.value}</td>
              <td className="py-2.5 text-gray-400">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterpretationList({ items }: { items: Indicator['interpretation'] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-dark-800/50 border border-dark-700/50">
          <span className={`font-mono text-xs whitespace-nowrap mt-0.5 min-w-[180px] ${item.color}`}>{item.condition}</span>
          <span className="text-gray-300 text-sm">{item.meaning}</span>
        </div>
      ))}
    </div>
  );
}

function IndicatorCard({ indicator, isOpen, onToggle }: { indicator: Indicator; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-800/80 overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 sm:p-5 text-left hover:bg-dark-700/50 transition-colors"
      >
        <span className="text-2xl">{indicator.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-semibold text-white">{indicator.name}</h3>
            <CategoryBadge category={indicator.category} />
          </div>
          <p className="text-sm text-gray-400 mt-1 line-clamp-1">{indicator.summary}</p>
        </div>
        <span className={`text-gray-500 text-xl transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-5 space-y-5 border-t border-dark-700">
          {/* Summary */}
          <div className="pt-4">
            <p className="text-sm text-gray-300 leading-relaxed">{indicator.summary}</p>
          </div>

          {/* Formula */}
          <div>
            <h4 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Formula / Logic</h4>
            <FormulaBlock lines={indicator.formula} />
          </div>

          {/* Parameters */}
          <div>
            <h4 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Parameters</h4>
            <ParameterTable params={indicator.parameters} />
          </div>

          {/* Interpretation */}
          <div>
            <h4 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Signal Interpretation</h4>
            <InterpretationList items={indicator.interpretation} />
          </div>

          {/* Usage note */}
          <div className="p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
            <div className="flex items-start gap-2">
              <span className="text-blue-400 text-sm mt-0.5">💡</span>
              <p className="text-sm text-blue-300/80 leading-relaxed">{indicator.usage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Guide Component ──────────────────────────────────────

export default function IndicatorGuide() {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(['rsi']));
  const [filterCat, setFilterCat] = useState<Indicator['category'] | 'all'>('all');

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenIds(new Set(INDICATORS.map((i) => i.id)));
  const collapseAll = () => setOpenIds(new Set());

  const filtered = filterCat === 'all' ? INDICATORS : INDICATORS.filter((i) => i.category === filterCat);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-400 transition-colors mb-4"
        >
          ← Back to Screener
        </Link>

        <div className="rounded-2xl border border-dark-700 bg-gradient-to-r from-dark-900 via-dark-800 to-dark-900 p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-dark-600 bg-dark-800/80 px-2.5 py-1 text-[11px] tracking-wide text-gray-400 uppercase mb-3">
            Reference Guide
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white flex items-center gap-2.5 tracking-tight">
            <span className="text-blue-400">📖</span>
            <span>Indicator & Strategy Guide</span>
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl leading-relaxed">
            Complete reference for every technical indicator, signal logic, and the composite strategy scoring
            system used in the CryptoRSI Screener. Understand exactly how buy/sell decisions are calculated.
          </p>
        </div>
      </header>

      {/* Data pipeline overview */}
      <section className="mb-8 rounded-xl border border-dark-700 bg-dark-800/70 p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-blue-400">⚡</span> Data Pipeline
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Source</div>
            <div className="text-white font-medium">Paid WebSocket</div>
            <div className="text-gray-400 text-xs mt-1">Live prices via <code className="text-blue-400">!miniTicker@arr</code> stream — sub-second price updates for all tracked pairs</div>
          </div>
          <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Indicators</div>
            <div className="text-white font-medium">Server-Side Compute</div>
            <div className="text-gray-400 text-xs mt-1">1000× 1m candles + 100× 1h candles fetched via REST API, indicators computed in batches of 50</div>
          </div>
          <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Delivery</div>
            <div className="text-white font-medium">Hybrid Architecture</div>
            <div className="text-gray-400 text-xs mt-1">WebSocket for real-time prices (2s flush), REST for indicators (30–60s refresh), merged client-side</div>
          </div>
        </div>
      </section>

      {/* Category filter + expand/collapse */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filterCat === 'all'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                : 'bg-dark-800 text-gray-400 border-dark-600 hover:bg-dark-700'
            }`}
          >
            All ({INDICATORS.length})
          </button>
          {CATEGORIES.map((cat) => {
            const count = INDICATORS.filter((i) => i.category === cat.key).length;
            return (
              <button
                key={cat.key}
                onClick={() => setFilterCat(cat.key)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  filterCat === cat.key
                    ? cat.color
                    : 'bg-dark-800 text-gray-400 border-dark-600 hover:bg-dark-700'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={expandAll} className="text-gray-500 hover:text-gray-300 transition-colors">Expand all</button>
          <span className="text-gray-700">|</span>
          <button onClick={collapseAll} className="text-gray-500 hover:text-gray-300 transition-colors">Collapse all</button>
        </div>
      </div>

      {/* Indicator cards */}
      <div className="space-y-3">
        {filtered.map((indicator) => (
          <IndicatorCard
            key={indicator.id}
            indicator={indicator}
            isOpen={openIds.has(indicator.id)}
            onToggle={() => toggle(indicator.id)}
          />
        ))}
      </div>

      {/* Signal mapping section */}
      <section className="mt-10 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-blue-400">🏷️</span> Signal Labels Reference
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-dark-700 bg-dark-800/70 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">RSI Signal (original)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400">▼ Oversold</span>
                <span className="text-gray-400 text-xs">RSI &lt; 30</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-500/10 border border-gray-500/20">
                <span className="text-gray-400">Neutral</span>
                <span className="text-gray-400 text-xs">RSI 30–70</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400">▲ Overbought</span>
                <span className="text-gray-400 text-xs">RSI &gt; 70</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dark-700 bg-dark-800/70 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Strategy Signal (composite)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400">Strong Buy</span>
                <span className="text-gray-400 text-xs">Score ≥ +50</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <span className="text-emerald-300">Buy</span>
                <span className="text-gray-400 text-xs">Score +20 to +49</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-500/10 border border-gray-500/20">
                <span className="text-gray-400">Neutral</span>
                <span className="text-gray-400 text-xs">Score −19 to +19</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                <span className="text-red-300">Sell</span>
                <span className="text-gray-400 text-xs">Score −49 to −20</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="text-red-400">Strong Sell</span>
                <span className="text-gray-400 text-xs">Score ≤ −50</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Weight diagram */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-blue-400">⚖️</span> Strategy Weight Distribution
        </h2>
        <div className="rounded-xl border border-dark-700 bg-dark-800/70 p-5">
          <div className="space-y-3">
            {[
              { label: 'RSI 1h', weight: 2.0, color: 'bg-blue-500' },
              { label: 'RSI 15m', weight: 1.5, color: 'bg-blue-400' },
              { label: 'MACD', weight: 1.5, color: 'bg-blue-400' },
              { label: 'EMA Cross', weight: 1.5, color: 'bg-emerald-400' },
              { label: 'RSI 5m', weight: 1.0, color: 'bg-blue-300' },
              { label: 'Bollinger', weight: 1.0, color: 'bg-purple-400' },
              { label: 'Stoch RSI', weight: 1.0, color: 'bg-blue-300' },
              { label: 'RSI 1m', weight: 0.5, color: 'bg-blue-200' },
              { label: 'VWAP', weight: 0.5, color: 'bg-amber-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-24 text-right">{item.label}</span>
                <div className="flex-1 h-5 bg-dark-900/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} opacity-80 transition-all`}
                    style={{ width: `${(item.weight / 2.0) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 tabular-nums w-8">{item.weight}×</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            Total maximum weight: 10.5× (when all indicators have data). The score is normalized
            by dividing by total active weights, then clamped to [−100, +100]. Volume spikes
            amplify the raw score by 1.15× before normalization.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <footer className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 text-base">⚠️</span>
          <div className="text-sm text-amber-300/80 leading-relaxed">
            <strong className="text-amber-300">Disclaimer:</strong> These indicators and scores are mathematical calculations based on historical price data.
            They are not financial advice. Always do your own research and consider multiple factors before making trading decisions.
            Past performance does not guarantee future results. Trade responsibly.
          </div>
        </div>
      </footer>
    </div>
  );
}
