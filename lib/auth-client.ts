"use client";

import { createAuthClient } from "better-auth/react";
import { stripeClient } from "@better-auth/stripe/client";

function getAuthBaseURL(): string {
  // Client-side: always use the current browser origin — this is always correct
  if (typeof window !== "undefined") return window.location.origin;
  // Server-side (SSR): use env vars only, no hardcoded domains
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  );
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [
    stripeClient({
      subscription: true,
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
