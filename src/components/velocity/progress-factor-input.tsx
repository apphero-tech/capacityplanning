"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Project-wide growth factor applied on top of the historical moving
 * average to set the next sprint's target. The value is a fraction
 * (0.10 = +10%). Same input pattern as FocusFactorInput so the two
 * planning knobs feel like siblings.
 */
export function ProgressFactorInput({ initial }: { initial: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState(String(Math.round(initial * 100)));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const num = Number(draft);
    if (Number.isNaN(num)) {
      setDraft(String(Math.round(initial * 100)));
      return;
    }
    const clamped = Math.max(-100, Math.min(500, num));
    setDraft(String(clamped));
    const next = clamped / 100;
    if (Math.abs(next - initial) < 0.0001) return;

    setSaving(true);
    try {
      const res = await fetch("/api/sprints/progress-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-slate-800/50 px-2.5 py-1 text-xs text-slate-400"
      title="Growth factor applied to moving-average velocity for next-sprint target"
    >
      <TrendingUp className="size-3.5" />
      <span>Progress</span>
      <Input
        type="number"
        min={-100}
        max={500}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        disabled={saving}
        className="h-6 w-14 border-white/10 bg-slate-900 px-1.5 py-0 text-center text-xs text-slate-200"
      />
      <span>%</span>
      {saving && <Loader2 className="size-3 animate-spin text-slate-500" />}
    </div>
  );
}
