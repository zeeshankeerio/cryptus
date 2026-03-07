// ── Screener domain types ──

export interface ScreenerEntry {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  signal: 'oversold' | 'overbought' | 'neutral';
  updatedAt: number;
}

export interface ScreenerResponse {
  data: ScreenerEntry[];
  meta: {
    total: number;
    oversold: number;
    overbought: number;
    computeTimeMs: number;
    fetchedAt: number;
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

export type SortKey = 'symbol' | 'price' | 'change24h' | 'volume24h' | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'signal';
export type SortDir = 'asc' | 'desc';
export type SignalFilter = 'all' | 'oversold' | 'overbought' | 'neutral';
