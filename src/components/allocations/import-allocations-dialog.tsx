"use client";

import { useState } from "react";
import { Upload, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ImportResult = {
  imported: number;
  deleted: number;
  replaced: boolean;
  organization?: string;
  errors: { row: number; reason: string }[];
};

export function ImportAllocationsDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState("");
  const [organization, setOrganization] = useState("");
  const [replaceAll, setReplaceAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setData("");
    setOrganization("");
    setResult(null);
    setError(null);
    setReplaceAll(true);
  }

  async function handleImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/allocations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, replaceAll, organization }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed");
      } else {
        setResult(json as ImportResult);
        onImported();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-white/[0.06] bg-slate-800/50 text-slate-300 hover:bg-slate-700/50"
        >
          <Upload className="size-4 mr-1.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/[0.06] bg-slate-900 text-slate-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Allocations</DialogTitle>
          <DialogDescription className="text-slate-400">
            Paste rows copied from Excel or Google Sheets. The first row must be headers.
            Column order doesn&apos;t matter — headers are matched by name.
            <span className="block mt-1 font-mono text-[11px] text-slate-500">
              Last name · First name · Role · FT/PT · Hrs/week · Stream · Refinement · Design · Development · QA · KT · Lead · PMO · Retrofits/Integrations · OCM (Comms & Engagement) · OCM (End-User Training) · Other
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Organization <span className="text-slate-600">(applied to every imported row)</span>
            </label>
            <input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. Deloitte, York, ..."
              className="w-full text-sm rounded-md border border-white/10 bg-slate-800 px-2 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#E31837]/50"
            />
          </div>

          <textarea
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder={"Last name\tFirst name\tRole\tFT/PT\tHrs per week\tRefinement\tDesign\tDevelopment\tQA\tKT\tLead\tPMO\tOther\nVan Oordt\tMarc\tEngagement Manager\tPT\t16\t\t\t\t\t\t\t50%\t50%\n..."}
            className="min-h-[200px] font-mono text-xs rounded-md border border-white/10 bg-slate-800 p-2 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#E31837]/50"
            spellCheck={false}
          />

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={replaceAll}
              onChange={(e) => setReplaceAll(e.target.checked)}
              className="size-4 accent-[#E31837]"
            />
            Replace all existing entries before import
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-white/10 bg-slate-800/50 p-3 text-xs text-slate-300">
              <div className="flex items-center gap-2 text-emerald-400 font-medium mb-1">
                <CheckCircle2 className="size-4" />
                Imported {result.imported} {result.imported === 1 ? "entry" : "entries"}
                {result.replaced && result.deleted > 0 && (
                  <span className="text-slate-400 font-normal">
                    (replaced {result.deleted} previous)
                  </span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <div className="text-amber-400 font-medium mb-1">
                    {result.errors.length} row(s) skipped:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 max-h-32 overflow-auto">
                    {result.errors.map((er, i) => (
                      <li key={i}>
                        Row {er.row}: {er.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-slate-400"
          >
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={busy || !data.trim()}
            className="bg-[#E31837] hover:bg-[#c01530] text-white"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Upload className="size-4 mr-1.5" />
            )}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
