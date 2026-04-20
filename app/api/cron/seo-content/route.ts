/**
 * RSIQ Pro — Daily SEO Content Agent
 *
 * Triggered by a cron job (Vercel Cron / external scheduler).
 * Generates fresh, keyword-rich content for:
 *   1. Google Search Console ping (sitemap re-index request)
 *   2. Dynamic meta descriptions for top symbols
 *   3. Social share content snippets (X / Telegram)
 *   4. Structured data freshness signal
 *
 * Schedule: Daily at 08:00 UTC
 * Vercel cron config: vercel.json → "crons": [{ "path": "/api/cron/seo-content", "schedule": "0 8 * * *" }]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTopSymbols } from '@/lib/screener-service';

const BASE_URL = 'https://rsiq.mindscapeanalytics.com';
const CRON_SECRET = process.env.CRON_SECRET;

// ── Auth guard ────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) return false;
  return true;
}

// ── Ping Google to re-crawl sitemap ──────────────────────────────
async function pingGoogleSitemap(): Promise<{ ok: boolean; status?: number }> {
  try {
    const sitemapUrl = encodeURIComponent(`${BASE_URL}/sitemap.xml`);
    const res = await fetch(
      `https://www.google.com/ping?sitemap=${sitemapUrl}`,
      { method: 'GET', signal: AbortSignal.timeout(10000) }
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('[seo-agent] Google ping failed:', e);
    return { ok: false };
  }
}

// ── Ping Bing to re-crawl sitemap ────────────────────────────────
async function pingBingSitemap(): Promise<{ ok: boolean; status?: number }> {
  try {
    const sitemapUrl = encodeURIComponent(`${BASE_URL}/sitemap.xml`);
    const res = await fetch(
      `https://www.bing.com/ping?sitemap=${sitemapUrl}`,
      { method: 'GET', signal: AbortSignal.timeout(10000) }
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('[seo-agent] Bing ping failed:', e);
    return { ok: false };
  }
}

// ── Generate daily social content snippets ───────────────────────
function generateSocialSnippets(symbols: string[]): string[] {
  const top5 = symbols.slice(0, 5);
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return [
    // X / Twitter thread starter
    `📊 RSIQ Pro Daily Scan — ${date}\n\nInstitutional RSI sweep across ${symbols.length}+ pairs.\nTop movers: ${top5.join(', ')}\n\n🔍 Full analysis: ${BASE_URL}/terminal\n\n#Crypto #RSI #TradingSignals #Binance #Bybit`,

    // Telegram channel post
    `🚨 *RSIQ Pro Market Intelligence* — ${date}\n\n📈 Scanning ${symbols.length}+ pairs for institutional signals\n🐋 Whale radar active\n💰 Funding rate heatmap live\n⚡ Liquidation feed streaming\n\n👉 [Open Terminal](${BASE_URL}/terminal)\n\n_Powered by Mindscape Analytics_`,

    // LinkedIn post
    `Market Intelligence Update — ${date}\n\nRSIQ Pro is scanning ${symbols.length}+ crypto pairs in real-time, tracking:\n• Multi-timeframe RSI (1m, 5m, 15m, 1h)\n• Institutional order flow\n• Whale trade detection ($100K+)\n• Live liquidation feed\n• Smart Money Pressure Index\n\nBuilt for traders who need institutional-grade data without institutional costs.\n\n🔗 ${BASE_URL}\n\n#CryptoTrading #TradingTools #MarketAnalysis #Fintech`,
  ];
}

// ── Generate keyword-rich meta descriptions for top symbols ──────
function generateSymbolMeta(symbol: string): { title: string; description: string } {
  const alias = symbol.replace('USDT', '').replace('BUSD', '');
  return {
    title: `${alias} Real-Time RSI & Institutional Signal | RSIQ Pro`,
    description: `Live ${alias} RSI, MACD, Order Flow, and Smart Money analysis. Institutional-grade ${alias} signals with whale tracking and liquidation data. Updated every second by RSIQ Pro.`,
  };
}

// ── Main handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, any> = {};

  // 1. Ping search engines
  const [googlePing, bingPing] = await Promise.all([
    pingGoogleSitemap(),
    pingBingSitemap(),
  ]);
  results.googlePing = googlePing;
  results.bingPing = bingPing;

  // 2. Fetch top symbols for content generation
  let symbols: string[] = [];
  try {
    symbols = await getTopSymbols(50);
  } catch (e) {
    console.error('[seo-agent] Symbol fetch failed:', e);
    symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  }

  // 3. Generate social content
  const socialSnippets = generateSocialSnippets(symbols);
  results.socialSnippets = socialSnippets;

  // 4. Generate symbol meta for top 10
  const symbolMetas = symbols.slice(0, 10).map(s => ({
    symbol: s,
    ...generateSymbolMeta(s),
    ogUrl: `${BASE_URL}/api/og/${s.toLowerCase()}`,
    pageUrl: `${BASE_URL}/symbol/${s.toLowerCase()}`,
  }));
  results.symbolMetas = symbolMetas;

  // 5. Summary
  results.summary = {
    executedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    symbolsProcessed: symbols.length,
    searchEnginesPinged: ['Google', 'Bing'],
    sitemapUrl: `${BASE_URL}/sitemap.xml`,
  };

  console.log('[seo-agent] Daily run complete:', JSON.stringify(results.summary));

  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

// Also support POST for manual triggers
export const POST = GET;
