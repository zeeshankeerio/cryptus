export function getSymbolAlias(symbol: string): string {
  if (symbol === 'PAXGUSDT' || symbol === 'XAUUSDT') return 'GOLD (XAU)';
  if (symbol === 'SILVER' || symbol === 'XAGUSDT') return 'SILVER (XAG)';
  if (symbol === 'SPX') return 'S&P 500';
  if (symbol === 'NDAQ') return 'NASDAQ 100';
  if (symbol === 'DOW') return 'DOW JONES';
  if (symbol === 'FTSE') return 'FTSE 100';
  if (symbol === 'DAX') return 'DAX 40';
  if (symbol === 'NKY') return 'NIKKEI 225';
  if (symbol === 'EURUSDT') return 'EUR/USD';
  if (symbol === 'GBPUSDT') return 'GBP/USD';
  if (symbol === 'AUDUSDT') return 'AUD/USD';
  if (symbol === 'JPYUSDT') return 'USD/JPY';
  
  // Clean up standard symbols (Binance/Bybit Spot & Linear)
  let clean = symbol.replace('USDT', '');
  
  // Handle Bybit Inverse symbols (usually end in USD)
  if (clean.endsWith('USD') && clean.length > 3) {
    clean = clean.replace('USD', '');
  }

  // Handle Bybit Perpetual specific suffixes if any (.P is common in some APIs, though V5 is usually clean)
  clean = clean.replace('.P', '');

  return clean;
}
