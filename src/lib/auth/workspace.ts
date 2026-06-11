import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the active workspace — local, single-user, no auth.
 *
 * Slug resolution order:
 *   1. Explicit `slug` argument (used by `[slug]/layout.tsx`).
 *   2. `x-workspace-slug` request header (set by middleware from the URL) —
 *      this is what every `data.ts` query reads.
 *   3. Fallback: the first workspace in the DB.
 *
 * There is no membership/auth check: this app runs entirely on the local
 * machine for a single person.
 */
export const getCurrentWorkspace = cache(async (slug?: string) => {
  let resolvedSlug = slug;
  if (!resolvedSlug) {
    const h = await headers();
    resolvedSlug = h.get("x-workspace-slug") ?? undefined;
  }

  if (resolvedSlug) {
    const workspace = await prisma.workspace.findUnique({ where: { slug: resolvedSlug } });
    if (!workspace) notFound();
    return { userId: "local", email: null as string | null, workspace, role: "OWNER" };
  }

  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!workspace) {
    throw new Error("No workspace found — run `npm run setup` to create the local workspace.");
  }
  return { userId: "local", email: null as string | null, workspace, role: "OWNER" };
});

export async function getCurrentWorkspaceId(slug?: string): Promise<string> {
  const ctx = await getCurrentWorkspace(slug);
  return ctx.workspace.id;
}
