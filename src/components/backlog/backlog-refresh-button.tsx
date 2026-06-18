"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type RefreshResult = {
  success: boolean;
  total: number;
  perSprint: { sprintName: string; imported: number; replaced: number }[];
  skipped: { sprintName: string; reason: string }[];
  unmapped: { key: string; summary: string; status: string; sprint: string }[];
};

/**
 * Pulls the whole backlog straight from Jira (every known sprint's stories)
 * and replaces the stored data — no CSV, no manual export. Same Refresh idiom
 * as the Aging and Transitions tabs.
 */
export function BacklogRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/backlog/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Refresh failed");
      } else {
        setResult(json as RefreshResult);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setOpen(true);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        {busy ? "Refreshing…" : "Refresh from Jira"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <>
                  <AlertTriangle className="size-5 text-destructive" />
                  Refresh failed
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  Backlog refreshed
                </>
              )}
            </DialogTitle>
            {result && (
              <DialogDescription>
                {result.total} stories pulled from Jira across {result.perSprint.length} sprint
                {result.perSprint.length !== 1 ? "s" : ""}.
              </DialogDescription>
            )}
          </DialogHeader>

          {error && <p className="font-mono text-sm text-destructive">{error}</p>}

          {result && (
            <div className="grid gap-4 text-xs">
              <section>
                <h4 className="mb-1.5 font-medium text-muted-foreground">Per sprint</h4>
                <ul className="divide-y divide-[color:var(--line)] rounded-md border hairline bg-[color:var(--paper-elev)]/40">
                  {result.perSprint.map((p) => (
                    <li key={p.sprintName} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-foreground">{p.sprintName}</span>
                      <span className="font-mono tabular-nums text-muted-fg">
                        {p.imported}
                        {p.replaced > 0 ? ` (was ${p.replaced})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {result.skipped.length > 0 && (
                <section>
                  <h4 className="mb-1.5 font-medium text-muted-foreground">
                    {result.skipped.length} sprint{result.skipped.length !== 1 ? "s" : ""} skipped
                  </h4>
                  <ul className="divide-y divide-[color:var(--line)] rounded-md border hairline bg-[color:var(--paper-elev)]/40">
                    {result.skipped.map((s) => (
                      <li key={s.sprintName} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-muted-fg">{s.sprintName}</span>
                        <span className="text-faint-fg">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.unmapped.length > 0 && (
                <section>
                  <h4 className="mb-1.5 font-medium text-amber-400">
                    {result.unmapped.length} stor{result.unmapped.length !== 1 ? "ies" : "y"} with an
                    unmapped status — fix the workflow status in Jira
                  </h4>
                  <ul className="max-h-40 divide-y divide-amber-500/10 overflow-auto rounded-md border border-amber-500/20 bg-amber-500/5">
                    {result.unmapped.map((s) => (
                      <li key={s.key} className="px-3 py-1.5 text-amber-200">
                        <span className="font-mono">{s.key}</span>
                        <span className="ml-2 text-amber-100">{s.summary}</span>
                        <span className="ml-2 text-amber-400/70">({s.status})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {(result || error) && (
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="size-4" />
                Close
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
