import * as React from "react";

/**
 * Standard page header — the single title idiom across every tab.
 *
 * Aligned on the Aging/Transitions look: a 2xl bold title and a muted
 * subtitle, on a hairline rule, with an optional right-aligned actions slot
 * (Refresh, Import, Add…). Token-based colours only — no hardcoded slate, no
 * serif. The page title intentionally repeats the active sidebar label so each
 * view states what it is.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-fg">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  );
}
