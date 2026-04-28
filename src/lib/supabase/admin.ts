import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client — uses the `service_role` key to bypass Row-Level
 * Security. Only use for trusted server-side operations:
 *
 *   • the data-migration script
 *   • workspace creation flow (creating the first `Membership` for the
 *     creator before any RLS policy can match)
 *   • cron jobs / scheduled tasks
 *
 * Never expose this client to the browser. The key is in
 * `SUPABASE_SERVICE_ROLE_KEY`, server-only.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient() called without SUPABASE_SERVICE_ROLE_KEY in env",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
