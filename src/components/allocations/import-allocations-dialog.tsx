"use client";

import { useRef, useState } from "react";
import { Download, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
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

type PerSheet = {
  sheet: string;
  organization: string;
  imported: number;
  skippedNoRole: number;
  skippedEmpty: number;
  rows: number;
};

type ImportResult = {
  success: boolean;
  imported: number;
  replaced: boolean;
  deleted: number;
  perSheet: PerSheet[];
  errors: { sheet: string; row: number; reason: string }[];
};

export function ImportAllocationsDialog({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replaceAll, setReplaceAll] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setResult(null);
    setError(null);
    setReplaceAll(true);
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replaceAll", replaceAll ? "true" : "false");

    try {
      const res = await fetch("/api/allocations/import-xlsx", {
        method: "POST",
        body: formData,
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
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
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
          <Download className="size-4 mr-1.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/[0.06] bg-slate-900 text-slate-100 max-w-xl">
        <DialogHeader>
          <DialogTitle>Import team allocations</DialogTitle>
          <DialogDescription className="text-slate-400">
            Drop your <span className="font-mono">Team allocation.xlsx</span> file.
            Each sheet becomes an organization (e.g. <span className="font-mono">York</span>, <span className="font-mono">Deloitte</span>). Headers are auto-detected by name so extra columns don&apos;t matter.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
          }}
        />

        {!result && !error && (
          <div className="grid gap-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
                dragging
                  ? "border-[#E31837]/60 bg-[#E31837]/5"
                  : "border-white/10 bg-slate-800/40 hover:border-white/20 hover:bg-slate-800/60"
              }`}
            >
              <FileSpreadsheet className="size-10 text-slate-500 mb-3" />
              <p className="text-sm text-slate-300 font-medium mb-1">
                Drop .xlsx here or click to browse
              </p>
              <p className="text-[11px] text-slate-500">
                One sheet per organization · headers in row 1 or 2
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="size-4 accent-[#E31837]"
              />
              Replace all existing entries before import
            </label>
          </div>
        )}

        {busy && (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-300">
            <Loader2 className="size-4 animate-spin" />
            Reading spreadsheet…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="grid gap-3 text-xs">
            <div className="flex items-center gap-2 rounded-md border border-emerald-900/40 bg-emerald-950/20 p-3 text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Imported {result.imported} team member{result.imported !== 1 ? "s" : ""}
                {result.replaced && result.deleted > 0 && (
                  <span className="text-slate-400"> (replaced {result.deleted} previous)</span>
                )}
              </span>
            </div>

            <section>
              <h4 className="text-slate-300 font-medium mb-1.5">Per sheet</h4>
              <ul className="rounded-md border border-white/[0.06] bg-slate-800/40 divide-y divide-white/[0.04]">
                {result.perSheet.map((p) => (
                  <li key={p.sheet} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 font-medium">
                        {p.sheet} <span className="text-slate-500">→ org &quot;{p.organization}&quot;</span>
                      </span>
                      <span className="text-slate-300">
                        {p.imported}/{p.rows} imported
                      </span>
                    </div>
                    {p.skippedNoRole > 0 && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {p.skippedNoRole} row{p.skippedNoRole !== 1 ? "s" : ""} skipped (no role)
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {result.errors.length > 0 && (
              <section>
                <h4 className="text-amber-300 font-medium mb-1.5">
                  {result.errors.length} skipped row{result.errors.length !== 1 ? "s" : ""}
                </h4>
                <ul className="rounded-md border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10 max-h-32 overflow-auto">
                  {result.errors.map((er, i) => (
                    <li key={i} className="px-3 py-1 text-amber-200">
                      <span className="font-mono">{er.sheet}</span> row {er.row}: {er.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-slate-400"
          >
            {result ? "Close" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
