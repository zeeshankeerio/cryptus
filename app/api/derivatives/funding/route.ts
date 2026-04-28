/**
 * RSIQ Pro - Binance Funding Rate Proxy
 * REST fallback for funding rates when WebSocket is offline.
 * 
 * Architecture:
 * 1. Accepts comma-separated list of symbols
 * 2. Fetches current funding rates from Binance Futures REST API
 * 3. Caches results for 10 seconds
 * 4. Bypasses browser CORS restrictions
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from '@/lib/lru-cache';

// ── Configuration ───────────────────────────────────────────────
const BINANCE_PREMIUM_INDEX_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const CACHE_TTL_MS = 10_000; // 10 seconds (tighter than OI since funding changes more frequently)
const fundingCache = new LRUCache<string, { 
  rate: number; 
  annualized: number;
  nextFundingTime: number;
  markPrice: number;
  indexPrice: number;
  timestamp: number;
}>(500);

async function fetchBinanceFunding(symbol: string): Promise<any | null> {
  // 1. Check Cache
  const cached = fundingCache.get(symbol);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached;
  }

  // 2. Fetch from Binance
  try {
    const res = await fetch(`${BINANCE_PREMIUM_INDEX_URL}?symbol=${symbol}`, {
      signal: AbortSignal.timeout(4000),
    });
    
    if (!res.ok) {
      if (res.status === 429) console.warn(`[API-Funding] Rate limited by Binance for ${symbol}`);
      return null;
    }

    const data = await res.json();
    
    const rate = parseFloat(data.lastFundingRate);
    const markPrice = parseFloat(data.markPrice);
    const indexPrice = parseFloat(data.indexPrice);
    const nextFundingTime = parseInt(data.nextFundingTime);
    
    if (isNaN(rate) || isNaN(markPrice)) return null;
    
    const result = {
      rate,
      annualized: rate * 3 * 365 * 100, // 3 funding periods/day × 365 days × 100 for %
      nextFundingTime,
      markPrice,
      indexPrice: isNaN(indexPrice) ? markPrice : indexPrice,
      timestamp: now,
    };
    
    fundingCache.set(symbol, result);
    return result;
  } catch (err) {
    // Silent fail for individual symbols
  }
  return null;
}

// ── Main Handler ─────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols');

  if (!symbolsParam) {
    return NextResponse.json({ error: 'Missing symbols' }, { status: 400 });
  }

  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9]{2,20}USDT$/.test(s))
    .slice(0, 50);
  if (symbols.length === 0) return NextResponse.json({ data: {} });

  try {
    // Fetch in parallel
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const data = await fetchBinanceFunding(sym);
        return [sym, data];
      })
    );

    const dataMap = Object.fromEntries(results.filter(([_, v]) => v !== null));

    return NextResponse.json({
      data: dataMap,
      timestamp: Date.now(),
      cached: true,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Proxy-Source': 'RSIQ-Derivatives-Funding-Proxy',
      }
    });

  } catch (error) {
    console.error('[API-Funding] Batch Fetch Error:', error);
    return NextResponse.json({ error: 'Internal proxy error', data: {} }, { status: 502 });
  }
}
