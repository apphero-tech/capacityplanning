"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddSprintDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    workingDays: 20,
    isCurrent: false,
  });

  function reset() {
    setForm({ name: "", startDate: "", endDate: "", workingDays: 20, isCurrent: false });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          workingDays: form.workingDays,
          isCurrent: form.isCurrent,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create sprint");
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
          <Plus className="size-4 mr-1.5" />
          Add Sprint
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/[0.06] bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Add Sprint</DialogTitle>
          <DialogDescription className="text-slate-400">
            Define a new sprint. Dates use the format YYYY-MM-DD (e.g. 2026-04-21).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Sprint 8"
              required
              className="border-white/10 bg-slate-800 text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Start date</label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="border-white/10 bg-slate-800 text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">End date</label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="border-white/10 bg-slate-800 text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Working days in sprint</label>
            <Input
              type="number"
              min={1}
              max={40}
              value={form.workingDays}
              onChange={(e) =>
                setForm((f) => ({ ...f, workingDays: parseInt(e.target.value) || 20 }))
              }
              className="border-white/10 bg-slate-800 text-slate-200"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isCurrent}
              onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))}
              className="size-4 accent-[#E31837]"
            />
            Mark as current sprint
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#E31837] hover:bg-[#c01530] text-white"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="size-4 mr-1.5" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
