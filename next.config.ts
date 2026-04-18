import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development" && process.env.PWA_DEBUG !== "true",
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  fallbacks: {
    document: '/offline',
    image: '/logo/rsiq-pro-icon.png',
    audio: undefined,
    video: undefined,
  },
  workboxOptions: {
    // Ensure offline page is precached
    skipWaiting: true,
    clientsClaim: true,
    navigateFallback: '/offline',
    // 2026 Resilience: Ensure subresources and critical app routes NEVER fallback to HTML shell
    // This prevents the "Permanently Offline" bug on /terminal and /login.
    navigateFallbackDenylist: [
      /^\/api/, 
      /^\/login/, 
      /^\/register/, 
      /^\/terminal/, 
      /^\/dashboard/,
      /^\/auth/, 
      /\.js$/, 
      /\.css$/, 
      /\.png$/, 
      /\.jpg$/,
      /\.ico$/
    ],
    
    // Performance: Don't cache-bust fingerprinted assets (they are immutable)
    dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,

    runtimeCaching: [
      // ── CRITICAL: Route Navigation Requests Correctly ──
      // Since we override the default next-pwa runtimeCaching, we must explicitly
      // handle HTML navigation requests so they don't immediately drop into the 
      // navigateFallback (/offline) catch-all.
      {
        urlPattern: ({ request, url }) => {
          const isNavigate = request.mode === 'navigate';
          const isHtml = request.destination === 'document' || request.headers.get('accept')?.includes('text/html');
          return isNavigate || isHtml;
        },
        handler: 'NetworkFirst',
        options: {
          cacheName: 'html-pages',
          networkTimeoutSeconds: 3, // Faster timeout for better UX
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
          },
        },
      },
      // ── CRITICAL: Real-time trading data MUST NEVER be cached ──
      // These endpoints power the live screener and alerts — serving stale data
      // from the PWA cache causes the "no price updates" bug on installed apps.
      {
        urlPattern: /\/api\/(screener|alerts|config|entitlements|health|market-data|derivatives)/,
        handler: 'NetworkFirst', 
        options: {
          cacheName: 'live-data-bypass',
          networkTimeoutSeconds: 5, // 5s timeout for stability on mobile/slow networks
        },
      },
      // ── Real-time Engine Script Bypass ──
      {
        urlPattern: /\/(ticker-worker|sw|derivatives-worker)\.js$/,
        handler: 'NetworkOnly',
      },
      // External exchange APIs (Binance/Bybit REST + Futures) — always fresh
      {
        urlPattern: /^https:\/\/(api|fapi)\.(binance\.com|bybit\.com)\//,
        handler: 'NetworkOnly',
        options: {
          cacheName: 'exchange-api-bypass',
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: { maxAgeSeconds: 604800 },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: { maxAgeSeconds: 31536000 },
        },
      },
      // Hardened Static Assets Strategy (excluding live-engine scripts)
      {
        urlPattern: ({ url }) => {
          const isStatic = /\.(?:js|css|woff2?)$/.test(url.pathname);
          const isEngine = url.pathname.includes('ticker-worker') || url.pathname.includes('sw') || url.pathname.includes('derivatives-worker');
          const isExternal = url.origin === 'https://cdn.jsdelivr.net' || url.origin === 'https://fonts.googleapis.com';
          return (isStatic && !isEngine) || isExternal;
        },
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-resources',
          expiration: { maxEntries: 100 },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained build — ideal for Render, Railway, etc.
  // Includes only necessary node_modules, so the deploy is smaller and faster.
  output: "standalone",
  images: { unoptimized: true },

  // Ensure native Node.js modules are not bundled by webpack
  serverExternalPackages: ["pg"],

  // Security Headers + Caching Strategy
  async headers() {
    return [
      // PWA & Manifest files: always revalidate
      {
        source: "/(manifest.json|sw.js|offline|derivatives-worker.js)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          // Force correct types for PWA core files
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // Static assets: cache for 1 year (fingerprinted)
      {
        source: "/(_next/static|logo|images)/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      // Web fonts: cache for 1 week
      {
        source: "/:path*.(woff|woff2|ttf|eot|otf)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
      // HTML pages: revalidate frequently for PWA shell
      {
        source: "/:path*.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=3600" },
        ],
      },
      // Global security headers
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com https://js.stripe.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.tradingview.com https://cdn.jsdelivr.net",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: https://*.tradingview.com",
              "connect-src 'self' https://*.binance.com wss://*.binance.com wss://*.binance.com:* https://*.bybit.com wss://*.bybit.com wss://*.bybit.com:* https://api.bybit.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://api.stripe.com https://api.nowpayments.io wss://*.nowpayments.io https://*.tradingview.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
              "media-src 'self' data: blob:",
              "frame-src 'self' https://*.tradingview.com https://*.tradingview-widget.com https://js.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // Logging config for debugging in non-production environments
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },

  // OPTIMIZATION: Ignore TypeScript and ESLint during build for speed
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default withPWA(nextConfig);
