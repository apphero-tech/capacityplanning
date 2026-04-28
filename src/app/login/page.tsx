import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * Editorial login surface — a single-column composition that echoes the
 * dashboard's masthead (Y. mark, eyebrow, italic display title). One
 * email field, one submit, no password. The user receives a magic link
 * by email, clicks it, lands on /auth/callback which exchanges the code
 * for a session and redirects on into the app.
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-12">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[64px] leading-none font-light text-[color:var(--ink)] tracking-tight">
              Y
            </span>
            <span className="text-[color:var(--coral)] text-3xl leading-none">.</span>
          </div>
          <p className="eyebrow mt-4">York · Capacity Journal</p>
          <h1 className="font-display text-[36px] leading-tight font-light italic mt-3 tracking-tight text-[color:var(--ink)]">
            Sign in.
          </h1>
          <p className="mt-3 text-[14px] text-[color:var(--muted-fg)]">
            Enter your email to receive a magic link.
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <p className="mt-12 text-[11px] italic text-[color:var(--faint-fg)] tracking-wide">
          Access is by invitation only.
        </p>
      </div>
    </main>
  );
}
