import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { prisma } from "./prisma";

// ── Resolve the canonical application URL ──
// Priority: explicit env vars > platform-injected vars > localhost fallback
const resolvedAppUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  process.env.RENDER_EXTERNAL_URL || // Render injects this automatically
  "http://localhost:3000";

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

// Build the trusted origins list from all possible env vars
const trustedOrigins = Array.from(
  new Set(
    [
      normalizeOrigin(resolvedAppUrl),
      normalizeOrigin(process.env.BETTER_AUTH_URL),
      normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
      normalizeOrigin(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
      normalizeOrigin(process.env.RENDER_EXTERNAL_URL),
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      ...(process.env.AUTH_TRUSTED_ORIGINS
        ? process.env.AUTH_TRUSTED_ORIGINS.split(",").map((origin) => normalizeOrigin(origin.trim()))
        : []),
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

export const auth = betterAuth({
  baseURL: resolvedAppUrl,
  secret: process.env.BETTER_AUTH_SECRET,

  // Required when running behind a reverse proxy (Render, Vercel, Cloudflare, etc.)
  // Without this, Better Auth rejects requests because the Host header doesn't match.
  trustHost: true,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  advanced: {
    // Use a predictable cookie prefix so middleware can check for it.
    // The default "__Secure-" prefix requires HTTPS and can cause issues
    // during local dev or behind certain proxies.
    cookiePrefix: "better-auth",
    // Automatically use Secure cookies in production
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },

  plugins: [
    adminPlugin(),
  ],

  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
