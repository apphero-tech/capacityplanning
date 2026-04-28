import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

/**
 * Workspace-branded login.
 *
 * Fetches the workspace by slug server-side, applies its accent colour
 * via inline CSS variables on the root container so the form shows the
 * client's brand instead of the default coral. After a successful magic
 * link, the user is redirected straight to `/{slug}` rather than the
 * generic root redirect.
 *
 * Route is public — the project-root middleware skips auth on
 * `/login/...`. We never reveal whether a workspace exists to a logged-out
 * user beyond what's already implied by the URL: bad slug → 404.
 */
export default async function WorkspaceLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { name: true, slug: true, accentColor: true },
  });

  if (!workspace) notFound();

  const accentSoft = `${workspace.accentColor}1f`;

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={
        {
          "--coral": workspace.accentColor,
          "--coral-soft": accentSoft,
          "--primary": workspace.accentColor,
          "--ring": workspace.accentColor,
        } as React.CSSProperties
      }
    >
      <div className="w-full max-w-md">
        <div className="mb-12">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[64px] leading-none font-light text-[color:var(--ink)] tracking-tight">
              Y
            </span>
            <span className="text-[color:var(--coral)] text-3xl leading-none">.</span>
          </div>
          <p className="eyebrow mt-4">{workspace.name} · Capacity</p>
          <h1 className="mt-3 font-display text-[36px] leading-tight font-light italic tracking-tight text-[color:var(--ink)]">
            Sign in.
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--muted-fg)]">
            Enter your email to receive a magic link for{" "}
            <span className="text-[color:var(--ink)]">{workspace.name}</span>.
          </p>
        </div>

        <Suspense>
          <LoginForm slug={workspace.slug} />
        </Suspense>

        <p className="mt-12 text-[11px] italic text-[color:var(--faint-fg)] tracking-wide">
          Access is by invitation only.
        </p>
      </div>
    </main>
  );
}
