"use client";

import * as React from "react";

/**
 * Apple-style segmented control. The selected segment floats on a lighter
 * fill with a soft shadow, unselected segments are just text in slate-400.
 * Accent colour is kept neutral on purpose — the current-sprint red is too
 * loud for a filter that the user toggles constantly. Use it for any small
 * set of mutually exclusive options (2–6 items ideally).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizing =
    size === "sm"
      ? "text-[11px] h-7 px-2.5"
      : "text-[13px] h-8 px-3";

  return (
    <div
      className={`inline-flex items-center rounded-lg bg-slate-900/80 ring-1 ring-inset ring-white/[0.06] p-0.5 ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={selected}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={`relative rounded-[7px] font-medium transition-all duration-150 ${sizing} ${
              selected
                ? "bg-white/[0.08] text-slate-50 shadow-[0_1px_0_rgba(255,255,255,0.04)]"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Horizontal chip filter for larger sets (6+). Single-row, scrolls if needed
 * on narrow viewports. Same neutral selection as SegmentedControl.
 */
/**
 * Flat tab-style filter for 5+ options — wraps to the next line on narrow
 * viewports, no horizontal scroll. Borderless; selected gets a subtle
 * bg-white/[0.06] fill, unselected is plain slate-500 text. Inspired by
 * Linear, Arc and Vercel admin tab bars.
 */
export function ChipFilter<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
              selected
                ? "bg-white/[0.06] text-slate-50"
                : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
