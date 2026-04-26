'use client';

import React, { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  interval?: string;
  theme?: 'light' | 'dark';
  autosize?: boolean;
  market?: string;
}

/**
 * Institutional TradingView Advanced Chart Widget
 * 
 * Features:
 * - Correct exchange-prefixed symbol resolution for all asset classes
 * - Proper TradingView interval mapping (minutes → TV intervals)
 * - Pre-loaded institutional indicator suite: EMA 9/21, RSI, MACD, BB, Volume
 * - Responsive autosize with deferred mount for modal animation stability
 */
function TradingViewWidget({
  symbol,
  interval = '15',
  theme = 'dark',
  autosize = true,
  market = 'Crypto'
}: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  /**
   * Maps app symbol → TradingView exchange:symbol format.
   * Handles Crypto (Binance), Metals (OANDA), Forex (OANDA/FX),
   * Indices (AMEX/NASDAQ), and Stocks (NASDAQ default).
   */
  const getTvSymbol = (sym: string, marketType: string): string => {
    const s = sym.toUpperCase().replace('=X', ''); // strip Yahoo suffix

    if (marketType === 'Crypto' || s.endsWith('USDT') || s.endsWith('BUSD')) {
      return `BINANCE:${s}`;
    }

    if (marketType === 'Metal') {
      if (s.includes('XAU') || s.includes('GC')) return 'OANDA:XAUUSD';
      if (s.includes('XAG') || s.includes('SI')) return 'OANDA:XAGUSD';
      if (s.includes('CL') || s.includes('OIL')) return 'NYMEX:CL1!';
      if (s.includes('NG')) return 'NYMEX:NG1!';
      if (s.includes('HG') || s.includes('COPPER')) return 'COMEX:HG1!';
      return `OANDA:${s}`;
    }

    if (marketType === 'Forex') {
      // Ensure proper 6-char pair format for OANDA
      const clean = s.replace('/', '').slice(0, 6);
      return `OANDA:${clean}`;
    }

    if (marketType === 'Index') {
      if (s === 'SPY' || s === 'SPX') return 'AMEX:SPY';
      if (s === 'QQQ' || s === 'NDX') return 'NASDAQ:QQQ';
      if (s === 'DIA' || s === 'DOW') return 'AMEX:DIA';
      if (s === 'IWM') return 'AMEX:IWM';
      if (s === 'VIX') return 'CBOE:VIX';
      return `INDEX:${s}`;
    }

    if (marketType === 'Stocks') {
      // Common exchange overrides
      const nyseStocks = new Set(['BAC', 'JPM', 'GS', 'MS', 'C', 'WFC', 'XOM', 'CVX', 'T', 'VZ']);
      return nyseStocks.has(s) ? `NYSE:${s}` : `NASDAQ:${s}`;
    }

    return s;
  };

  /**
   * Maps app timeframe string → TradingView interval code.
   * TradingView accepts: 1, 3, 5, 15, 30, 60, 120, 240, D, W, M
   */
  const getTvInterval = (iv: string): string => {
    const map: Record<string, string> = {
      '1':    '1',
      '3':    '3',
      '5':    '5',
      '15':   '15',
      '30':   '30',
      '60':   '60',
      '1h':   '60',
      '120':  '120',
      '4h':   '240',
      '240':  '240',
      'D':    'D',
      '1d':   'D',
      'W':    'W',
      '1w':   'W',
      'M':    'M',
    };
    // RSI periods like "14" have no chart meaning - default to 15m
    return map[iv] ?? (isNaN(Number(iv)) ? '15' : (Number(iv) <= 5 ? iv : '15'));
  };

  const tvSymbol = getTvSymbol(symbol, market);
  const tvInterval = getTvInterval(interval);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';

    // Pre-load institutional indicator suite:
    // EMA 9 & EMA 21 overlaid on price, RSI(14), MACD(12,26,9), Bollinger Bands(20,2), Volume
    const studies = [
      { id: 'MAExp@tv-basicstudies', inputs: { length: 9 }, styles: { plot_0: { color: '#39FF14', linewidth: 1 } } },
      { id: 'MAExp@tv-basicstudies', inputs: { length: 21 }, styles: { plot_0: { color: '#FF4B5C', linewidth: 1 } } },
      { id: 'RSI@tv-basicstudies', inputs: { length: 14 } },
      { id: 'MACD@tv-basicstudies', inputs: { fast_length: 12, slow_length: 26, signal_smoothing: 9 } },
      { id: 'BB@tv-basicstudies', inputs: { length: 20, mult: 2 } },
    ];

    const config = {
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: 'Etc/UTC',
      theme: theme,
      style: '1',          // Candlestick
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      calendar: false,
      details: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: false,
      save_image: true,
      backgroundColor: 'rgba(7, 11, 20, 1)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      withdateranges: true,
      studies: studies.map(s => s.id),
      support_host: 'https://www.tradingview.com',
    };

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify(config);

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.cssText = 'height: 100%; width: 100%;';

    // Defer mount until modal animation finishes - prevents 0-height widget bug
    const timer = setTimeout(() => {
      if (!container.current) return;
      container.current.innerHTML = '';
      container.current.appendChild(widgetDiv);
      container.current.appendChild(script);
    }, 250);

    return () => {
      clearTimeout(timer);
      if (container.current) container.current.innerHTML = '';
    };
  }, [tvSymbol, tvInterval, theme]);

  return (
    <div
      ref={container}
      className="tradingview-widget-container"
      style={{ height: '100%', width: '100%', background: '#070B14' }}
    >
      {/* Loading state - replaced by widget on mount */}
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 border-4 border-[#39FF14]/20 border-t-[#39FF14] rounded-full animate-spin" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            Initializing Alpha Stream...
          </span>
          <span className="text-[9px] text-slate-700 font-mono">{tvSymbol} · {tvInterval}m</span>
        </div>
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
