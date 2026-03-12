"use client";

import { createAuthClient } from "better-auth/react";

function getAuthBaseURL() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || (process.env.NODE_ENV === "production" ? "https://rsiq.onrender.com" : "http://localhost:3000");
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
});

export const { signIn, signUp, signOut, useSession } = authClient;
