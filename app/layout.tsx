import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CryptoRSI Screener — Real-Time RSI Market Scanner',
  description: 'Monitor hundreds of crypto trading pairs with real-time RSI across multiple timeframes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
