import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
      // Direct session call is much more stable in Node middleware than a fetch
      const sessionData = await auth.api.getSession({
        headers: request.headers,
      });
      session = sessionData;
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
