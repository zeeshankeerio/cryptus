/**
 * Twelve Data Source (Fallback)
 * FREE tier: 800 calls/day, 8 calls/min
 * Provides: Intraday time series for Forex, Metals, Stocks, Crypto
 * 
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 */

interface TwelveDataCandle {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface TwelveDataResponse {
  symbol: string;
  interval: string;
  candles: TwelveDataCandle[];
  lastRefreshed: number;
}

class TwelveDataClient {
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';
  private callCount = 0;
  private callResetTime = Date.now() + 60000;
  private dailyCallCount = 0;
  private dailyResetTime = Date.now() + 86400000;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[TwelveData] Client initialized');
  }
  
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
    if (this.callCount >= 8) {
      console.warn('[TwelveData] Minute rate limit reached (8/min)');
      return false;
    }
    
    if (this.dailyCallCount >= 800) {
      console.warn('[TwelveData] Daily rate limit reached (800/day)');
      return false;
    }
    
    return true;
  }
  
  async getTimeSeries(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '1h',
    outputSize: number = 100
  ): Promise<TwelveDataResponse | null> {
    if (!this.checkRateLimit()) {
      return null;
    }
    
    try {
      const params = new URLSearchParams({
        symbol: this.convertSymbol(symbol),
        interval,
        outputsize: outputSize.toString(),
        apikey: this.apiKey,
      });
      
      const url = `${this.baseUrl}/time_series?${params}`;
      const res = await fetch(url, { 
        signal: AbortSignal.timeout(10000),
      });
      
      if (!res.ok) {
        console.error('[TwelveData] HTTP error:', res.status);
        return null;
      }
      
      const data = await res.json();
      this.callCount++;
      this.dailyCallCount++;
      
      if (data.status === 'error') {
        console.warn('[TwelveData] API error:', data.message);
        return null;
      }
      
      if (!data.values || !Array.isArray(data.values)) {
        console.warn('[TwelveData] No values in response for', symbol);
        return null;
      }
      
      // Validate and convert candles
      const candles: TwelveDataCandle[] = data.values
        .filter((v: any) => {
          const close = parseFloat(v.close);
          return Number.isFinite(close) && close > 0;
        })
        .reverse(); // Twelve Data returns newest first, we want oldest first
      
      console.log(`[TwelveData] Fetched ${candles.length} candles for ${symbol} (${interval})`);
      
      return {
        symbol,
        interval,
        candles,
        lastRefreshed: Date.now(),
      };
    } catch (error) {
      console.error('[TwelveData] Fetch error:', error);
      return null;
    }
  }
  
  private convertSymbol(symbol: string): string {
    // Forex: EUR/USD (already correct format for Twelve Data)
    if (symbol.includes('/')) return symbol;
    
    // Metals: GC=F → XAU/USD, SI=F → XAG/USD, etc.
    if (symbol === 'GC=F') return 'XAU/USD';
    if (symbol === 'SI=F') return 'XAG/USD';
    if (symbol === 'PL=F') return 'XPT/USD';
    if (symbol === 'PA=F') return 'XPD/USD';
    if (symbol === 'HG=F') return 'XCU/USD';
    
    // Stocks/Indices: pass through
    return symbol;
  }
  
  getStats() {
    return {
      callsThisMinute: this.callCount,
      callsToday: this.dailyCallCount,
      minuteLimit: 8,
      dailyLimit: 800,
      minuteRemaining: 8 - this.callCount,
      dailyRemaining: 800 - this.dailyCallCount,
    };
  }
}

let twelveDataClient: TwelveDataClient | null = null;

export function getTwelveDataClient(): TwelveDataClient | null {
  if (typeof window !== 'undefined') {
    console.warn('[TwelveData] Client should only be used server-side');
    return null;
  }
  
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[TwelveData] API key not configured');
    return null;
  }
  
  if (!twelveDataClient) {
    twelveDataClient = new TwelveDataClient(apiKey);
  }
  
  return twelveDataClient;
}
