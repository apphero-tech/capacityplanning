"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Magic-link login form, scoped to a workspace.
 *
 * The OTP redirect lands on `/auth/callback?next=/{slug}` so successful
 * sign-ins drop the user directly inside their workspace.
 */
export function LoginForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "loading" });

    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(`/${slug}`)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
    } else {
      setStatus({ kind: "sent" });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="border-l-2 border-[color:var(--coral)] pl-5 py-2">
        <p className="font-display text-[20px] italic font-light text-[color:var(--ink)] tracking-tight">
          Check your inbox.
        </p>
        <p className="mt-2 text-[13px] text-[color:var(--muted-fg)]">
          A sign-in link was sent to{" "}
          <span className="text-[color:var(--ink)]">{email}</span>. The link
          works for 5 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="email" className="eyebrow block mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@apphero.tech"
          className="w-full bg-transparent border-b hairline-strong text-[color:var(--ink)] text-[18px] py-2 focus:border-[color:var(--coral)] outline-none transition-colors placeholder:text-[color:var(--faint-fg)]"
        />
      </div>

      <button
        type="submit"
        disabled={status.kind === "loading"}
        className="self-start mt-2 inline-flex items-baseline gap-2 text-[13px] tracking-tight text-[color:var(--ink)] border-b hairline-strong hover:text-[color:var(--coral)] hover:border-[color:var(--coral)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status.kind === "loading" ? "Sending…" : "Send magic link"}
        <span aria-hidden>→</span>
      </button>

      {status.kind === "error" && (
        <p className="text-[12px] text-[color:var(--coral)]">{status.message}</p>
      )}
    </form>
  );
}
