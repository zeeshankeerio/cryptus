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
    navigateFallbackDenylist: [/^\/api/, /^\/login/, /^\/register/, /^\/auth/],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: { maxAgeSeconds: 604800 }, // 1 week
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: { maxAgeSeconds: 31536000 }, // 1 year
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
        source: "/(manifest.json|sw.js|offline)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
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
