import { cache } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the active workspace for the current request.
 *
 * Slug resolution order:
 *   1. Explicit `slug` argument (used by `[slug]/layout.tsx` to validate
 *      the URL parameter).
 *   2. `x-workspace-slug` request header (set by middleware from the URL).
 *      This is what every `data.ts` query reads — no plumbing needed.
 *   3. Fallback: the user's first workspace (lowest createdAt on
 *      Membership). Only hit by routes that aren't workspace-scoped, like
 *      the post-login redirect.
 *
 * 404s when the workspace exists but the user has no membership for it
 * (treated like "doesn't exist" — never leak existence cross-tenant).
 *
 * Cached per request via React's `cache()` so several callers within the
 * same render share one DB lookup.
 */
export const getCurrentWorkspace = cache(async (slug?: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Resolve the slug source.
  let resolvedSlug = slug;
  if (!resolvedSlug) {
    const h = await headers();
    resolvedSlug = h.get("x-workspace-slug") ?? undefined;
  }

  if (resolvedSlug) {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: resolvedSlug },
    });
    if (!workspace) notFound();

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
      },
    });
    if (!membership) notFound();

    return {
      userId: user.id,
      email: user.email ?? null,
      workspace,
      role: membership.role,
    };
  }

  // No slug context — fall back to the user's first workspace.
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

export async function getCurrentWorkspaceId(slug?: string): Promise<string> {
  const ctx = await getCurrentWorkspace(slug);
  return ctx.workspace.id;
}
