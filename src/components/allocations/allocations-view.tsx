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
import { Users, PieChart, Plus, Trash2, Loader2 } from "lucide-react";
import { ImportAllocationsDialog } from "@/components/allocations/import-allocations-dialog";

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
  if (pct === 0) return "bg-transparent text-slate-600";
  if (pct <= 10) return "bg-[#E31837]/10 text-[#f4707f]";
  if (pct <= 25) return "bg-[#E31837]/20 text-[#f4707f]";
  if (pct <= 50) return "bg-[#E31837]/30 text-[#f8a0aa]";
  if (pct <= 75) return "bg-[#E31837]/40 text-[#fcd0d5]";
  return "bg-[#E31837]/50 text-white";
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
      className={`w-full text-center text-xs font-mono rounded-sm cursor-pointer hover:ring-1 hover:ring-white/20 transition-all px-1 py-0.5 ${getCellColor(pct)}`}
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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    return capacities.filter((c) => {
      if (roleFilter !== "all" && c.role !== roleFilter) return false;
      if (orgFilter !== "all" && c.organization !== orgFilter) return false;
      return true;
    });
  }, [capacities, roleFilter, orgFilter]);

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

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#E31837]/15">
              <Users className="size-5 text-[#E31837]" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Team Members
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalMembers}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                with allocation data
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <PieChart className="size-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Avg Hrs / Week
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {avgHrsPerWeek.toFixed(1)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                across filtered members
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/[0.06] bg-slate-900/50 sm:col-span-2 lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Organization
              </p>
              <div className="flex items-center gap-2">
                <ImportAllocationsDialog onImported={handleAdd} />
                <AddMemberDialog onAdd={handleAdd} />
              </div>
            </div>
            {/* Org toggle pills — always show All + known orgs */}
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-slate-800/50 p-1 mb-2">
              {(() => {
                const base = ["all", "Deloitte", "York"];
                const extras = organizations.filter((o) => !base.includes(o));
                const options = [...base, ...extras];
                return options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setOrgFilter(opt)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      orgFilter === opt
                        ? "bg-[#E31837] text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    {opt === "all" ? "All" : opt}
                  </button>
                ));
              })()}
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full border-white/[0.06] bg-slate-800/50 text-slate-300">
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
          </CardContent>
        </Card>
      </div>

      {/* Allocation grid table */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-slate-100">
            Allocation Matrix
          </CardTitle>
          <CardDescription className="text-slate-400">
            Click any cell to edit. Changes are saved automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-slate-400 min-w-[160px]">
                  Name
                </TableHead>
                <TableHead className="text-slate-400 min-w-[80px]">
                  Org
                </TableHead>
                <TableHead className="text-slate-400">Role</TableHead>
                <TableHead className="text-slate-400 min-w-[80px]">
                  Location
                </TableHead>
                <TableHead className="text-center text-slate-400">
                  FT/PT
                </TableHead>
                <TableHead className="text-right text-slate-400">
                  Hrs/Wk
                </TableHead>
                <TableHead className="text-center text-slate-400 w-16">
                  Active
                </TableHead>
                {ALLOCATION_COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-center text-slate-400 min-w-[70px]"
                  >
                    {col.short}
                  </TableHead>
                ))}
                <TableHead className="text-center text-slate-400">
                  Total
                </TableHead>
                <TableHead className="text-center text-slate-400 w-10">

                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="border-white/[0.06]">
                  <TableCell
                    colSpan={5 + ALLOCATION_COLUMNS.length + 2}
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
                      <TableCell className="font-medium text-slate-200">
                        <div className="flex gap-1">
                          <EditableTextCell
                            value={cap.lastName}
                            onSave={(v) => saveField(cap.id, "lastName", v)}
                            saving={isSaving}
                            className="font-medium text-slate-200"
                          />
                          <span className="text-slate-500">,</span>
                          <EditableTextCell
                            value={cap.firstName}
                            onSave={(v) => saveField(cap.id, "firstName", v)}
                            saving={isSaving}
                            className="font-medium text-slate-200"
                          />
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
                      <TableCell>
                        <EditableTextCell
                          value={cap.location}
                          onSave={(v) => saveField(cap.id, "location", v)}
                          saving={isSaving}
                          className="text-slate-400 text-xs"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="colored"
                          interactive
                          onClick={() => saveField(cap.id, "ftPt", cap.ftPt === "FT" ? "PT" : "FT")}
                          aria-disabled={isSaving}
                          className={
                            cap.ftPt === "FT"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          }
                        >
                          {cap.ftPt}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <EditableNumberCell
                          value={cap.hrsPerWeek}
                          onSave={(v) => saveField(cap.id, "hrsPerWeek", v)}
                          saving={isSaving}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          type="button"
                          onClick={() => saveField(cap.id, "isActive", !cap.isActive)}
                          disabled={isSaving}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            cap.isActive
                              ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
                          }`}
                          title="Click to toggle"
                        >
                          {cap.isActive ? "Active" : "Inactive"}
                        </button>
                      </TableCell>
                      {ALLOCATION_COLUMNS.map((col) => {
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
        </CardContent>
      </Card>
    </div>
  );
}
