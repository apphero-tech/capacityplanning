"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Created lazily on each call but they share
 * the same auth/cookies state, so it's effectively a singleton from the
 * caller's perspective.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
