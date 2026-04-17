"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { InitialCapacity, Country, FtPt } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { ImportAllocationsDialog } from "@/components/allocations/import-allocations-dialog";
import { SegmentedControl, ChipFilter } from "@/components/ui/segmented-control";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOCATION_COLUMNS = [
  { key: "refinement",  label: "Refinement",                short: "REF" },
  { key: "design",      label: "Design",                    short: "DES" },
  { key: "development", label: "Development",               short: "DEV" },
  { key: "qa",          label: "QA",                        short: "QA" },
  { key: "kt",          label: "KT",                        short: "KT" },
  { key: "lead",        label: "Lead",                      short: "Lead" },
  { key: "pmo",         label: "PMO",                       short: "PMO" },
  { key: "retrofits",   label: "Retrofits / Integrations",  short: "Retro" },
  { key: "ocmComms",    label: "OCM Comms & Engagement",    short: "OCM-C" },
  { key: "ocmTraining", label: "OCM End-User Training",     short: "OCM-T" },
  { key: "other",       label: "Other",                     short: "Other" },
] as const;

type AllocKey = (typeof ALLOCATION_COLUMNS)[number]["key"];

const LOCATIONS: Country[] = ["Quebec", "Canada", "India", "USA", "Venezuela", ""];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCellColor(pct: number): string {
  // Monochrome intensity ramp — a percentage is just a number, no need to
  // scream in red. Stronger allocation = more contrasty text, zero stays
  // invisible.
  if (pct === 0) return "text-slate-700";
  if (pct <= 25) return "text-slate-400";
  if (pct <= 50) return "text-slate-300";
  if (pct <= 75) return "text-slate-200";
  return "text-slate-50 font-semibold";
}

function getTotalAllocation(cap: InitialCapacity): number {
  return (
    cap.refinement +
    cap.design +
    cap.development +
    cap.qa +
    cap.kt +
    cap.lead +
    cap.pmo +
    cap.other
  );
}

// ---------------------------------------------------------------------------
// Editable Cell
// ---------------------------------------------------------------------------

function EditablePercentCell({
  value,
  onSave,
  saving,
}: {
  value: number;
  onSave: (val: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pct = Math.round(value * 100);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleStart() {
    setDraft(String(pct));
    setEditing(true);
  }

  function handleSave() {
    const num = parseInt(draft, 10);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onSave(num / 100);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={0}
        max={100}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-6 w-14 text-center text-xs px-1 border-white/10 bg-slate-800 text-slate-200"
      />
    );
  }

  return (
    <button
      onClick={handleStart}
      disabled={saving}
      className={`w-full text-center text-[12px] tabular-nums rounded cursor-pointer hover:bg-white/[0.03] transition-colors px-1 py-1 ${getCellColor(pct)}`}
    >
      {pct > 0 ? `${pct}%` : <span className="text-slate-700">&mdash;</span>}
    </button>
  );
}

function EditableTextCell({
  value,
  onSave,
  saving,
  className = "",
}: {
  value: string;
  onSave: (val: string) => void;
  saving: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleStart() {
    setDraft(value);
    setEditing(true);
  }

  function handleSave() {
    if (draft !== value) {
      onSave(draft);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-6 w-full text-xs px-1 border-white/10 bg-slate-800 text-slate-200"
      />
    );
  }

  return (
    <button
      onClick={handleStart}
      disabled={saving}
      className={`text-left cursor-pointer hover:text-slate-100 transition-colors ${className}`}
    >
      {value || <span className="text-slate-600 italic">-</span>}
    </button>
  );
}

function EditableNumberCell({
  value,
  onSave,
  saving,
}: {
  value: number;
  onSave: (val: number) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleStart() {
    setDraft(String(value));
    setEditing(true);
  }

  function handleSave() {
    const num = parseFloat(draft);
    if (!isNaN(num) && num > 0) {
      onSave(num);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-6 w-16 text-right text-xs px-1 border-white/10 bg-slate-800 text-slate-200"
      />
    );
  }

  return (
    <button
      onClick={handleStart}
      disabled={saving}
      className="text-right cursor-pointer text-slate-300 hover:text-slate-100 transition-colors"
    >
      {value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Add Member Dialog
// ---------------------------------------------------------------------------

function AddMemberDialog({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    role: "",
    location: "Quebec" as Country,
    ftPt: "FT" as FtPt,
    hrsPerWeek: 37.5,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.lastName || !form.firstName || !form.role) return;

    setSaving(true);
    try {
      const res = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          refinement: 0,
          design: 0,
          development: 0,
          qa: 0,
          kt: 0,
          lead: 0,
          pmo: 0,
          other: 0,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setForm({ lastName: "", firstName: "", role: "", location: "Quebec", ftPt: "FT", hrsPerWeek: 37.5 });
        onAdd();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-white/[0.06] bg-slate-800/50 text-slate-300 hover:bg-slate-700/50">
          <Plus className="size-4 mr-1.5" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="border-white/[0.06] bg-slate-900 text-slate-100">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription className="text-slate-400">
            Add a new team member to the allocation matrix.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Last Name</label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
                className="border-white/10 bg-slate-800 text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">First Name</label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
                className="border-white/10 bg-slate-800 text-slate-200"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Role</label>
            <Input
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              required
              className="border-white/10 bg-slate-800 text-slate-200"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Location</label>
              <Select
                value={form.location || "_empty"}
                onValueChange={(v) => setForm((f) => ({ ...f, location: (v === "_empty" ? "" : v) as Country }))}
              >
                <SelectTrigger className="border-white/10 bg-slate-800 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-slate-900">
                  {LOCATIONS.map((l) => (
                    <SelectItem key={l || "_empty"} value={l || "_empty"}>{l || "(none)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">FT/PT</label>
              <Select
                value={form.ftPt}
                onValueChange={(v) => setForm((f) => ({ ...f, ftPt: v as FtPt }))}
              >
                <SelectTrigger className="border-white/10 bg-slate-800 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/[0.06] bg-slate-900">
                  <SelectItem value="FT">FT</SelectItem>
                  <SelectItem value="PT">PT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Hrs/Week</label>
              <Input
                type="number"
                min={1}
                value={form.hrsPerWeek}
                onChange={(e) => setForm((f) => ({ ...f, hrsPerWeek: parseFloat(e.target.value) || 37.5 }))}
                className="border-white/10 bg-slate-800 text-slate-200"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-[#E31837] hover:bg-[#c01530] text-white">
              {saving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Plus className="size-4 mr-1.5" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AllocationsViewProps {
  capacities: InitialCapacity[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllocationsView({ capacities }: AllocationsViewProps) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [streamFilter, setStreamFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /**
   * Primary stream of a member = the allocation column holding the largest
   * percentage. Returns null when every allocation is 0. We derive it on the
   * fly rather than trusting cap.stream so it stays in sync with any edit
   * made to the matrix cells.
   */
  const primaryStreamOf = useCallback((cap: InitialCapacity): string | null => {
    let best: { label: string; value: number } | null = null;
    for (const col of ALLOCATION_COLUMNS) {
      const v = cap[col.key as AllocKey] as number;
      if (v > 0 && (!best || v > best.value)) {
        best = { label: col.short, value: v };
      }
    }
    return best?.label ?? null;
  }, []);

  const roles = useMemo(() => {
    const set = new Set<string>();
    capacities.forEach((c) => {
      if (c.role) set.add(c.role);
    });
    return Array.from(set).sort();
  }, [capacities]);

  const organizations = useMemo(() => {
    const set = new Set<string>();
    capacities.forEach((c) => {
      if (c.organization) set.add(c.organization);
    });
    return Array.from(set).sort();
  }, [capacities]);

  // Streams available in the currently-selected org slice (to pre-filter before role).
  // A stream only appears as a pill if at least one member of the current org
  // actually has > 0 in that allocation column — empty streams are hidden.
  const availableStreams = useMemo(() => {
    const forOrg = orgFilter === "all"
      ? capacities
      : capacities.filter((c) => c.organization === orgFilter);
    const set = new Set<string>();
    forOrg.forEach((c) => {
      const s = primaryStreamOf(c);
      if (s) set.add(s);
    });
    // Preserve canonical pipeline order from ALLOCATION_COLUMNS.
    return ALLOCATION_COLUMNS.filter((col) => set.has(col.short)).map((c) => c.short);
  }, [capacities, orgFilter, primaryStreamOf]);

  // Auto-reset streamFilter when the current selection disappears from the pills.
  useEffect(() => {
    if (streamFilter !== "all" && !availableStreams.includes(streamFilter)) {
      setStreamFilter("all");
    }
  }, [availableStreams, streamFilter]);

  const filtered = useMemo(() => {
    return capacities.filter((c) => {
      if (roleFilter !== "all" && c.role !== roleFilter) return false;
      if (orgFilter !== "all" && c.organization !== orgFilter) return false;
      if (streamFilter !== "all" && primaryStreamOf(c) !== streamFilter) return false;
      return true;
    });
  }, [capacities, roleFilter, orgFilter, streamFilter, primaryStreamOf]);

  // Allocation columns that carry any non-zero value for the filtered rows.
  // This hides Lead/PMO when viewing York, and OCM-C/OCM-T/Retro when viewing
  // Deloitte, without hardcoding the split.
  const visibleAllocationColumns = useMemo(() => {
    if (filtered.length === 0) return ALLOCATION_COLUMNS;
    return ALLOCATION_COLUMNS.filter((col) =>
      filtered.some((c) => (c[col.key as AllocKey] as number) > 0),
    );
  }, [filtered]);

  const totalMembers = filtered.length;
  const avgHrsPerWeek =
    totalMembers > 0
      ? filtered.reduce((sum, c) => sum + c.hrsPerWeek, 0) / totalMembers
      : 0;

  const saveField = useCallback(async (id: string, field: string, value: string | number | boolean) => {
    setSavingId(id);
    try {
      await fetch(`/api/allocations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      router.refresh();
    } finally {
      setSavingId(null);
    }
  }, [router]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the team?`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/allocations/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }, [router]);

  const handleAdd = useCallback(() => {
    router.refresh();
  }, [router]);

  // Org + stream toolbar options
  const orgOptions = useMemo(() => {
    const base: { value: string; label: string }[] = [
      { value: "all", label: "All" },
      { value: "Deloitte", label: "Deloitte" },
      { value: "York", label: "York" },
    ];
    const known = new Set(base.map((b) => b.value));
    const extras = organizations
      .filter((o) => !known.has(o))
      .map((o) => ({ value: o, label: o }));
    return [...base, ...extras];
  }, [organizations]);

  const streamOptions = useMemo(
    () => [
      { value: "all", label: "All streams" },
      ...availableStreams.map((s) => ({ value: s, label: s })),
    ],
    [availableStreams],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: primary org toggle + live stats + import */}
      <div className="flex items-center flex-wrap gap-x-4 gap-y-3">
        <SegmentedControl
          options={orgOptions}
          value={orgFilter}
          onChange={setOrgFilter}
        />
        <p className="text-[12px] text-slate-500 tabular-nums">
          <span className="text-slate-300 font-medium">{totalMembers}</span>
          {" "}{totalMembers === 1 ? "person" : "people"}
          <span className="text-slate-700 mx-1.5">·</span>
          avg{" "}
          <span className="text-slate-300 font-medium">{avgHrsPerWeek.toFixed(1)}</span>
          {" "}hrs/wk
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[150px] border-white/10 bg-slate-900/60 text-[13px] text-slate-300">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ImportAllocationsDialog onImported={handleAdd} />
        </div>
      </div>

      {/* Row 2: stream pills — only when the org slice has more than one */}
      {streamOptions.length > 1 && (
        <ChipFilter
          options={streamOptions}
          value={streamFilter}
          onChange={setStreamFilter}
        />
      )}

      {/* Allocation grid — no wrapper card, lets the table breathe edge-to-edge */}
      <div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.04] hover:bg-transparent">
                <TableHead className="text-[11px] font-medium text-slate-500 min-w-[200px]">
                  Name
                </TableHead>
                <TableHead className="text-[11px] font-medium text-slate-500 min-w-[80px]">
                  Org
                </TableHead>
                <TableHead className="text-[11px] font-medium text-slate-500">
                  Role
                </TableHead>
                <TableHead className="text-[11px] font-medium text-slate-500 text-center w-12">
                  FT
                </TableHead>
                <TableHead className="text-[11px] font-medium text-slate-500 text-right w-16">
                  Hrs
                </TableHead>
                {visibleAllocationColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-[11px] font-medium text-slate-500 text-center min-w-[60px]"
                  >
                    {col.short}
                  </TableHead>
                ))}
                <TableHead className="text-[11px] font-medium text-slate-500 text-center w-14">
                  Total
                </TableHead>
                <TableHead className="text-center w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-white/[0.06]">
                  <TableCell
                    colSpan={4 + ALLOCATION_COLUMNS.length + 2}
                    className="text-center text-slate-500 py-8"
                  >
                    No allocation data found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((cap) => {
                  const total = getTotalAllocation(cap);
                  const isComplete = total >= 0.995 && total <= 1.005;
                  const isSaving = savingId === cap.id;
                  const isDeleting = deletingId === cap.id;

                  return (
                    <TableRow
                      key={cap.id}
                      className={`border-white/[0.06] hover:bg-white/[0.02] ${isDeleting ? "opacity-50" : ""}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => saveField(cap.id, "isActive", !cap.isActive)}
                            disabled={isSaving}
                            title={cap.isActive ? "Active — click to mark inactive" : "Inactive — click to activate"}
                            className={`size-1.5 rounded-full shrink-0 transition-colors ${
                              cap.isActive
                                ? "bg-emerald-400 hover:bg-emerald-300"
                                : "bg-slate-700 hover:bg-slate-500"
                            }`}
                          />
                          <div className={`flex gap-1 ${cap.isActive ? "" : "opacity-50"}`}>
                            <EditableTextCell
                              value={cap.firstName}
                              onSave={(v) => saveField(cap.id, "firstName", v)}
                              saving={isSaving}
                              className="font-medium text-slate-100"
                            />
                            <EditableTextCell
                              value={cap.lastName}
                              onSave={(v) => saveField(cap.id, "lastName", v)}
                              saving={isSaving}
                              className="font-medium text-slate-100"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <EditableTextCell
                          value={cap.organization}
                          onSave={(v) => saveField(cap.id, "organization", v)}
                          saving={isSaving}
                          className="text-slate-400 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <EditableTextCell
                          value={cap.role}
                          onSave={(v) => saveField(cap.id, "role", v)}
                          saving={isSaving}
                          className="text-slate-400 text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => saveField(cap.id, "ftPt", cap.ftPt === "FT" ? "PT" : "FT")}
                          disabled={isSaving}
                          className="text-[12px] text-slate-400 hover:text-slate-200 transition-colors"
                          title="Click to toggle FT/PT"
                        >
                          {cap.ftPt}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableNumberCell
                          value={cap.hrsPerWeek}
                          onSave={(v) => saveField(cap.id, "hrsPerWeek", v)}
                          saving={isSaving}
                        />
                      </TableCell>
                      {visibleAllocationColumns.map((col) => {
                        const val = cap[col.key as AllocKey] as number;
                        return (
                          <TableCell key={col.key} className="p-1">
                            <EditablePercentCell
                              value={val}
                              onSave={(v) => saveField(cap.id, col.key, v)}
                              saving={isSaving}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell
                        className={`text-center text-xs font-semibold ${
                          isComplete
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`}
                      >
                        {Math.round(total * 100)}%
                      </TableCell>
                      <TableCell className="text-center p-1">
                        <button
                          onClick={() => handleDelete(cap.id, `${cap.firstName} ${cap.lastName}`)}
                          disabled={isDeleting}
                          className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                          title="Remove member"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
      </div>
    </div>
  );
}
