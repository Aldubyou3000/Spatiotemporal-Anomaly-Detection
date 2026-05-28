import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// Methods that change state — must carry a valid CSRF token header.
const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE", "PUT"]);

// Login itself has no existing session, so it has no CSRF cookie to echo.
// The backend issues the csrf_token cookie *as part of the login response*.
const CSRF_EXEMPT = ["/api/auth/login", "/api/mobile/auth/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Always allow public pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require access_token cookie for all protected pages
  if (!request.cookies.has("access_token")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // CSRF double-submit check for mutating requests to our own API.
  // Only applies to same-origin API routes proxied through Next.js.
  // Direct-to-backend calls (from the browser to :8000) are validated
  // by the FastAPI _require_csrf dependency instead.
  if (
    MUTATING_METHODS.has(method) &&
    pathname.startsWith("/api/") &&
    !CSRF_EXEMPT.some((p) => pathname.startsWith(p))
  ) {
    const csrfHeader = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get("csrf_token")?.value;
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return new NextResponse(JSON.stringify({ detail: "CSRF token invalid" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
