import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link callback.
 *
 * Supabase redirects the user here after they click the email link, with
 * a `code` query param. We swap the code for a real session (which sets
 * the auth cookies) and redirect them on to whatever page they were
 * trying to reach.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const fail = new URL("/login", url.origin);
    fail.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(fail);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
