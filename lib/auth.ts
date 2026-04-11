import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";
import { prisma } from "./prisma";
import { AUTH_CONFIG } from "./config";
import { getPlansFromStripe } from "./stripe-plans";

// ── Resolve the canonical application URL ──
// Priority: explicit env vars > platform-injected vars > localhost fallback
const resolvedAppUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : null) ||
  "http://localhost:3000";

if (process.env.NODE_ENV !== "test") {
  console.log(`[auth] Initializing with baseURL: ${resolvedAppUrl}`);
}

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
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      ...(process.env.AUTH_TRUSTED_ORIGINS
        ? process.env.AUTH_TRUSTED_ORIGINS.split(",").map((origin) => normalizeOrigin(origin.trim()))
        : []),
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

function stripeModeFromKey(key: string | undefined): "test" | "live" | "unknown" {
  if (!key) return "unknown";
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  return "unknown";
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY. Stripe subscription features cannot initialize.");
}

const secretMode = stripeModeFromKey(stripeSecretKey);
const publishableMode = stripeModeFromKey(stripePublishableKey);

if (
  publishableMode !== "unknown" &&
  secretMode !== "unknown" &&
  publishableMode !== secretMode
) {
  throw new Error(
    `Stripe key mode mismatch: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${publishableMode}, STRIPE_SECRET_KEY=${secretMode}.`,
  );
}

if (process.env.NODE_ENV === "production" && !stripeWebhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET in production.");
}

const stripeClient = new Stripe(stripeSecretKey, {
  apiVersion: "2025-11-17.clover" as any,
});

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
    stripe({
      stripeClient,
      stripeWebhookSecret: stripeWebhookSecret || "",
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: async () => getPlansFromStripe(stripeClient),
        authorizeReference: async ({ user, referenceId, action }) => {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { id: true, email: true, role: true },
          });

          if (!dbUser) return false;

          const isOwner =
            dbUser.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
            dbUser.role === "owner";

          if (isOwner) return true;

          // User-scoped subscriptions: members can only read/update their own reference.
          if (action === "list-subscription") {
            return referenceId === dbUser.id;
          }

          return referenceId === dbUser.id;
        },
      },
    }),
  ],

  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
