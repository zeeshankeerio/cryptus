/**
 * Alpha Vantage Data Source
 * FREE tier: 25 calls/day, 5 calls/min
 * Provides: Intraday candles (1min, 5min, 15min, 30min, 60min)
 * 
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 */

interface AlphaVantageCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AlphaVantageResponse {
  symbol: string;
  interval: '1min' | '5min' | '15min' | '30min' | '60min';
  candles: AlphaVantageCandle[];
  lastRefreshed: number;
}

class AlphaVantageClient {
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';
  private callCount = 0;
  private callResetTime = Date.now() + 60000; // 1 minute window
  private dailyCallCount = 0;
  private dailyResetTime = Date.now() + 86400000; // 24 hours
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[AlphaVantage] Client initialized');
  }
  
  // Rate limit check (5 calls/min, 25 calls/day)
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // Reset minute counter
    if (now > this.callResetTime) {
      this.callCount = 0;
      this.callResetTime = now + 60000;
    }
    
    // Reset daily counter
    if (now > this.dailyResetTime) {
      this.dailyCallCount = 0;
      this.dailyResetTime = now + 86400000;
    }
    
    // Check limits
    if (this.callCount >= 5) {
      console.warn('[AlphaVantage] Minute rate limit reached (5/min)');
      return false;
    }
    
    if (this.dailyCallCount >= 25) {
      console.warn('[AlphaVantage] Daily rate limit reached (25/day)');
      return false;
    }
    
    return true;
  }
  
  async getIntradayCandles(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '60min',
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<AlphaVantageResponse | null> {
    if (!this.checkRateLimit()) {
      return null;
    }
    
    try {
      const params = new URLSearchParams({
        function: 'TIME_SERIES_INTRADAY',
        symbol: this.convertSymbol(symbol),
        interval,
        outputsize: outputSize, // compact = last 100 data points, full = 30 days
        apikey: this.apiKey,
      });
      
      const url = `${this.baseUrl}?${params}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) {
        console.error('[AlphaVantage] HTTP error:', res.status);
        return null;
      }
      
      const data = await res.json();
      this.callCount++;
      this.dailyCallCount++;
      
      // Check for API limit message
      if (data['Note']) {
        console.warn('[AlphaVantage] API limit message:', data['Note']);
        return null;
      }
      
      if (data['Information']) {
        console.warn('[AlphaVantage] API info:', data['Information']);
        return null;
      }
      
      if (data['Error Message']) {
        console.error('[AlphaVantage] API error:', data['Error Message']);
        return null;
      }
      
      const timeSeries = data[`Time Series (${interval})`];
      if (!timeSeries) {
        console.warn('[AlphaVantage] No time series data for', symbol);
        return null;
      }
      
      const candles: AlphaVantageCandle[] = [];
      for (const [timestamp, values] of Object.entries(timeSeries)) {
        const candle = {
          timestamp: new Date(timestamp).getTime(),
          open: parseFloat((values as any)['1. open']),
          high: parseFloat((values as any)['2. high']),
          low: parseFloat((values as any)['3. low']),
          close: parseFloat((values as any)['4. close']),
          volume: parseFloat((values as any)['5. volume']),
        };
        
        // Validate candle data
        if (
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close) &&
          candle.open > 0 &&
          candle.high > 0 &&
          candle.low > 0 &&
          candle.close > 0
        ) {
          candles.push(candle);
        }
      }
      
      // Sort by timestamp (oldest first)
      candles.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`[AlphaVantage] Fetched ${candles.length} candles for ${symbol} (${interval})`);
      
      return {
        symbol,
        interval,
        candles,
        lastRefreshed: Date.now(),
      };
    } catch (error) {
      console.error('[AlphaVantage] Fetch error:', error);
      return null;
    }
  }
  
  // Convert our symbols to Alpha Vantage format
  private convertSymbol(symbol: string): string {
    // Forex: EUR/USD → EURUSD
    if (symbol.includes('/')) {
      return symbol.replace('/', '');
    }
    
    // Metals: GC=F → GOLD, SI=F → SILVER, etc.
    if (symbol === 'GC=F') return 'GOLD';
    if (symbol === 'SI=F') return 'SILVER';
    if (symbol === 'PL=F') return 'PLATINUM';
    if (symbol === 'PA=F') return 'PALLADIUM';
    if (symbol === 'HG=F') return 'COPPER';
    
    // Stocks/Indices: pass through
    return symbol;
  }
  
  getStats() {
    return {
      callsThisMinute: this.callCount,
      callsToday: this.dailyCallCount,
      minuteLimit: 5,
      dailyLimit: 25,
      minuteRemaining: 5 - this.callCount,
      dailyRemaining: 25 - this.dailyCallCount,
    };
  }
}

// Singleton instance
let alphaVantageClient: AlphaVantageClient | null = null;

export function getAlphaVantageClient(): AlphaVantageClient | null {
  if (typeof window !== 'undefined') {
    console.warn('[AlphaVantage] Client should only be used server-side');
    return null;
  }
  
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('[AlphaVantage] API key not configured');
    return null;
  }
  
  if (!alphaVantageClient) {
    alphaVantageClient = new AlphaVantageClient(apiKey);
  }
  
  return alphaVantageClient;
}
