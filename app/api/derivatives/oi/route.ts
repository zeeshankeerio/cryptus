/**
 * RSIQ Pro - Binance Open Interest Proxy
 * Resolves CORS issues and provides server-side batching/caching.
 * 
 * Architecture:
 * 1. Accepts a comma-separated list of symbols.
 * 2. Fetches current Open Interest for each from Binance Futures REST API.
 * 3. Caches results for 15 seconds to avoid rate limiting and improve speed.
 * 4. Bypasses browser CORS restrictions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from '@/lib/lru-cache';

// ── Configuration ───────────────────────────────────────────────
const BINANCE_FUTURES_URL = 'https://fapi.binance.com/fapi/v1/openInterest';
const CACHE_TTL_MS = 15_000; // 15 seconds
const oiCache = new LRUCache<string, { value: number; timestamp: number }>(500);

async function fetchBinanceOI(symbol: string): Promise<number | null> {
  // 1. Check Cache
  const cached = oiCache.get(symbol);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }

  // 2. Fetch from Binance
  try {
    const res = await fetch(`${BINANCE_FUTURES_URL}?symbol=${symbol}`, {
      signal: AbortSignal.timeout(4000),
    });
    
    if (!res.ok) {
      if (res.status === 429) console.warn(`[API-OI] Rate limited by Binance for ${symbol}`);
      return null;
    }

    const data = await res.json();
    const value = parseFloat(data.openInterest);
    
    if (!isNaN(value)) {
      oiCache.set(symbol, { value, timestamp: now });
      return value;
    }
  } catch (err) {
    // Silent fail for individual symbols to maintain batch liveness
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

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 50);
  if (symbols.length === 0) return NextResponse.json({ data: {} });

  try {
    // Fetch in parallel with concurrency limit or simple Promise.all
    // Since we only do ~20 symbols, Promise.all is fine.
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const value = await fetchBinanceOI(sym);
        return [sym, value];
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
        'X-Proxy-Source': 'RSIQ-Derivatives-Proxy',
      }
    });

  } catch (error) {
    console.error('[API-OI] Batch Fetch Error:', error);
    return NextResponse.json({ error: 'Internal proxy error', data: {} }, { status: 502 });
  }
}
