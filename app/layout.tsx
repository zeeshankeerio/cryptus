import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RSIQ Pro — Mindscape Analytics LLC',
  description: 'Enterprise-grade multi-indicator crypto market scanner by Mindscape Analytics LLC. Monitor 500+ pairs with real-time RSI, MACD, and strategy scoring.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RSIQ Pro',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: '/logo/rsiq-mindscapeanalytics.png',
  },
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
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0e17',
};

import { Toaster } from 'sonner';
import { PWAInstallPrompt } from '@/components/pwa-install-prompt';
import { PWAServiceWorkerRegistration } from '@/components/pwa-service-worker-registration';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased bg-[#0a0e17]" suppressHydrationWarning>
        {children}
        <PWAServiceWorkerRegistration />
        <PWAInstallPrompt />
        <Toaster theme="dark" position="top-right" closeButton richColors />
      </body>
    </html>
  );
}
