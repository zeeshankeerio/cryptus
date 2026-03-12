import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RSIQ Pro — Mindscape Analytics LLC',
  description: 'Enterprise-grade multi-indicator crypto market scanner by Mindscape Analytics LLC. Monitor 500+ pairs with real-time RSI, MACD, and strategy scoring.',
  robots: 'index, follow',
  openGraph: {
    title: 'RSIQ Pro | Mindscape Analytics',
    description: 'Real-time enterprise crypto scanner with 500+ pairs and advanced analytics.',
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
