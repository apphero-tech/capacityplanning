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

// Keep in sync with API route.

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
          className="border-line bg-[color:var(--paper-elev)] text-foreground hover:bg-[color:var(--paper-elev)]"
        >
          <Download className="size-4 mr-1.5" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="border-line bg-card text-foreground max-w-xl">
        <DialogHeader>
          <DialogTitle>Import team allocations</DialogTitle>
          <DialogDescription className="text-muted-fg">
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
                  : "border-line bg-[color:var(--paper-elev)] hover:border-line-strong hover:bg-[color:var(--paper-elev)]"
              }`}
            >
              <FileSpreadsheet className="size-10 text-faint-fg mb-3" />
              <p className="text-sm text-foreground font-medium mb-1">
                Drop .xlsx here or click to browse
              </p>
              <p className="text-[11px] text-faint-fg">
                One sheet per organization · headers in row 1 or 2
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
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
          <div className="flex items-center justify-center gap-2 py-6 text-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reading spreadsheet…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/50 bg-danger/30 p-3 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="grid gap-3 text-xs">
            <div className="flex items-center gap-2 rounded-md border border-ok/40 bg-ok/20 p-3 text-ok">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                Imported {result.imported} team member{result.imported !== 1 ? "s" : ""}
                {result.replaced && result.deleted > 0 && (
                  <span className="text-muted-fg"> (replaced {result.deleted} previous)</span>
                )}
              </span>
            </div>

            <section>
              <h4 className="text-foreground font-medium mb-1.5">Per sheet</h4>
              <ul className="rounded-md border border-line bg-[color:var(--paper-elev)] divide-y divide-[color:var(--line)]">
                {result.perSheet.map((p) => (
                  <li key={p.sheet} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium">
                        {p.sheet} <span className="text-faint-fg">→ org &quot;{p.organization}&quot;</span>
                      </span>
                      <span className="text-foreground">
                        {p.imported}/{p.rows} imported
                      </span>
                    </div>
                    {p.skippedNoRole > 0 && (
                      <p className="text-[11px] text-faint-fg mt-0.5">
                        {p.skippedNoRole} placeholder row{p.skippedNoRole !== 1 ? "s" : ""} skipped (no role — not a resource yet)
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {result.errors.length > 0 && (
              <section>
                <h4 className="text-warn font-medium mb-1.5">
                  {result.errors.length} skipped row{result.errors.length !== 1 ? "s" : ""}
                </h4>
                <ul className="rounded-md border border-warn/20 bg-warn/5 divide-y divide-warn/10 max-h-32 overflow-auto">
                  {result.errors.map((er, i) => (
                    <li key={i} className="px-3 py-1 text-warn">
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
            className="text-muted-fg"
          >
            {result ? "Close" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
