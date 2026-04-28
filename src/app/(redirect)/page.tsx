import { redirect } from "next/navigation";
import { getCurrentWorkspace } from "@/lib/auth/workspace";

/**
 * Root entry point.
 *
 * No workspace context exists at `/` — we resolve the user's first
 * workspace and redirect them into it. This is the page they hit right
 * after sign-in (the magic-link callback redirects to `/` by default).
 *
 * The middleware has already gated this route on auth, so a missing user
 * triggers a redirect to /login from inside getCurrentWorkspace.
 */
export default async function RootRedirect() {
  const ctx = await getCurrentWorkspace();
  redirect(`/${ctx.workspace.slug}`);
}
