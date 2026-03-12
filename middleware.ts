import { NextRequest, NextResponse } from "next/server";
import { betterFetch } from "@better-fetch/fetch";
import type { auth } from "@/lib/auth";

type Session = typeof auth.$Infer.Session;

export async function middleware(request: NextRequest) {
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/register");
  
  // Optimization: If no session cookie exists, we can skip the fetch for non-auth routes
  // Better Auth default cookie name is better-auth.session_token
  const hasSessionCookie = request.cookies.has("better-auth.session_token") || 
                           request.cookies.has("__secure-better-auth.session_token");

  if (!hasSessionCookie && !isAuthRoute) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // If we have a cookie or it's an auth route, we might need a full check or just continue
  let session = null;
  if (hasSessionCookie) {
    try {
      // Use the public URL for production to ensure reliability, 
      // but fallback to localhost for development.
      const baseURL = process.env.NODE_ENV === "production" 
        ? "https://rsiq.onrender.com" 
        : `http://localhost:${process.env.PORT || 3000}`;

      const { data } = await betterFetch<Session>(
        "/api/auth/get-session",
        {
          baseURL,
          headers: {
            cookie: request.headers.get("cookie") || "",
          },
        },
      );
      session = data;
    } catch (e) {
      console.error("[middleware] Session check failed:", e);
    }
  }

  if (!session) {
    if (!isAuthRoute) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  } else {
    // Redirect authenticated users away from auth pages to dashboard
    if (isAuthRoute) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - assets (images, fonts, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|assets).*)",
  ],
};
