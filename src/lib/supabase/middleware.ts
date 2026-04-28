import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-safe Supabase session refresher used by `middleware.ts` at the
 * project root. Every request hits this function, which:
 *
 *   1. Decodes the auth cookies and refreshes the access token if it's
 *      close to expiring. Without this, sessions silently die after one
 *      hour of inactivity.
 *   2. Returns a `NextResponse` carrying any updated cookies so the
 *      browser keeps a valid session.
 *   3. Redirects to /login when the request targets an authenticated
 *      route and there is no user.
 *
 * Routes that don't need auth (login, callback, public assets) are
 * filtered upstream by the middleware matcher.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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

  const url = request.nextUrl;
  const isAuthRoute =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth");

  if (!user && !isAuthRoute) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}
