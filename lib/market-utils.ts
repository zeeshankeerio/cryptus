import type { ScreenerEntry } from './types';
import { 
  FOREX_SYMBOLS, 
  METALS_SYMBOLS, 
  STOCKS_SYMBOLS 
} from './asset-classes';

/**
 * Institutional Market Classification Engine
 * Categorizes symbols into Crypto, Metal, Forex, or Index.
 * Isolated from server-side dependencies to allow safe client-side usage.
 */
export function getMarketType(symbol: string): ScreenerEntry['market'] {
  const s = symbol.toUpperCase();
  
  // Metal Detection (Yahoo + Binance/Bybit linear + Energy futures)
  // All energy commodities (oil, gas) are classified as 'Metal' for RSI zone calibration
  // (Metal zones: 22/32/68/78 — appropriate for low-volatility commodity futures)
  const isMetal = METALS_SYMBOLS.some(m => m.yahoo === s || m.exchange === s) || 
                  [
                    // Gold tokenized on-chain
                    'PAXGUSDT', 'XAUTUSDT',
                    // Spot/futures aliases
                    'GOLD', 'SILVER', 'XAUUSD', 'XAGUSD',
                    // Yahoo futures
                    'GC=F', 'SI=F', 'PL=F', 'PA=F',
                    // Industrial metals
                    'HG=F', 'ALI=F',
                    // Energy (crude oil, gas)
                    'CL=F', 'BZ=F', 'NG=F',
                  ].includes(s);
  if (isMetal) return 'Metal';

  // Forex Detection (Yahoo + Major Crosses)
  const isForex = FOREX_SYMBOLS.some(f => f.yahoo === s) || 
                  ['EURUSDT', 'GBPUSDT', 'AUDUSDT', 'JPYUSDT', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY'].includes(s);
  if (isForex) return 'Forex';

  // Index Detection (Market indices and broad ETFs)
  const INDEX_TICKERS = ['SPX', 'NDAQ', 'DOW', 'FTSE', 'DAX', 'NKY', 'SPY', 'QQQ', 'DIA', 'VIX'];
  const isIndex = INDEX_TICKERS.includes(s);
  if (isIndex) return 'Index';

  // Stocks Detection (Individual equities)
  const STOCK_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
  const isStock = STOCKS_SYMBOLS.some(st => st.yahoo === s) || STOCK_TICKERS.includes(s);
  if (isStock) return 'Stocks';

  return 'Crypto';
}
