import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client.
 *
 * Use this from Server Components, Server Actions and Route Handlers when
 * you need an authenticated session. Auth tokens are read from / written
 * to cookies through Next's `cookies()` API so the session stays attached
 * to the user across requests.
 *
 * For admin tasks that must bypass RLS (data import, workspace creation
 * before the user has a membership), use `createAdminClient()` instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` from a Server Component is a no-op — only Route
            // Handlers and Server Actions can mutate cookies. Middleware
            // refreshes the session so this is fine.
          }
        },
      },
    },
  );
}
