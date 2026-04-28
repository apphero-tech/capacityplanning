import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-safe Supabase session refresher used by `middleware.ts` (`proxy.ts`
 * in Next 16+) at the project root. Every request hits this function:
 *
 *   1. Refreshes the Supabase access token if it's near expiring; without
 *      this, sessions silently die after one hour of inactivity.
 *   2. Redirects unauthenticated requests targeting protected routes to
 *      `/login`, with a `next` query param so we can round-trip back.
 *   3. Extracts the workspace slug from the URL (first path segment) and
 *      copies it into the *request* headers under `x-workspace-slug`, so
 *      Server Components downstream can resolve the active workspace via
 *      `headers()` instead of plumbing `params.slug` through every helper.
 */
export async function updateSession(request: NextRequest) {
  // Pre-compute the slug; we'll inject it into the propagated request
  // headers below.
  const url = request.nextUrl;
  const isAuthRoute =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth");

  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0];
  // Reserved prefixes that look like first-segment paths but aren't slugs.
  // API routes and the no-workspace screen never carry a workspace context.
  const reserved = new Set(["api", "no-workspace", "login", "auth"]);
  const slugCandidate =
    !isAuthRoute && first && !reserved.has(first) ? first : null;

  // Build the request headers we want server components to see.
  const requestHeaders = new Headers(request.headers);
  if (slugCandidate) {
    requestHeaders.set("x-workspace-slug", slugCandidate);
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          for (const { name, value, options } of toSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes tokens server-side; do not replace it
  // with getSession() — that one trusts the cookie blindly.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isAuthRoute) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
