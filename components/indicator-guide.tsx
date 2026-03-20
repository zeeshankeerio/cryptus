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
  { key: 'momentum', label: 'Momentum', color: 'text-[#39FF14] border-[#39FF14]/40 bg-[#39FF14]/10' },
  { key: 'trend', label: 'Trend', color: 'text-[#39FF14] border-[#39FF14]/40 bg-[#39FF14]/10' },
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
    tagColor: 'text-[#39FF14]',
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
      { name: 'Data source', value: 'Real-time WebSocket', description: 'Approximated client-side for sub-second precision' },
    ],
    interpretation: [
      { condition: 'RSI ≤ 20', meaning: 'Deeply oversold — strong buy signal', color: 'text-[#39FF14]' },
      { condition: 'RSI ≤ 30', meaning: 'Oversold — potential reversal zone', color: 'text-[#39FF14]/80' },
      { condition: 'RSI 30–70', meaning: 'Neutral — no extreme condition', color: 'text-gray-400' },
      { condition: 'RSI ≥ 70', meaning: 'Overbought — potential reversal zone', color: 'text-[#FF4B5C]/80' },
      { condition: 'RSI ≥ 80', meaning: 'Deeply overbought — strong sell signal', color: 'text-[#FF4B5C]' },
    ],
    usage: 'The screener computes RSI across 4 timeframes simultaneously. 1m RSI captures scalping opportunities, while 1h RSI reveals macro trends. RSI-based signals use a fallback chain: 15m → 5m → 1m based on data availability.',
  },
  {
    id: 'rsi-divergence',
    name: 'RSI Divergence',
    icon: '📉',
    category: 'momentum',
    tagColor: 'text-[#39FF14]',
    summary: 'Detects discrepancies between price action and RSI momentum. A powerful reversal indicator that often precedes significant trend shifts.',
    formula: [
      'Bullish: Price makes Lower Low while RSI makes Higher Low',
      'Bearish: Price makes Higher High while RSI makes Lower High',
      'Lookback: 40 candles (15m timeframe)',
      'Tolerance: +1/-1 buffer on RSI swing points',
    ],
    parameters: [
      { name: 'Timeframe', value: '15m', description: 'Primary timeframe for swing point detection' },
      { name: 'Period', value: '14', description: 'Underlying RSI period' },
      { name: 'Lookback', value: '40', description: 'Comparison window for swing detection' },
    ],
    interpretation: [
      { condition: 'Bullish Divergence', meaning: 'Exhausted selling pressure — potential upward reversal', color: 'text-[#39FF14]' },
      { condition: 'Bearish Divergence', meaning: 'Exhausted buying pressure — potential downward reversal', color: 'text-[#FF4B5C]' },
    ],
    usage: 'Divergence is weighted heavily (1.5x) in the strategy score. It is most effective when confirmed by an RSI reading in oversold or overbought territory. Look for divergence icons (▲/▼) in the screener table.',
  },
  {
    id: 'ema-cross',
    name: 'EMA Cross (9/21)',
    icon: '📈',
    category: 'trend',
    tagColor: 'text-[#39FF14]',
    summary: 'Detects trend direction using the relationship between fast (9) and slow (21) Exponential Moving Averages on 15-minute candles.',
    formula: [
      'EMA = Price × k + EMA_prev × (1 − k)',
      'k = 2 / (period + 1)',
      'Bullish Cross: EMA9 crosses above EMA21',
      'Bearish Cross: EMA9 crosses below EMA21',
      'Trend: EMA9 > EMA21 → Bullish, EMA9 < EMA21 → Bearish',
    ],
    parameters: [
      { name: 'Fast Period', value: '9', description: 'Responsive to recent price action' },
      { name: 'Slow Period', value: '21', description: 'Smooths out short-term noise' },
      { name: 'Timeframe', value: '15m candles', description: 'Aggregated from 1-minute klines' },
    ],
    interpretation: [
      { condition: '▲ Bullish', meaning: 'Fast EMA above slow EMA — uptrend', color: 'text-[#39FF14]' },
      { condition: '▼ Bearish', meaning: 'Fast EMA below slow EMA — downtrend', color: 'text-[#FF4B5C]' },
    ],
    usage: 'EMA Cross provides trend context. In the composite strategy, a current bullish trend contributes a steady +60 points to the buy score, while a bearish trend subtracts -60.',
  },
  {
    id: 'macd',
    name: 'MACD (histogram)',
    icon: '🔀',
    category: 'momentum',
    tagColor: 'text-blue-400',
    summary: 'Tracks trend acceleration using the difference between 12 and 26 EMAs. The histogram is price-normalized to allow comparison between high and low-priced assets.',
    formula: [
      'MACD Line = EMA(12) − EMA(26)',
      'Signal Line = EMA(9) of MACD Line',
      'Histogram = MACD Line − Signal Line',
      'Normalized = (Histogram / Current Price) × 100',
    ],
    parameters: [
      { name: 'Fast EMA', value: '12', description: 'Standard fast period' },
      { name: 'Slow EMA', value: '26', description: 'Standard slow period' },
      { name: 'Histogram Scale', value: 'Price %', description: 'Native normalization for cross-asset fairness' },
    ],
    interpretation: [
      { condition: 'Histogram > 0', meaning: 'Bullish momentum — trend accelerating upwards', color: 'text-[#39FF14]' },
      { condition: 'Histogram < 0', meaning: 'Bearish momentum — trend accelerating downwards', color: 'text-[#FF4B5C]' },
    ],
    usage: 'Normalization ensures that a $1.0 fluctuation in BTC (0.001%) doesn\'t generate a stronger signal than a $1.0 fluctuation in ETH (0.04%). This is critical for scanning 500+ diverse pairs.',
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands',
    icon: '📏',
    category: 'volatility',
    tagColor: 'text-purple-400',
    summary: 'Measures standard deviation relative to a 20-period moving average. The "Position" metric (0–1) identifies where price sits within its expected volatility range.',
    formula: [
      'Middle Band = SMA(20)',
      'Upper Band = Middle + 2 × StdDev',
      'Lower Band = Middle − 2 × StdDev',
      'Position = (Price − Lower) / (Upper − Lower)',
    ],
    parameters: [
      { name: 'Period', value: '20', description: 'Standard lookback window' },
      { name: 'Std Dev', value: '2.0', description: 'Band width multiplier' },
    ],
    interpretation: [
      { condition: 'Position ≤ 0.10', meaning: 'Touch lower band — strongly oversold', color: 'text-emerald-400' },
      { condition: 'Position ≥ 0.90', meaning: 'Touch upper band — strongly overbought', color: 'text-red-400' },
    ],
    usage: 'Bollinger "Squeezes" often precede massive breakouts. Use the position metric to identify mean-reversion opportunities during ranging markets.',
  },
  {
    id: 'adx',
    name: 'ADX (Trend Strength)',
    icon: '🔱',
    category: 'trend',
    tagColor: 'text-purple-400',
    summary: 'Calculates the strength of the current trend regardless of direction. Helps traders determine if the market is trending or ranging (choppy).',
    formula: [
      'ATR = Wilder\'s Smoothed True Range',
      '+DI = (Smoothed +DM / ATR) × 100',
      '-DI = (Smoothed -DM / ATR) × 100',
      'DX = (abs(+DI − -DI) / (+DI + -DI)) × 100',
      'ADX = SMA(DX, 14)',
    ],
    parameters: [
      { name: 'Period', value: '14', description: 'Standard Wilder duration' },
      { name: 'Threshold', value: '25', description: 'Minimum level to consider the market "trending"' },
    ],
    interpretation: [
      { condition: 'ADX > 25', meaning: 'Strong trend in progress — momentum strategies work best', color: 'text-[#39FF14]' },
      { condition: 'ADX < 20', meaning: 'Weak trend / Ranging — avoid breakout strategies', color: 'text-slate-500' },
      { condition: 'ADX > 50', meaning: 'Extremely strong trend — caution for blow-off tops', color: 'text-amber-400' },
    ],
    usage: 'ADX is non-directional. A high ADX in a bearish EMA trend confirms a powerful downtrend. Use it to filter out "fakeout" moves in low-volatility environments.',
  },
  {
    id: 'atr',
    name: 'ATR (Volatility)',
    icon: '📏',
    category: 'volatility',
    tagColor: 'text-purple-400',
    summary: 'Measures current market volatility in absolute price terms. Used primarily for dynamic stop-loss positioning and risk management.',
    formula: [
      'TR = max(H−L, abs(H−C_prev), abs(L−C_prev))',
      'ATR = Wilder\'s Smoothed Average of TR',
    ],
    parameters: [
      { name: 'Period', value: '14', description: 'Standard lookback' },
    ],
    interpretation: [
      { condition: 'High ATR', meaning: 'Expanding volatility — widen stop-losses', color: 'text-[#39FF14]' },
      { condition: 'Low ATR', meaning: 'Consolidating — market is "quiet" before potential move', color: 'text-slate-500' },
    ],
    usage: 'Professional traders often set their stop-losses at 1.5x or 2.0x ATR from their entry price to ensure they are not stopped out by normal market noise.',
  },
  {
    id: 'long-candle',
    name: 'Long Candle Indicator',
    icon: '⚡',
    category: 'volatility',
    tagColor: 'text-amber-400',
    summary: 'Acts like a "Price Speedometer." It measures how fast the current 1-minute candle is growing compared to its recent history. It helps you spot sudden "bursts" of price movement before they become obvious on standard charts.',
    formula: [
      'Avg Bar Size = Typical movement over last 20 minutes',
      'Current Size = How much the price has moved since this minute started',
      'Ratio = Current Growth / Normal Growth',
    ],
    parameters: [
      { name: 'Baseline', value: '20 candles', description: 'The "Normal" speed of the market' },
      { name: 'Warning', value: '2.5×', description: 'Price is moving 2.5x faster than normal' },
      { name: 'Alert', value: '5.0×', description: 'Extreme speed — often indicates a major breakout' },
    ],
    interpretation: [
      { condition: 'Ratio ≥ 2.5×', meaning: 'The market is waking up — price is stretching faster than usual.', color: 'text-amber-400' },
      { condition: 'Ratio ≥ 5.0×', meaning: 'High Intensity — a major "Power Move" is happening. Great for momentum traders.', color: 'text-amber-500 font-bold' },
    ],
    usage: 'Use this to catch "Pumps" or "Dumps" early. If you see a green flash (🟢) with a high ratio, it means buyers are aggressive. If you see red (🔴), sellers are in control. It is updated every second, giving you an edge over traders using static charts.',
  },
  {
    id: 'vwap',
    name: 'VWAP',
    icon: '💹',
    category: 'volume',
    tagColor: 'text-amber-400',
    summary: 'Institutional benchmark that calculates average price weighted by volume. Resets daily at UTC midnight.',
    formula: [
      'Typical Price (TP) = (H+L+C)/3',
      'VWAP = Σ(TP × Vol) / Σ(Vol)',
    ],
    parameters: [
      { name: 'Reset', value: 'UTC 00:00', description: 'Daily session restart' },
    ],
    interpretation: [
      { condition: 'Price < VWAP (-2%)', meaning: 'Trading at a discount — bullish accumulation', color: 'text-[#39FF14]' },
      { condition: 'Price > VWAP (+2%)', meaning: 'Trading at a premium — bearish distribution', color: 'text-[#FF4B5C]' },
    ],
    usage: 'Price trading significantly below VWAP in an uptrend is a high-probability "dip buying" setup.',
  },
  {
    id: 'volume-spike',
    name: 'Volume Spike',
    icon: '🔥',
    category: 'volume',
    tagColor: 'text-amber-400',
    summary: 'Think of this as "Crowd Intensity." It detects when a massive amount of trading activity suddenly hits a coin. It separates "real moves" from "fakeouts" by showing if big money is participating.',
    formula: [
      'Normal Activity = Average volume of the last 20 minutes',
      'Current Activity = Total volume traded in the current minute',
      'Spike = Current Activity is 2.0x higher than normal',
    ],
    parameters: [
      { name: 'Threshold', value: '2.0×', description: 'Minimum activity to be considered a "Spike"' },
    ],
    interpretation: [
      { condition: 'Spike (🔥)', meaning: 'Big institutions or "Whales" are active. This validates the current price direction.', color: 'text-amber-400' },
    ],
    usage: 'A price move means nothing without Volume. If price goes up BUT there is no Volume Spike, it might be a trap. If price goes up AND a Volume Spike (🔥) appears, it confirms that the "Big Players" are buying with you.',
  },
  {
    id: 'confluence',
    name: 'Multi-TF Confluence',
    icon: '🎯',
    category: 'strategy',
    tagColor: 'text-rose-400',
    summary: 'A meta-indicator that measures how many different timeframes and technical tools agree on the current market direction.',
    formula: [
      'Timeframes: 1m, 5m, 15m, 1h',
      'Agreement = (Bullish Weights − Bearish Weights) / Total Weights',
      'Scale: -100 to +100',
    ],
    parameters: [
      { name: 'Bullish Filter', value: 'RSI < 40, EMA UP, MACD > 0, BB < 0.3', description: 'Aligned factors' },
    ],
    interpretation: [
      { condition: 'Score ≥ +25', meaning: 'Bullish Alignment', color: 'text-[#39FF14]' },
      { condition: 'Score ≥ +60', meaning: 'Strong Bullish Alignment — High Conviction', color: 'text-[#39FF14] font-bold' },
    ],
    usage: 'Confluence filters out "false signals" where one timeframe is bullish but the rest are bearish. It is weighted heavily (2.0x) in the final strategy score.',
  },
  {
    id: 'strategy',
    name: 'Strategy Score',
    icon: '⚖️',
    category: 'strategy',
    tagColor: 'text-rose-400',
    summary: 'The ultimate composite score. Combines momentum, trend, volatility, and volume into a single "Confidence Factor" for decision making.',
    formula: [
      'Score = Σ(Indicator × Weight) / Σ(Weights)',
      'Indicator normalization: readings converted to -100...+100',
      'Volume Spike: 1.15× raw score multiplier',
      'Damping: Factors < 3 → -30% score penalty',
    ],
    parameters: [
      { name: 'RSI 1h', value: '2.0x', description: 'Macro-trend anchor' },
      { name: 'EMA/MACD', value: '1.5x', description: 'Core trend & momentum' },
      { name: 'Confluence', value: '2.0x', description: 'Weighted cross-check' },
      { name: 'Divergence', value: '1.5x', description: 'Reversal confirmation' },
    ],
    interpretation: [
      { condition: 'Score ≥ +50', meaning: 'Strong Buy — Full System Alignment', color: 'text-[#39FF14]' },
      { condition: 'Score ≤ -50', meaning: 'Strong Sell — Full System Alignment', color: 'text-[#FF4B5C]' },
    ],
    usage: 'Sort the screener by Strategy Score to find assets where multiple deep technical systems are in agreement. This minimizes risk by avoiding isolated indicators.',
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
              <td className="py-2.5 pr-4 text-[#39FF14] font-mono whitespace-nowrap">{p.value}</td>
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
          <div className="p-3.5 rounded-lg border-[#39FF14]/20 bg-[#39FF14]/5">
            <div className="flex items-start gap-2">
              <span className="text-[#39FF14] text-sm mt-0.5">💡</span>
              <p className="text-sm text-[#39FF14]/80 leading-relaxed">{indicator.usage}</p>
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
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#39FF14] transition-colors mb-4"
        >
          ← Back to Screener
        </Link>

        <div className="rounded-2xl border border-dark-700 bg-gradient-to-r from-dark-900 via-dark-800 to-dark-900 p-5 sm:p-6 shadow-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-dark-600 bg-dark-800/80 px-2.5 py-1 text-[11px] tracking-wide text-gray-400 uppercase mb-3">
            Reference Guide
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white flex items-center gap-2.5 tracking-tight">
            <span className="text-[#39FF14]">📖</span>
            <span>Indicator & Strategy Guide</span>
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl leading-relaxed">
            Complete reference for every technical indicator, signal logic, and the composite strategy scoring
            system used in the RSIQ Pro. Understand exactly how buy/sell decisions are calculated.
          </p>
        </div>
      </header>

      {/* Data pipeline overview */}
      <section className="mb-8 rounded-xl border border-dark-700 bg-dark-800/40 p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-[#39FF14]">⚡</span> Data Pipeline
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Source</div>
            <div className="text-white font-medium">Paid WebSocket</div>
            <div className="text-gray-400 text-xs mt-1">Live prices via <code className="text-[#39FF14]">!miniTicker@arr</code> stream — sub-second price updates for all tracked pairs</div>
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
                ? 'bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/40'
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

      {/* Global Settings & Performance */}
      <section className="mt-12 mb-10 border-t border-dark-700 pt-10">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <span className="text-[#39FF14]">⚙️</span> Global Analysis & Settings
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-wider">Alert Modes</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
                <div className="font-medium text-white text-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Extreme RSI Mode
                </div>
                <p className="text-xs text-gray-400 mt-1">Filters the entire market to show ONLY assets with RSI &lt; 20 or &gt; 80. Ideal for reversal hunting in high-traffic sessions.</p>
              </div>
              <div className="p-3 rounded-lg bg-dark-900/60 border border-dark-700">
                <div className="font-medium text-white text-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Real-Time Pulse Alerts
                </div>
                <p className="text-xs text-gray-400 mt-1">Get notified the instant a coin starts moving abnormally. This alerts you to massive volume surges or extreme price jumps, even if the RSI isn't yet in an overbought or oversold zone.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-wider">The "Smart Mode" Engine</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              To handle 600+ assets in real-time without hitting exchange rate limits, RSIQ Pro uses a tiered data pipeline:
            </p>
            <ul className="space-y-2">
              <li className="flex gap-2 text-xs text-gray-300">
                <span className="text-[#39FF14] font-bold">1.</span>
                <span><strong>Priority Coins:</strong> Coins in your watchlist or with active signals get a 30s refresh rate.</span>
              </li>
              <li className="flex gap-2 text-xs text-gray-300">
                <span className="text-[#39FF14] font-bold">2.</span>
                <span><strong>Ticker-Only:</strong> Lower volume coins use a 2-minute refresh for indicators while price/volatility remains sub-second.</span>
              </li>
              <li className="flex gap-2 text-xs text-gray-300">
                <span className="text-[#39FF14] font-bold">3.</span>
                <span><strong>Baseline Health:</strong> If a coin is in ticker-only mode, the system uses "Baseline Caching" to ensure volatility ratios remain accurate.</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-5 space-y-4 md:col-span-2">
            <h3 className="text-sm font-semibold text-[#39FF14] uppercase tracking-wider">Per-Coin Customization</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                Click the <span className="text-[#39FF14]">⚙️</span> icon on any asset row to open its specific settings. You can override global thresholds for that specific coin:
              </p>
              <ul className="space-y-2">
                <li className="text-xs text-gray-300 flex items-start gap-2">
                  <span className="text-[#39FF14]">•</span>
                  <span><strong>RSI Period:</strong> Use 7 for high sensitivity or 21 for trend smoothing on specific assets.</span>
                </li>
                <li className="text-xs text-gray-300 flex items-start gap-2">
                  <span className="text-[#39FF14]">•</span>
                  <span><strong>Volatility Multipliers:</strong> Tighten thresholds for stable assets (e.g. 2.0x) or loosen for "pump-and-dump" coins (e.g. 10.0x).</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Signal mapping section */}
      <section className="mt-10 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-[#39FF14]">🏷️</span> Signal Labels Reference
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">RSI Signal (original)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20">
                <span className="text-[#39FF14]">▼ Oversold</span>
                <span className="text-gray-400 text-xs">RSI &lt; 30</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-500/10 border border-gray-500/20">
                <span className="text-gray-400">Neutral</span>
                <span className="text-gray-400 text-xs">RSI 30–70</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#FF4B5C]/10 border border-[#FF4B5C]/20">
                <span className="text-[#FF4B5C]">▲ Overbought</span>
                <span className="text-gray-400 text-xs">RSI &gt; 70</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Strategy Signal (composite)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#39FF14]/10 border border-[#39FF14]/20">
                <span className="text-[#39FF14]">Strong Buy</span>
                <span className="text-gray-400 text-xs">Score ≥ +50</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#39FF14]/5 border border-[#39FF14]/15">
                <span className="text-[#39FF14]/80">Buy</span>
                <span className="text-gray-400 text-xs">Score +20 to +49</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-500/10 border border-gray-500/20">
                <span className="text-gray-400">Neutral</span>
                <span className="text-gray-400 text-xs">Score −19 to +19</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#FF4B5C]/5 border border-[#FF4B5C]/15">
                <span className="text-[#FF4B5C]/80">Sell</span>
                <span className="text-gray-400 text-xs">Score −49 to −20</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#FF4B5C]/10 border border-[#FF4B5C]/20">
                <span className="text-[#FF4B5C]">Strong Sell</span>
                <span className="text-gray-400 text-xs">Score ≤ −50</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Weight diagram */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-[#39FF14]">⚖️</span> Strategy Weight Distribution
        </h2>
        <div className="rounded-xl border border-dark-700 bg-dark-800/40 p-5">
          <div className="space-y-3">
            {[
              { label: 'RSI 1h', weight: 2.0, color: 'bg-[#39FF14]' },
              { label: 'Confluence', weight: 2.0, color: 'bg-rose-400' },
              { label: 'RSI 15m', weight: 1.5, color: 'bg-[#39FF14]/80' },
              { label: 'MACD', weight: 1.5, color: 'bg-blue-400' },
              { label: 'EMA Cross', weight: 1.5, color: 'bg-[#39FF14]/70' },
              { label: 'RSI Divergence', weight: 1.5, color: 'bg-[#39FF14]/90' },
              { label: 'RSI 5m', weight: 1.0, color: 'bg-[#39FF14]/40' },
              { label: 'Bollinger', weight: 1.0, color: 'bg-purple-400' },
              { label: 'Stoch RSI', weight: 1.0, color: 'bg-[#39FF14]/30' },
              { label: 'VWAP', weight: 0.5, color: 'bg-amber-400' },
              { label: 'Momentum', weight: 0.5, color: 'bg-blue-300' },
              { label: 'RSI 1m', weight: 0.5, color: 'bg-[#39FF14]/20' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm text-gray-300 w-28 text-right shrink-0">{item.label}</span>
                <div className="flex-1 h-5 bg-dark-900/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} opacity-80 transition-all`}
                    style={{ width: `${(item.weight / 2.0) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 tabular-nums w-8 shrink-0">{item.weight}×</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4 leading-relaxed">
            Total potential weight: 14.5× (when/if all 12 indicators have data). The score is normalized 
            by dividing by the sum of currently available indicators, then clamped to [−100, +100]. 
            Volume spikes apply a 1.15× amplifier to the raw result before normalization. Deeply 
            limited data (factors &lt; 3) triggers a signal damping penalty.
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
