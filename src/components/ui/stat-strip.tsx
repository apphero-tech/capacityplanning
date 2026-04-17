import { Fragment, type ReactNode } from "react";

export type Stat = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** When true, render the value in slate-500 (e.g. "—" for not set). */
  muted?: boolean;
};

/**
 * Horizontal stats row used at the top of most pages. Replaces the old
 * coloured KPI cards. Each stat renders as:
 *
 *    Label
 *    Value   hint
 *
 * with thin vertical dividers between stats. No icons, no coloured fills,
 * numbers use tabular-nums so the strip stays aligned as values change.
 * Drop-in component — give it an array of stats and it does the rest.
 */
export function StatStrip({ stats, className = "" }: { stats: Stat[]; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-stretch gap-x-8 gap-y-4 rounded-2xl border border-white/[0.04] bg-slate-900/30 px-5 py-4 ${className}`}
    >
      {stats.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="hidden sm:block w-px self-stretch bg-white/[0.04]" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500">{s.label}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-xl font-semibold tabular-nums ${
                  s.muted ? "text-slate-500" : "text-slate-100"
                }`}
              >
                {s.value}
              </span>
              {s.hint && <span className="text-[12px] text-slate-500">{s.hint}</span>}
            </p>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
