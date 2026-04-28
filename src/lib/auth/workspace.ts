import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the current workspace for a server-rendered page.
 *
 * Reads the Supabase auth session from cookies, looks up the user's first
 * membership, and returns the corresponding workspace id + slug. Cached for
 * the duration of a single request via React's `cache()` so the lookup
 * happens once even when many components call this on the same render.
 *
 * Throws (via `redirect`) when:
 *   • there is no auth session — back to /login
 *   • the user has no memberships — to /no-workspace placeholder
 *
 * Multi-tenant note: when the slug routing lands (Phase 3), this function
 * will accept a slug param and verify membership against THAT workspace
 * rather than picking the first one.
 */
export const getCurrentWorkspace = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    redirect("/no-workspace");
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    workspace: membership.workspace,
    role: membership.role,
  };
});

/**
 * Convenience: just the workspace id, when that's all you need.
 */
export async function getCurrentWorkspaceId(): Promise<string> {
  const ctx = await getCurrentWorkspace();
  return ctx.workspace.id;
}
