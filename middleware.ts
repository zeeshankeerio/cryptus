import { NextRequest, NextResponse } from "next/server";
import { betterFetch } from "@better-fetch/fetch";
import type { auth } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/config";

type Session = typeof auth.$Infer.Session;
const sessionCache = new Map<string, { data: Session | null; expires: number }>();


export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static/public assets so PWA files and icons are reachable before auth.
  const isStaticAsset =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/logo/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/robots.txt" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/workbox-") ||
    pathname.startsWith("/worker-") ||
    /\.[a-z0-9]+$/i.test(pathname);

  if (isStaticAsset) {
    return NextResponse.next();
  }

  const publicPrefixes = ["/login", "/register", "/about", "/services", "/subscription"];
  const isPublicRoute =
    pathname === "/" ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  // ─── Phase 1: Cookie & Cache Check ───
  // Check for session cookies with support for all common variations
  const hasSessionCookie =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token") ||
    request.cookies.has("__secure-better-auth.session_token");

  // Fast path: no cookie + not a public route → redirect to login
  if (!hasSessionCookie && !isPublicRoute) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // ─── Phase 2: Burst Cache & Validation ───
  // Memory-resident burst cache to deduplicate session calls within high-concurrency windows.
  let session: Session | null = null;
  const sessionToken = request.cookies.get("better-auth.session_token")?.value || 
                       request.cookies.get("__Secure-better-auth.session_token")?.value ||
                       "anon";

  // 2026 Optimization: Skip heavy session validation for public routes.
  // This prevents DB/Internal-API lag from blocking the landing page or login page.
  if (hasSessionCookie && !isPublicRoute) {
    const cached = sessionCache.get(sessionToken);
    const now = Date.now();
    if (cached && now < cached.expires) {
      session = cached.data;
    } else {
      try {
        const baseURL = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
        
        const sessionResult = await betterFetch<Session>(
          "/api/auth/get-session",
          {
            baseURL,
            headers: {
              cookie: request.headers.get("cookie") || "",
              "cache-control": "no-store",
            },
            timeout: 10000, // 10s timeout for local dev resilience
          },
        );

        if (sessionResult.error?.status === 429) {
          console.warn("[middleware] 429 detected. Passing through.");
          return NextResponse.next();
        }

        if (sessionResult.error) {
          console.warn("[middleware] Session fetch rejected:", sessionResult.error.statusText);
        }
        
        session = sessionResult.data;
        sessionCache.set(sessionToken, { data: session, expires: now + 5000 });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const isTimeout = errorMessage.includes("aborted") || errorMessage.includes("timeout");
        
        console.error(
          `[middleware] Session validation failure (${isTimeout ? "Timeout" : "Error"}):`,
          errorMessage
        );

        // ─── Phase 2.5: Soft-Gate Resilience (Critical for Production) ───
        // If the auth check times out (likely due to DB pool saturation), we 
        // DO NOT block the user. We allow the request to pass to the page.
        // The client-side useSession() will handle the eventual auth check.
        // This stops the infinite redirect loop during traffic spikes.
        if (isTimeout && !isPublicRoute) {
          console.warn("[middleware] Soft-Gate activated: allowing protected route access during latency spike.");
          return NextResponse.next();
        }
      }
    }
  }

  // Unauthenticated user on a protected page → redirect to login
  // Note: If Soft-Gate activated above, this line isn't reached because we returned NextResponse.next()
  if (!session && !isPublicRoute) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user on an auth page → redirect to terminal
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/terminal", request.url));
  }

  // Owner-only route guard for admin panel (Keep strict in middleware for security)
  if (session && pathname.startsWith("/admin")) {
    const isOwner =
      session.user.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
      session.user.role === "owner";

    if (!isOwner) {
      return NextResponse.redirect(new URL("/terminal", request.url));
    }
  }

  // ─── Phase 3: Identity Injection (Zero-Lag Data Flow) ───
  // If we have a validated session, we inject trusted markers for downstream APIs.
  // This allows the Screener API to skip DB-based auth and provide "instant" data.
  const response = NextResponse.next();

  // Enterprise Hardening: Prevent Service Worker and Browser from caching sensitive routes
  if (pathname.startsWith('/terminal') || pathname.startsWith('/login')) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Vary", "Cookie");
  }

  if (session) {
    response.headers.set("x-rsiq-user-id", session.user.id);
    response.headers.set("x-rsiq-user-role", session.user.role || "user");
    response.headers.set("x-rsiq-auth-trusted", "1");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (Auth routes — must be excluded for better-auth)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - metadata and PWA assets (manifest, sw, robots, favicon)
     * - any file with an extension (public assets: images, icons, js, css, etc.)
     * NOTE: We specifically REMOVED the exclusion for /api/screener
     * and /api/subscription to allow middleware to handle "Fast-Auth" 
     * for the data feed and entitlement checks.
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.json|sw.js|.*\\..*).*)",
  ],
};
