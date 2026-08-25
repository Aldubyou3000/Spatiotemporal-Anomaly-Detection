import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API calls are proxied to FastAPI via next.config.ts rewrites — the backend
  // does its own auth (get_current_user) and CSRF (_require_csrf). Guarding
  // them here breaks login: a POST to /api/auth/login has no access_token yet,
  // so the redirect below would turn it into a 405 on the /login page route.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Always allow public pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require access_token cookie for all protected pages
  if (!request.cookies.has("access_token")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
