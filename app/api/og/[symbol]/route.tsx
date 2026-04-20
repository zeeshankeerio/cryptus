import { ImageResponse } from 'next/og';
import { getScreenerData } from '../../../../lib/screener-service';
import { getSymbolAlias } from '../../../../lib/symbol-utils';
import type { ScreenerEntry } from '../../../../lib/types';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// ── Static OG image fallback ─────────────────────────────────────
// Serves the branded og-image.png when no symbol is provided or
// when the request is for the root OG image.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = (symbol || 'BTC').toUpperCase();
    const alias = getSymbolAlias(symbol);

    // ── Accept header: prefer WebP if browser supports it ──────
    const accept = request.headers.get('accept') || '';
    const supportsWebP = accept.includes('image/webp');

    // ── Special case: "default" → serve the branded static image ─
    if (ticker === 'DEFAULT' || ticker === 'BRAND') {
      const ext = supportsWebP ? 'webp' : 'png';
      const imgPath = path.join(process.cwd(), 'public', `og-image.${ext}`);
      if (fs.existsSync(imgPath)) {
        const buf = fs.readFileSync(imgPath);
        return new NextResponse(buf, {
          headers: {
            'Content-Type': supportsWebP ? 'image/webp' : 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
          },
        });
      }
    }

    // ── Fetch live institutional signal for this symbol ─────────
    const result = await getScreenerData(1, { 
      smartMode: true, 
      prioritySymbols: [ticker],
      exchange: 'binance' 
    });

    const entry = result.data.find((e: ScreenerEntry) => e.symbol === ticker) || {
      price: 0,
      signal: 'neutral',
      strategyScore: 0,
      strategyLabel: 'Analyzing...',
      rsi15m: 50,
      change24h: 0,
    } as any;

    const labelLower = (entry.strategyLabel || '').toLowerCase();
    const isOversold = entry.signal === 'oversold' || labelLower.includes('buy');
    const isOverbought = entry.signal === 'overbought' || labelLower.includes('sell');
    const themeColor = isOversold ? '#39FF14' : isOverbought ? '#FF4B5C' : '#64748b';
    const signalEmoji = isOversold ? '🚀' : isOverbought ? '⚠️' : '📊';

    // Format price
    const price = entry.price ?? 0;
    const priceStr = price >= 1000
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price >= 1 ? price.toFixed(4)
      : price.toFixed(6);

    const change24h = entry.change24h ?? 0;
    const changeStr = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#05080F',
            fontFamily: 'sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* ── Background glow effects ── */}
          <div style={{
            position: 'absolute', top: '-100px', left: '-100px',
            width: '500px', height: '500px', borderRadius: '50%',
            background: `radial-gradient(circle, ${themeColor}18 0%, transparent 70%)`,
            display: 'flex',
          }} />
          <div style={{
            position: 'absolute', bottom: '-80px', right: '-80px',
            width: '400px', height: '400px', borderRadius: '50%',
            background: 'radial-gradient(circle, #39FF1408 0%, transparent 70%)',
            display: 'flex',
          }} />

          {/* ── Grid overlay ── */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(57,255,20,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(57,255,20,0.03) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            display: 'flex',
          }} />

          {/* ── Top bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '28px 48px 0',
          }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                backgroundColor: '#39FF14',
                boxShadow: '0 0 12px #39FF14',
              }} />
              <span style={{
                color: '#39FF14', fontSize: '13px', fontWeight: 900,
                letterSpacing: '6px', textTransform: 'uppercase',
              }}>
                RSIQ PRO
              </span>
              <span style={{
                color: '#ffffff20', fontSize: '13px', fontWeight: 400,
                letterSpacing: '2px',
              }}>
                by Mindscape Analytics
              </span>
            </div>
            {/* Live badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '100px',
              border: '1px solid #39FF1430',
              backgroundColor: '#39FF1410',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#39FF14' }} />
              <span style={{ color: '#39FF14', fontSize: '11px', fontWeight: 900, letterSpacing: '3px' }}>
                LIVE SIGNAL
              </span>
            </div>
          </div>

          {/* ── Main content ── */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '32px 48px 0',
          }}>
            {/* Symbol + Signal row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                  <span style={{ color: '#ffffff15', fontSize: '14px', fontWeight: 900, letterSpacing: '4px', textTransform: 'uppercase' }}>
                    Institutional Intelligence
                  </span>
                </div>
                <span style={{ color: 'white', fontSize: '88px', fontWeight: 900, letterSpacing: '-4px', lineHeight: 1 }}>
                  {alias}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '28px', fontWeight: 700, fontFamily: 'monospace' }}>
                    ${priceStr}
                  </span>
                  <span style={{
                    color: change24h >= 0 ? '#39FF14' : '#FF4B5C',
                    fontSize: '22px', fontWeight: 900, fontFamily: 'monospace',
                  }}>
                    {changeStr}
                  </span>
                </div>
              </div>

              {/* Signal badge */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '24px 36px',
                backgroundColor: `${themeColor}15`,
                border: `2px solid ${themeColor}50`,
                borderRadius: '24px',
                marginTop: '8px',
              }}>
                <span style={{ fontSize: '40px', marginBottom: '8px' }}>{signalEmoji}</span>
                <span style={{
                  color: themeColor, fontSize: '22px', fontWeight: 900,
                  textTransform: 'uppercase', letterSpacing: '3px',
                }}>
                  {(entry.strategyLabel || 'Analyzing...').toUpperCase()}
                </span>
              </div>
            </div>

            {/* ── Metrics row ── */}
            <div style={{
              display: 'flex', gap: '16px', marginTop: '36px',
            }}>
              {[
                { label: 'RSI (15M)', value: entry.rsi15m ? entry.rsi15m.toFixed(1) : '--.-', color: entry.rsi15m && entry.rsi15m <= 30 ? '#39FF14' : entry.rsi15m && entry.rsi15m >= 70 ? '#FF4B5C' : 'white' },
                { label: 'Strategy Score', value: String(entry.strategyScore ?? 0), color: themeColor },
                { label: 'Signal', value: (entry.signal || 'neutral').toUpperCase(), color: themeColor },
                { label: 'RSI (1H)', value: entry.rsi1h ? entry.rsi1h.toFixed(1) : '--.-', color: 'white' },
              ].map((m, i) => (
                <div key={i} style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  padding: '16px 20px',
                  backgroundColor: '#ffffff06',
                  border: '1px solid #ffffff0a',
                  borderRadius: '16px',
                }}>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>
                    {m.label}
                  </span>
                  <span style={{ color: m.color, fontSize: '26px', fontWeight: 900, fontFamily: 'monospace' }}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 48px 28px',
            borderTop: '1px solid #ffffff08',
            marginTop: '24px',
          }}>
            <span style={{ color: '#ffffff25', fontSize: '12px', fontWeight: 900, letterSpacing: '3px', textTransform: 'uppercase' }}>
              rsiq.mindscapeanalytics.com
            </span>
            <div style={{ display: 'flex', gap: '24px' }}>
              {['Crypto', 'Forex', 'Metals', 'Indices'].map((m, i) => (
                <span key={i} style={{ color: '#ffffff20', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {m}
                </span>
              ))}
            </div>
            <span style={{ color: '#ffffff25', fontSize: '12px', fontWeight: 900, letterSpacing: '2px' }}>
              Mindscape Analytics LLC
            </span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error('[og-api] generation failed:', e);
    // Fallback: serve the static branded OG image
    try {
      const imgPath = path.join(process.cwd(), 'public', 'og-image.png');
      if (fs.existsSync(imgPath)) {
        const buf = fs.readFileSync(imgPath);
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {}
    return new Response('Failed to generate image', { status: 500 });
  }
}
