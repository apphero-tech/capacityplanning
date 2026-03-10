"use client";

interface Payload {
  value?: number;
  name?: string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  formatter?: (value: number, name: string) => [string, string];
}

/**
 * Shared dark-theme tooltip for all Recharts charts.
 * Replaces the default white-background tooltip with a glassmorphism style.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur-md">
      {label && (
        <p className="mb-1.5 text-[11px] font-medium text-slate-400">
          {label}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const color = entry.color ?? "#94a3b8";
          const [displayValue, displayName] = formatter
            ? formatter(entry.value as number, entry.name as string)
            : [String(entry.value ?? "—"), entry.name ?? ""];
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-slate-400">{displayName}</span>
              <span className="ml-auto font-medium text-slate-100">
                {displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Cursor style for BarChart / AreaChart hover — subtle translucent highlight. */
export const chartCursorStyle = { fill: "rgba(255,255,255,0.04)" };
