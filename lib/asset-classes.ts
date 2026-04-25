/**
 * RSIQ Pro — Multi-Asset Class Configuration
 *
 * Defines the asset classes, symbols, and data source routing for:
 * - Crypto (Binance/Bybit WebSocket — real-time)
 * - Forex (Yahoo Finance proxy — 5s polling)
 * - Metals (Bybit linear + Yahoo Finance — hybrid)
 * - Stocks (Yahoo Finance proxy — 5s polling)
 */

// ── Asset Class Definitions ──────────────────────────────────────

export type AssetClass = 'crypto' | 'forex' | 'metals' | 'stocks';

export interface AssetClassConfig {
  id: AssetClass;
  label: string;
  icon: string;
  description: string;
  dataSources: DataSourceType[];
  pollIntervalMs: number;
  symbols: string[];            // Yahoo Finance tickers
  exchangeSymbols?: string[];   // Binance/Bybit symbols (if applicable)
  marketHours?: { open: string; close: string; timezone: string };
}

export type DataSourceType = 'binance-ws' | 'bybit-ws' | 'yahoo-rest' | 'exchange-rest';

// ── Symbol Mappings ──────────────────────────────────────────────

export const FOREX_SYMBOLS = [
  { yahoo: 'EURUSD=X',  display: 'EUR/USD',  base: 'EUR', quote: 'USD' },
  { yahoo: 'GBPUSD=X',  display: 'GBP/USD',  base: 'GBP', quote: 'USD' },
  { yahoo: 'USDJPY=X',  display: 'USD/JPY',  base: 'USD', quote: 'JPY' },
  { yahoo: 'AUDUSD=X',  display: 'AUD/USD',  base: 'AUD', quote: 'USD' },
  { yahoo: 'USDCAD=X',  display: 'USD/CAD',  base: 'USD', quote: 'CAD' },
  { yahoo: 'USDCHF=X',  display: 'USD/CHF',  base: 'USD', quote: 'CHF' },
  { yahoo: 'NZDUSD=X',  display: 'NZD/USD',  base: 'NZD', quote: 'USD' },
  { yahoo: 'EURGBP=X',  display: 'EUR/GBP',  base: 'EUR', quote: 'GBP' },
  { yahoo: 'EURJPY=X',  display: 'EUR/JPY',  base: 'EUR', quote: 'JPY' },
  { yahoo: 'GBPJPY=X',  display: 'GBP/JPY',  base: 'GBP', quote: 'JPY' },
  { yahoo: 'AUDJPY=X',  display: 'AUD/JPY',  base: 'AUD', quote: 'JPY' },
  { yahoo: 'CADJPY=X',  display: 'CAD/JPY',  base: 'CAD', quote: 'JPY' },
  { yahoo: 'CHFJPY=X',  display: 'CHF/JPY',  base: 'CHF', quote: 'JPY' },
  { yahoo: 'EURAUD=X',  display: 'EUR/AUD',  base: 'EUR', quote: 'AUD' },
  { yahoo: 'EURCHF=X',  display: 'EUR/CHF',  base: 'EUR', quote: 'CHF' },
  { yahoo: 'GBPAUD=X',  display: 'GBP/AUD',  base: 'GBP', quote: 'AUD' },
  { yahoo: 'GBPCAD=X',  display: 'GBP/CAD',  base: 'GBP', quote: 'CAD' },
  { yahoo: 'GBPCHF=X',  display: 'GBP/CHF',  base: 'GBP', quote: 'CHF' },
  { yahoo: 'AUDCAD=X',  display: 'AUD/CAD',  base: 'AUD', quote: 'CAD' },
  { yahoo: 'AUDCHF=X',  display: 'AUD/CHF',  base: 'AUD', quote: 'CHF' },
];

export const METALS_SYMBOLS = [
  // ── Precious Metals ──────────────────────────────────────────────
  { yahoo: 'GC=F',   display: 'Gold (XAU)',     exchange: 'XAUUSDT', type: 'precious'   as const },
  // NOTE: Silver has NO Binance/Bybit equivalent (XAGUSDT does not exist). Yahoo-only.
  { yahoo: 'SI=F',   display: 'Silver (XAG)',    exchange: null,      type: 'precious'   as const },
  { yahoo: 'PL=F',   display: 'Platinum (XPT)',  exchange: null,      type: 'precious'   as const },
  { yahoo: 'PA=F',   display: 'Palladium (XPD)', exchange: null,      type: 'precious'   as const },
  // ── Industrial Metals ─────────────────────────────────────────────
  { yahoo: 'HG=F',   display: 'Copper (HG)',     exchange: null,      type: 'industrial' as const },
  { yahoo: 'ALI=F',  display: 'Aluminum',        exchange: null,      type: 'industrial' as const },
  // ── Energy / Crude Oil ────────────────────────────────────────────
  // Institutional benchmark: WTI & Brent are traded by the same desks as metals.
  // Yahoo Finance provides reliable 5m/1h futures data for both.
  { yahoo: 'CL=F',   display: 'WTI Crude Oil',   exchange: null,      type: 'energy'     as const },
  { yahoo: 'BZ=F',   display: 'Brent Crude',      exchange: null,      type: 'energy'     as const },
  { yahoo: 'NG=F',   display: 'Natural Gas',      exchange: null,      type: 'energy'     as const },
];

export const STOCKS_SYMBOLS = [
  // Mega Cap Tech
  { yahoo: 'AAPL',   display: 'Apple',         sector: 'Tech' },
  { yahoo: 'MSFT',   display: 'Microsoft',     sector: 'Tech' },
  { yahoo: 'GOOGL',  display: 'Alphabet',      sector: 'Tech' },
  { yahoo: 'AMZN',   display: 'Amazon',        sector: 'Tech' },
  { yahoo: 'NVDA',   display: 'NVIDIA',        sector: 'Tech' },
  { yahoo: 'META',   display: 'Meta',          sector: 'Tech' },
  { yahoo: 'TSLA',   display: 'Tesla',         sector: 'Tech' },
  { yahoo: 'AVGO',   display: 'Broadcom',      sector: 'Tech' },
  { yahoo: 'ORCL',   display: 'Oracle',        sector: 'Tech' },
  { yahoo: 'CRM',    display: 'Salesforce',    sector: 'Tech' },
  // Finance
  { yahoo: 'JPM',    display: 'JP Morgan',     sector: 'Finance' },
  { yahoo: 'V',      display: 'Visa',          sector: 'Finance' },
  { yahoo: 'MA',     display: 'Mastercard',    sector: 'Finance' },
  { yahoo: 'BAC',    display: 'Bank of America', sector: 'Finance' },
  { yahoo: 'GS',     display: 'Goldman Sachs', sector: 'Finance' },
  // Healthcare
  { yahoo: 'UNH',    display: 'UnitedHealth',  sector: 'Healthcare' },
  { yahoo: 'JNJ',    display: 'Johnson & J',   sector: 'Healthcare' },
  { yahoo: 'LLY',    display: 'Eli Lilly',     sector: 'Healthcare' },
  { yahoo: 'PFE',    display: 'Pfizer',        sector: 'Healthcare' },
  { yahoo: 'ABBV',   display: 'AbbVie',        sector: 'Healthcare' },
  // Consumer / Industrial
  { yahoo: 'WMT',    display: 'Walmart',       sector: 'Consumer' },
  { yahoo: 'PG',     display: 'P&G',           sector: 'Consumer' },
  { yahoo: 'KO',     display: 'Coca-Cola',     sector: 'Consumer' },
  { yahoo: 'DIS',    display: 'Disney',        sector: 'Consumer' },
  { yahoo: 'NKE',    display: 'Nike',          sector: 'Consumer' },
  // Indices (ETFs)
  { yahoo: 'SPY',    display: 'S&P 500',       sector: 'Index' },
  { yahoo: 'QQQ',    display: 'NASDAQ 100',    sector: 'Index' },
  { yahoo: 'DIA',    display: 'Dow Jones',     sector: 'Index' },
  { yahoo: 'IWM',    display: 'Russell 2000',  sector: 'Index' },
  { yahoo: 'VIX',    display: 'VIX',           sector: 'Index' },
];

// ── Asset Class Configs ──────────────────────────────────────────

export const ASSET_CLASSES: AssetClassConfig[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    icon: '₿',
    description: 'Real-time crypto screening via Binance & Bybit WebSocket',
    dataSources: ['binance-ws', 'bybit-ws'],
    pollIntervalMs: 0,  // Real-time WebSocket
    symbols: [],         // Managed by existing screener-service
  },
  {
    id: 'forex',
    label: 'Forex',
    icon: '💱',
    description: 'Major & cross currency pairs via Yahoo Finance',
    dataSources: ['yahoo-rest'],
    pollIntervalMs: 5000,
    symbols: FOREX_SYMBOLS.map(s => s.yahoo),
    marketHours: { open: '17:00', close: '17:00', timezone: 'America/New_York' }, // 24h Sun-Fri
  },
  {
    id: 'metals',
    label: 'Metals',
    icon: '🥇',
    description: 'Precious & industrial metals (Bybit + Yahoo Finance)',
    dataSources: ['bybit-ws', 'yahoo-rest'],
    pollIntervalMs: 5000,
    symbols: METALS_SYMBOLS.map(s => s.yahoo),
    exchangeSymbols: METALS_SYMBOLS.filter(s => s.exchange).map(s => s.exchange!),
  },
  {
    id: 'stocks',
    label: 'Stocks',
    icon: '📈',
    description: 'Top US stocks & indices via Yahoo Finance',
    dataSources: ['yahoo-rest'],
    pollIntervalMs: 10000,
    symbols: STOCKS_SYMBOLS.map(s => s.yahoo),
    marketHours: { open: '09:30', close: '16:00', timezone: 'America/New_York' },
  },
];

// ── Helper Functions ─────────────────────────────────────────────

export function getAssetClassConfig(id: AssetClass): AssetClassConfig {
  return ASSET_CLASSES.find(c => c.id === id) || ASSET_CLASSES[0];
}

export function getDisplayName(ticker: string, assetClass: AssetClass): string {
  if (assetClass === 'forex') {
    const match = FOREX_SYMBOLS.find(s => s.yahoo === ticker);
    return match?.display || ticker;
  }
  if (assetClass === 'metals') {
    const match = METALS_SYMBOLS.find(s => s.yahoo === ticker);
    return match?.display || ticker;
  }
  if (assetClass === 'stocks') {
    const match = STOCKS_SYMBOLS.find(s => s.yahoo === ticker);
    return match?.display || ticker;
  }
  return ticker;
}

export function isMarketOpen(config: AssetClassConfig): boolean {
  if (!config.marketHours) return true; // 24/7 for crypto
  // Forex is effectively 24/5 (Sun 5pm - Fri 5pm ET)
  const now = new Date();
  const day = now.getUTCDay();
  if (config.id === 'forex') return day >= 0 && day <= 5; // Mon-Fri + Sunday evening
  if (config.id === 'stocks') return day >= 1 && day <= 5; // Mon-Fri only
  return true;
}
