import { NextRequest, NextResponse } from "next/server";

// Lightweight presence check only — middleware runs on the edge and can't
// hit the DB. Real authorization still happens per-request in each route
// handler via `requireUser()` / `getCurrentUser()`, which verify the JWT
// signature. This middleware exists purely for UX (don't flash a protected
// page before redirecting) — never treat it as the authorization boundary.
const PROTECTED_PREFIXES = ["/home", "/create", "/messages", "/notifications", "/saved", "/settings", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      const expected = new URL(process.env.APP_URL ?? request.nextUrl.origin).origin;
      if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site" || (!origin && request.headers.get("x-loopa-request") !== "1")) {
        return NextResponse.json({ ok: false, error: { code: "invalid_origin", message: "Request origin could not be verified." } }, { status: 403 });
      }
    }
    const response = NextResponse.next();
    response.headers.set("X-Request-Id", crypto.randomUUID());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const hasSession = request.cookies.has("loopa_access") || request.cookies.has("loopa_refresh");

  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/home/:path*", "/create/:path*", "/messages/:path*", "/notifications/:path*", "/saved/:path*", "/settings/:path*", "/admin/:path*", "/reels/:path*", "/login", "/signup"],
};
