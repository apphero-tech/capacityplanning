"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AutoImportResult = {
  success: boolean;
  mode: "auto-split";
  totalRows: number;
  assigned: number;
  perSprint: { sprintId: string; sprintName: string; imported: number; replaced: number }[];
  noSprintByStatus: Record<string, number>;
  unknownSprintCounts: Record<string, number>;
  newStatusStories: { key: string; summary: string; sprint: string }[];
  warnings: string[];
  detectedColumns: string[];
};

/**
 * One-shot button that uploads the entire Jira CSV and lets the server
 * dispatch each story to its sprint based on the "Sprint" column. Avoids
 * forcing the user to filter and upload sprint by sprint.
 */
export function BacklogAutoImportButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AutoImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    // Note: no sprintId → server runs in auto-split mode.

    try {
      const res = await fetch("/api/backlog/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed");
      } else {
        setResult(json as AutoImportResult);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  const noSprintTotal = result
    ? Object.values(result.noSprintByStatus).reduce((s, n) => s + n, 0)
    : 0;
  const unknownSprintTotal = result
    ? Object.values(result.unknownSprintCounts).reduce((s, n) => s + n, 0)
    : 0;
  const newStatusTotal = result?.newStatusStories?.length ?? 0;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
      />

      <Button
        variant="outline"
        size="sm"
        className="border-white/[0.06] bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin mr-1.5" />
        ) : (
          <Download className="size-4 mr-1.5" />
        )}
        Import Backlog
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="border-white/[0.06] bg-slate-900 text-slate-100 max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {error ? (
                <>
                  <AlertTriangle className="size-5 text-red-400" />
                  Import failed
                </>
              ) : result ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  Import complete
                </>
              ) : (
                <>
                  <Download className="size-5 text-slate-300" />
                  Import Jira backlog
                </>
              )}
            </DialogTitle>
            {result && (
              <DialogDescription className="text-slate-400">
                {result.assigned} of {result.totalRows} stories assigned to {result.perSprint.length}{" "}
                sprint{result.perSprint.length !== 1 ? "s" : ""}.
              </DialogDescription>
            )}
          </DialogHeader>

          {!result && !error && (
            <div className="grid gap-3 text-xs">
              <section className="rounded-md border border-white/[0.06] bg-slate-800/40 p-3 space-y-2 text-slate-300">
                <p className="font-medium text-slate-200">
                  Which file to bring from Jira
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Open the Jira project, go to <span className="text-slate-200">Filters → Advanced issue search</span> (or any saved filter listing every user story of the project).</li>
                  <li>Add the filter <span className="font-mono text-slate-200">issuetype = Story</span> (bugs, tasks and subtasks must be excluded — they are not part of the capacity backlog).</li>
                  <li>Include <strong>every sprint</strong> you care about (past, current, future — no sprint filter).</li>
                  <li>From the result list, click <span className="text-slate-200">Export → Export CSV (all fields)</span>. The file must contain the columns <span className="font-mono text-slate-200">Issue key</span>, <span className="font-mono text-slate-200">Summary</span>, <span className="font-mono text-slate-200">Status</span>, <span className="font-mono text-slate-200">Sprint</span>, <span className="font-mono text-slate-200">Story Points</span>.</li>
                  <li>Upload the CSV below.</li>
                </ol>
                <p className="text-[11px] text-slate-500">
                  The dispatcher uses the <strong>last</strong> value of the Sprint column (Jira keeps the carry-over history). Stories in &quot;New&quot; status are reported for correction. Stories past DEV (order ≥ 40) on non-active sprints are skipped to match the Jira board counts.
                </p>
              </section>

              <Button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="bg-[#E31837] hover:bg-[#c01530] text-white"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Download className="size-4 mr-1.5" />
                )}
                Select CSV file
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          {result && (
            <div className="grid gap-4 text-xs">
              <section>
                <h4 className="text-slate-300 font-medium mb-1.5">Per sprint</h4>
                <ul className="rounded-md border border-white/[0.06] bg-slate-800/40 divide-y divide-white/[0.04]">
                  {result.perSprint.map((p) => (
                    <li key={p.sprintId} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-slate-200">{p.sprintName}</span>
                      <span className="text-slate-400">
                        {p.imported}{p.replaced > 0 ? ` (replaced ${p.replaced})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {noSprintTotal > 0 && (
                <section>
                  <h4 className="text-slate-300 font-medium mb-1.5">
                    {noSprintTotal} stories without sprint (skipped)
                  </h4>
                  <ul className="rounded-md border border-white/[0.06] bg-slate-800/40 divide-y divide-white/[0.04] max-h-40 overflow-auto">
                    {Object.entries(result.noSprintByStatus).map(([status, n]) => (
                      <li key={status} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-slate-400">{status}</span>
                        <span className="text-slate-500">{n}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {newStatusTotal > 0 && (
                <section>
                  <h4 className="text-slate-300 font-medium mb-1.5">
                    {newStatusTotal} stor{newStatusTotal !== 1 ? "ies" : "y"} in &quot;New&quot; status — please set a real workflow status in Jira
                  </h4>
                  <ul className="rounded-md border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10 max-h-40 overflow-auto">
                    {result.newStatusStories.map((s) => (
                      <li key={s.key} className="px-3 py-1.5 text-amber-200">
                        <span className="font-mono">{s.key}</span>
                        <span className="text-amber-100 ml-2">{s.summary}</span>
                        <span className="text-amber-400/70 ml-2">({s.sprint})</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {unknownSprintTotal > 0 && (
                <section>
                  <h4 className="text-slate-300 font-medium mb-1.5">
                    {unknownSprintTotal} stories targeted unknown sprints (not yet in app)
                  </h4>
                  <ul className="rounded-md border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10 max-h-40 overflow-auto">
                    {Object.entries(result.unknownSprintCounts).map(([sprint, n]) => (
                      <li key={sprint} className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-amber-200">{sprint}</span>
                        <span className="text-amber-300">{n}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Add these sprints in the Sprints page (or to the seed) and re-import to attach them.
                  </p>
                </section>
              )}

              {result.warnings.length > 0 && (
                <section>
                  <h4 className="text-slate-300 font-medium mb-1.5">
                    {result.warnings.length} parser warning{result.warnings.length !== 1 ? "s" : ""}
                  </h4>
                  <ul className="rounded-md border border-white/[0.06] bg-slate-800/40 divide-y divide-white/[0.04] max-h-32 overflow-auto">
                    {result.warnings.slice(0, 50).map((w, i) => (
                      <li key={i} className="px-3 py-1 text-slate-500">
                        {w}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {(result || error) && (
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => { setOpen(false); reset(); }}
                className="text-slate-400"
              >
                <X className="size-4 mr-1.5" />
                Close
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
