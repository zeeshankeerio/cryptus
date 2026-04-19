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
  
  // Metal Detection (Yahoo + Binance/Bybit linear)
  const isMetal = METALS_SYMBOLS.some(m => m.yahoo === s || m.exchange === s) || 
                  ['PAXGUSDT', 'XAUTUSDT', 'GOLD', 'SILVER', 'XAUUSD', 'XAGUSD', 'GC=F', 'SI=F', 'PL=F', 'PA=F', 'HG=F'].includes(s);
  if (isMetal) return 'Metal';

  // Forex Detection (Yahoo + Major Crosses)
  const isForex = FOREX_SYMBOLS.some(f => f.yahoo === s) || 
                  ['EURUSDT', 'GBPUSDT', 'AUDUSDT', 'JPYUSDT', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'EURJPY', 'GBPJPY', 'CADJPY', 'AUDJPY'].includes(s);
  if (isForex) return 'Forex';

  // Stocks / Indices (Yahoo + Aggressive Tech)
  const isIndex = STOCKS_SYMBOLS.some(st => st.yahoo === s) || 
                  ['SPX', 'NDAQ', 'DOW', 'FTSE', 'DAX', 'NKY', 'SPY', 'QQQ', 'DIA', 'VIX', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'].includes(s);
  if (isIndex) return 'Index';

  return 'Crypto';
}
