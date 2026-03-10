import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CryptoRSI Screener — Multi-Indicator Crypto Market Scanner',
  description: 'Monitor 500+ crypto trading pairs with real-time RSI, MACD, Bollinger Bands, Stochastic RSI, VWAP, and composite strategy scoring.',
  robots: 'index, follow',
  openGraph: {
    title: 'CryptoRSI Screener',
    description: 'Real-time multi-indicator crypto market scanner with 500+ pairs',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
