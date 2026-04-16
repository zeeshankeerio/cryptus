/**
 * Mindscape Analytics — Universal Symbol Alias Registry
 *
 * Resolves raw API tickers (Binance, Bybit, Yahoo Finance) into
 * premium, human-readable display names across all asset classes.
 */

// ── Yahoo Finance → Display Name Mappings ────────────────────────

const YAHOO_ALIASES: Record<string, string> = {
  // Forex Majors & Crosses
  'EURUSD=X':  'EUR/USD',
  'GBPUSD=X':  'GBP/USD',
  'USDJPY=X':  'USD/JPY',
  'AUDUSD=X':  'AUD/USD',
  'USDCAD=X':  'USD/CAD',
  'USDCHF=X':  'USD/CHF',
  'NZDUSD=X':  'NZD/USD',
  'EURGBP=X':  'EUR/GBP',
  'EURJPY=X':  'EUR/JPY',
  'GBPJPY=X':  'GBP/JPY',
  'AUDJPY=X':  'AUD/JPY',
  'CADJPY=X':  'CAD/JPY',
  'CHFJPY=X':  'CHF/JPY',
  'EURAUD=X':  'EUR/AUD',
  'EURCHF=X':  'EUR/CHF',
  'GBPAUD=X':  'GBP/AUD',
  'GBPCAD=X':  'GBP/CAD',
  'GBPCHF=X':  'GBP/CHF',
  'AUDCAD=X':  'AUD/CAD',
  'AUDCHF=X':  'AUD/CHF',

  // Precious Metals (Futures)
  'GC=F':  'Gold (XAU)',
  'SI=F':  'Silver (XAG)',
  'PL=F':  'Platinum (XPT)',
  'PA=F':  'Palladium (XPD)',

  // Industrial Metals
  'HG=F':  'Copper',
  'ALI=F': 'Aluminum',

  // Stocks — Mega Cap Tech
  'AAPL':  'Apple',
  'MSFT':  'Microsoft',
  'GOOGL': 'Alphabet',
  'AMZN':  'Amazon',
  'NVDA':  'NVIDIA',
  'META':  'Meta',
  'TSLA':  'Tesla',
  'AVGO':  'Broadcom',
  'ORCL':  'Oracle',
  'CRM':   'Salesforce',

  // Stocks — Finance
  'JPM':   'JP Morgan',
  'V':     'Visa',
  'MA':    'Mastercard',
  'BAC':   'Bank of America',
  'GS':    'Goldman Sachs',

  // Stocks — Healthcare
  'UNH':   'UnitedHealth',
  'JNJ':   'Johnson & J',
  'LLY':   'Eli Lilly',
  'PFE':   'Pfizer',
  'ABBV':  'AbbVie',

  // Stocks — Consumer / Industrial
  'WMT':   'Walmart',
  'PG':    'P&G',
  'KO':    'Coca-Cola',
  'DIS':   'Disney',
  'NKE':   'Nike',

  // Index ETFs
  'SPY':   'S&P 500',
  'QQQ':   'NASDAQ 100',
  'DIA':   'Dow Jones',
  'IWM':   'Russell 2000',
  'VIX':   'VIX',

  // Legacy Screener-Service Indices
  'SPX':   'S&P 500',
  'NDAQ':  'NASDAQ 100',
  'DOW':   'DOW JONES',
  'FTSE':  'FTSE 100',
  'DAX':   'DAX 40',
  'NKY':   'NIKKEI 225',
};

// ── Binance/Bybit → Display Name Mappings ────────────────────────

const EXCHANGE_ALIASES: Record<string, string> = {
  'PAXGUSDT': 'GOLD (XAU)',
  'XAUUSDT':  'GOLD (XAU)',
  'XAGUSDT':  'SILVER (XAG)',
  'SILVER':   'SILVER (XAG)',
  'EURUSDT':  'EUR/USD',
  'GBPUSDT':  'GBP/USD',
  'AUDUSDT':  'AUD/USD',
  'JPYUSDT':  'USD/JPY',
};

/**
 * Resolve any symbol from any data source to a human-readable display name.
 * Priority: Exchange aliases → Yahoo aliases → smart cleanup.
 */
export function getSymbolAlias(symbol: string): string {
  // 1. Check exchange-native aliases (Binance/Bybit)
  if (EXCHANGE_ALIASES[symbol]) return EXCHANGE_ALIASES[symbol];

  // 2. Check Yahoo Finance aliases
  if (YAHOO_ALIASES[symbol]) return YAHOO_ALIASES[symbol];

  // 3. Smart cleanup for unlisted Binance/Bybit symbols
  let clean = symbol;

  // Strip USDT suffix
  if (clean.endsWith('USDT') && clean.length > 4) {
    clean = clean.slice(0, -4);
  }
  // Strip USD suffix (Bybit Inverse)
  else if (clean.endsWith('USD') && clean.length > 3) {
    clean = clean.slice(0, -3);
  }

  // Strip Bybit perpetual suffix
  clean = clean.replace('.P', '');

  return clean;
}

/**
 * Get a compact ticker label for subtitles (e.g. "AAPL", "EUR/USD", "XAU").
 * For Yahoo symbols this strips the =X / =F suffix. For crypto it shows the pair.
 */
export function getSymbolTicker(symbol: string): string {
  // Yahoo Forex: EURUSD=X → EUR/USD
  if (symbol.endsWith('=X')) {
    const base = symbol.replace('=X', '');
    if (base.length === 6) return `${base.slice(0, 3)}/${base.slice(3)}`;
    return base;
  }

  // Yahoo Futures: GC=F → XAU, SI=F → XAG
  const futuresMap: Record<string, string> = {
    'GC=F': 'XAU/USD', 'SI=F': 'XAG/USD', 'PL=F': 'XPT/USD',
    'PA=F': 'XPD/USD', 'HG=F': 'HG/USD', 'ALI=F': 'ALI/USD',
  };
  if (futuresMap[symbol]) return futuresMap[symbol];

  // Stocks/Indices — just return the ticker
  if (YAHOO_ALIASES[symbol]) return symbol;

  // Crypto — show pair
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}/USDT`;

  return symbol;
}
