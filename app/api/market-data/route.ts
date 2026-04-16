import { NextRequest, NextResponse } from 'next/server';

/**
 * RSIQ Pro — Hybrid Multi-Asset Market Data API
 * 
 * Architecture:
 * 1. Primary: Yahoo Finance v7 Batch Quote (up to 50 symbols, 1 request).
 *    Provides: Price, Change, Volume, names, and Institutional SMAs (50/200).
 * 2. Secondary: Yahoo Finance v8 Chart (top 30 symbols, parallelized).
 *    Provides: 1m historical candles (2 hours) for technicals (RSI/EMA).
 * 
 * Returns a unified format compatible with the ScreenerEntry interface.
 */

interface MarketDataEntry {
  symbol: string;
  displayName: string;
  price: number;
  open: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  sma50: number | null;
  sma200: number | null;
  marketState: string;
  currency: string;
  updatedAt: number;
  // Dynamic Intelligence
  closes: number[]; // Last 60-120 minutes of 1m closes
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');
  const assetClass = searchParams.get('class') || 'stocks';

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (symbols.length === 0) return NextResponse.json({ data: [] });

  try {
    // 1. Fetch Batch Quotes (v7)
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}&fields=regularMarketPrice,regularMarketOpen,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,fiftyDayAverage,twoHundredDayAverage,shortName,longName,marketState,currency`;

    // 2. Fetch Charts for Technicals (v8) — Parallelized for speed
    const techRequired = symbols.slice(0, 30); // Technicals only for prioritized signals

    const [quoteResponse, ...chartResults] = await Promise.all([
      fetch(quoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
        .then(r => r.ok ? r.json() : null),
      ...techRequired.map(s =>
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1m&range=2h&includePrePost=false`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    ]);

    const quotes = quoteResponse?.quoteResponse?.result || [];
    const charMap = new Map<string, number[]>();

    // Process charts
    chartResults.forEach(chart => {
      const res = chart?.chart?.result?.[0];
      const sym = res?.meta?.symbol;
      const cl = res?.indicators?.quote?.[0]?.close;
      if (sym && Array.isArray(cl)) {
        // Filter out null values which can occur in live candles
        charMap.set(sym, cl.filter((c: any) => c !== null));
      }
    });

    // 3. Merge Data into Perfect Stream
    const results: MarketDataEntry[] = quotes.map((q: any) => {
      const histCloses = charMap.get(q.symbol) || [];
      const livePrice = q.regularMarketPrice || 0;

      // Ensure v7's latest price is at the tail of the closes for indicators
      if (livePrice > 0 && (histCloses.length === 0 || histCloses[histCloses.length - 1] !== livePrice)) {
        histCloses.push(livePrice);
      }

      return {
        symbol: q.symbol,
        displayName: q.shortName || q.longName || q.symbol,
        price: livePrice,
        open: q.regularMarketOpen || q.regularMarketPreviousClose || 0,
        previousClose: q.regularMarketPreviousClose || 0,
        change: q.regularMarketChange || 0,
        changePercent: q.regularMarketChangePercent || 0,
        volume: q.regularMarketVolume || 0,
        high: q.regularMarketDayHigh || livePrice,
        low: q.regularMarketDayLow || livePrice,
        sma50: q.fiftyDayAverage || null,
        sma200: q.twoHundredDayAverage || null,
        marketState: q.marketState || 'OPEN',
        currency: q.currency || 'USD',
        updatedAt: Date.now(),
        closes: histCloses.slice(-60), // Keep 60 nodes for technical smoothing
      };
    });

    return NextResponse.json({
      data: results,
      source: 'hybrid-yahoo-v7v8',
      timestamp: Date.now(),
      assetClass,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });

  } catch (error) {
    console.error('[api/market-data] Hybrid Fetch Error:', error);
    return NextResponse.json({ error: 'Market data engine error', data: [] }, { status: 502 });
  }
}
