import { NextResponse, type NextRequest } from "next/server";

/**
 * Local middleware — no auth. Pulls the workspace slug from the first URL
 * segment and exposes it as the `x-workspace-slug` request header so server
 * components can resolve the active workspace via `headers()`.
 */
export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const first = segments[0];
  const reserved = new Set(["api", "login", "auth", "no-workspace"]);

  const requestHeaders = new Headers(request.headers);
  if (first && !reserved.has(first)) {
    requestHeaders.set("x-workspace-slug", first);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
