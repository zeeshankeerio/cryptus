import { ImageResponse } from 'next/og';
import { getScreenerData } from '../../../../lib/screener-service';
import { getSymbolAlias } from '../../../../lib/symbol-utils';
import type { ScreenerEntry } from '../../../../lib/types';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const ticker = (symbol || 'BTC').toUpperCase();
    const alias = getSymbolAlias(symbol);

    // Fetch the institutional signal for this symbol
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
      rsi15m: 50
    } as any;

    const labelLower = (entry.strategyLabel || '').toLowerCase();
    const isOversold = entry.signal === 'oversold' || labelLower.includes('buy');
    const isOverbought = entry.signal === 'overbought' || labelLower.includes('sell');
    const themeColor = isOversold ? '#39FF14' : isOverbought ? '#FF4B5C' : '#64748b';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#05080F',
            backgroundImage: 'radial-gradient(circle at 50% 50%, #39FF1410, transparent)',
            padding: '40px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ 
              backgroundColor: '#39FF14', 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%',
              marginRight: '12px'
            }} />
            <span style={{ color: '#64748b', fontSize: '24px', fontWeight: 900, letterSpacing: '8px', textTransform: 'uppercase' }}>
              Institutional Alpha
            </span>
          </div>

          {/* Main Symbol Display */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
             <span style={{ color: 'white', fontSize: '100px', fontWeight: 900, letterSpacing: '-6px' }}>
               {alias} <span style={{ color: themeColor }}>Status</span>
             </span>
             
             {/* Signal Badge */}
             <div style={{ 
               marginTop: '20px',
               padding: '12px 40px',
               backgroundColor: `${themeColor}20`,
               border: `2px solid ${themeColor}60`,
               borderRadius: '100px',
               display: 'flex'
             }}>
               <span style={{ color: themeColor, fontSize: '32px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px' }}>
                 {(entry.strategyLabel || 'Analyzing...').toUpperCase()}
               </span>
             </div>
          </div>

          {/* Metrics Footer */}
          <div style={{ 
            marginTop: '60px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            width: '100%',
            borderTop: '1px solid #ffffff10',
            paddingTop: '30px'
          }}>
             <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#64748b', fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>RSI (15M)</span>
                <span style={{ color: 'white', fontSize: '32px', fontWeight: 700 }}>{entry.rsi15m ? entry.rsi15m.toFixed(1) : '--.-'}</span>
             </div>
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ color: '#64748b', fontSize: '18px', fontWeight: 900, textTransform: 'uppercase' }}>Strategy Score</span>
                <span style={{ color: themeColor, fontSize: '32px', fontWeight: 700 }}>{entry.strategyScore ?? 0}</span>
             </div>
          </div>

          {/* Branding */}
          <div style={{ 
             position: 'absolute', 
             bottom: '40px', 
             right: '40px', 
             display: 'flex', 
             alignItems: 'center'
          }}>
             <span style={{ color: '#ffffff40', fontSize: '14px', fontWeight: 900, letterSpacing: '2px' }}>
               POWERED BY RSIQ PRO
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
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
