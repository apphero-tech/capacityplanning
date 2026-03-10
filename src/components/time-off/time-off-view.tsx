"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInBusinessDays } from "date-fns";
import type { Sprint, PublicHoliday, ProjectHoliday, PtoEntry } from "@/types";
import { useSprint } from "@/contexts/sprint-context";
import { formatDate, parseLocalDate } from "@/lib/date-utils";
import { getBadgeClasses } from "@/lib/badge-utils";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Building2,
  UserX,
  CalendarDays,
  Clock,
  Users,
  Plus,
  Trash2,
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  FileSpreadsheet,
  Pencil,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDurationDays(startDate: string, endDate: string): number {
  try {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const diff = differenceInBusinessDays(end, start) + 1;
    return Math.max(diff, 1);
  } catch {
    return 1;
  }
}

function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  return d >= start && d <= end;
}

function isOverlapping(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const as = new Date(aStart + "T00:00:00");
  const ae = new Date(aEnd + "T00:00:00");
  const bs = new Date(bStart + "T00:00:00");
  const be = new Date(bEnd + "T00:00:00");
  return as <= be && ae >= bs;
}

/** Find which sprint a date falls into. */
function findSprintForDate(dateStr: string, sprints: Sprint[]): Sprint | null {
  for (const s of sprints) {
    if (s.startDate && s.endDate && isDateInRange(dateStr, s.startDate, s.endDate)) {
      return s;
    }
  }
  return null;
}

/** Per-person PTO breakdown for a sprint, clamped to sprint boundaries. */
function computePtoByPerson(
  sprint: Sprint,
  ptoEntries: PtoEntry[],
  isInactive?: (who: string) => boolean,
): { who: string; days: number }[] {
  if (!sprint.startDate || !sprint.endDate) return [];

  const byPerson: Record<string, number> = {};
  for (const e of ptoEntries) {
    if (isInactive?.(e.who)) continue;
    if (!isOverlapping(e.startDate, e.endDate, sprint.startDate!, sprint.endDate!)) continue;
    const overlapStart =
      parseLocalDate(e.startDate)! > parseLocalDate(sprint.startDate!)!
        ? e.startDate
        : sprint.startDate!;
    const overlapEnd =
      parseLocalDate(e.endDate)! < parseLocalDate(sprint.endDate!)!
        ? e.endDate
        : sprint.endDate!;
    const days = computeDurationDays(overlapStart, overlapEnd);
    byPerson[e.who] = (byPerson[e.who] || 0) + days;
  }

  return Object.entries(byPerson)
    .map(([who, days]) => ({ who, days }))
    .sort((a, b) => b.days - a.days);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamMemberMinimal {
  id: string;
  firstName: string;
  lastName: string;
  location: string;
  isActive: boolean;
}

interface TimeOffViewProps {
  publicHolidays: PublicHoliday[];
  projectHolidays: ProjectHoliday[];
  ptoEntries: PtoEntry[];
  teamMembers: TeamMemberMinimal[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimeOffView({
  publicHolidays,
  projectHolidays,
  ptoEntries,
  teamMembers,
}: TimeOffViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("public");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const { sprints, selectedSprint } = useSprint();

  // PTO form state
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [ptoStartDate, setPtoStartDate] = useState<string>("");
  const [ptoEndDate, setPtoEndDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PTO inline edit state
  const [editingPtoId, setEditingPtoId] = useState<string | null>(null);
  const [editPtoStart, setEditPtoStart] = useState("");
  const [editPtoEnd, setEditPtoEnd] = useState("");
  const [editPtoSaving, setEditPtoSaving] = useState(false);

  // PTO CSV import state
  const [ptoCsvImporting, setPtoCsvImporting] = useState(false);
  const [ptoCsvResult, setPtoCsvResult] = useState<{
    success: boolean;
    imported?: number;
    warnings?: string[];
    detectedColumns?: string[];
    error?: string;
  } | null>(null);
  const ptoCsvFileRef = React.useRef<HTMLInputElement>(null);

  // Build a set of normalized inactive member names for matching PTO entries.
  // PTO uses "Clermont, Serena" while IC may have accented names "Séréna" — normalize.
  const inactiveNamesNorm = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const set = new Set<string>();
    for (const m of teamMembers) {
      if (!m.isActive) set.add(norm(`${m.lastName}, ${m.firstName}`));
    }
    return set;
  }, [teamMembers]);

  const isPtoInactive = (who: string) => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return inactiveNamesNorm.has(norm(who));
  };

  const countries = useMemo(() => {
    const set = new Set<string>();
    publicHolidays.forEach((h) => {
      if (h.country) set.add(h.country);
    });
    return Array.from(set).sort();
  }, [publicHolidays]);

  // Filter public holidays to selected sprint (or all if no sprint)
  const filteredPublicHolidays = useMemo(() => {
    let list = publicHolidays;
    if (countryFilter !== "all") {
      list = list.filter((h) => h.country === countryFilter);
    }
    if (selectedSprint?.startDate && selectedSprint?.endDate) {
      list = list.filter((h) =>
        isDateInRange(h.date, selectedSprint.startDate!, selectedSprint.endDate!),
      );
    }
    return list;
  }, [publicHolidays, countryFilter, selectedSprint]);

  // Filter project holidays to selected sprint
  const filteredProjectHolidays = useMemo(() => {
    if (!selectedSprint?.startDate || !selectedSprint?.endDate) return projectHolidays;
    return projectHolidays.filter((h) =>
      h.date && isDateInRange(h.date, selectedSprint.startDate!, selectedSprint.endDate!),
    );
  }, [projectHolidays, selectedSprint]);

  // Filter PTO entries to selected sprint
  const filteredPtoEntries = useMemo(() => {
    if (!selectedSprint?.startDate || !selectedSprint?.endDate) return ptoEntries;
    return ptoEntries.filter((e) =>
      isOverlapping(e.startDate, e.endDate, selectedSprint.startDate!, selectedSprint.endDate!),
    );
  }, [ptoEntries, selectedSprint]);

  const totalPublicDays = filteredPublicHolidays.reduce((sum, h) => sum + h.days, 0);
  const totalProjectDays = filteredProjectHolidays.reduce((sum, h) => sum + h.days, 0);
  // Only count active members in PTO totals
  const activePtoEntries = useMemo(
    () => filteredPtoEntries.filter((e) => !isPtoInactive(e.who)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredPtoEntries, inactiveNamesNorm],
  );

  // Per-person PTO breakdown (clamped to sprint boundaries)
  const ptoByPerson = useMemo(() => {
    if (!selectedSprint) return [];
    return computePtoByPerson(selectedSprint, ptoEntries, isPtoInactive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprint, ptoEntries, inactiveNamesNorm]);

  // Total PTO days — derived from the clamped per-person breakdown
  const totalPtoDays = useMemo(
    () => ptoByPerson.reduce((sum, p) => sum + p.days, 0),
    [ptoByPerson],
  );

  const sprintPtoStats = useMemo(() => {
    const uniquePeople = new Set(activePtoEntries.map((e) => e.who)).size;
    return { entries: activePtoEntries.length, days: totalPtoDays, people: uniquePeople };
  }, [activePtoEntries, totalPtoDays]);

  // Sorted team members for the dropdown
  const sortedMembers = useMemo(
    () =>
      [...teamMembers].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(
          `${b.lastName} ${b.firstName}`,
        ),
      ),
    [teamMembers],
  );

  // ---------------------------------------------------------------------------
  // PTO CRUD handlers
  // ---------------------------------------------------------------------------

  async function handleAddPto() {
    if (!selectedMemberId || !ptoStartDate || !ptoEndDate) return;

    const member = teamMembers.find((m) => m.id === selectedMemberId);
    if (!member) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/pto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          who: `${member.lastName}, ${member.firstName}`,
          location: member.location,
          team: null,
          startDate: ptoStartDate,
          endDate: ptoEndDate,
        }),
      });
      if (res.ok) {
        setSelectedMemberId("");
        setPtoStartDate("");
        setPtoEndDate("");
        startTransition(() => router.refresh());
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeletePto(id: string) {
    const res = await fetch(`/api/pto/${id}`, { method: "DELETE" });
    if (res.ok) {
      startTransition(() => router.refresh());
    }
  }

  async function handlePtoCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPtoCsvImporting(true);
    setPtoCsvResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/pto/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setPtoCsvResult({
          success: true,
          imported: data.imported,
          warnings: data.warnings,
          detectedColumns: data.detectedColumns,
        });
        startTransition(() => router.refresh());
      } else {
        setPtoCsvResult({
          success: false,
          error: data.error,
          warnings: data.details ? [data.details] : undefined,
        });
      }
    } catch {
      setPtoCsvResult({ success: false, error: "Network error" });
    } finally {
      setPtoCsvImporting(false);
      if (ptoCsvFileRef.current) ptoCsvFileRef.current.value = "";
    }
  }

  function handleStartEditPto(entry: PtoEntry) {
    setEditingPtoId(entry.id);
    setEditPtoStart(entry.startDate);
    setEditPtoEnd(entry.endDate);
  }

  function handleCancelEditPto() {
    setEditingPtoId(null);
    setEditPtoStart("");
    setEditPtoEnd("");
  }

  async function handleSaveEditPto() {
    if (!editingPtoId || !editPtoStart || !editPtoEnd) return;
    setEditPtoSaving(true);
    try {
      const res = await fetch(`/api/pto/${editingPtoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: editPtoStart, endDate: editPtoEnd }),
      });
      if (res.ok) {
        setEditingPtoId(null);
        startTransition(() => router.refresh());
      }
    } finally {
      setEditPtoSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Public Holidays */}
        <Card
          className={`border-white/[0.06] bg-slate-900/50 cursor-pointer transition-shadow ${activeTab === "public" ? "ring-1 ring-blue-500/40" : ""}`}
          onClick={() => setActiveTab("public")}
        >
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
              <Globe className="size-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Public Holidays
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalPublicDays} <span className="text-sm font-medium text-slate-400">days</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {filteredPublicHolidays.length} {filteredPublicHolidays.length === 1 ? "holiday" : "holidays"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Project Closures */}
        <Card
          className={`border-white/[0.06] bg-slate-900/50 cursor-pointer transition-shadow ${activeTab === "project" ? "ring-1 ring-purple-500/40" : ""}`}
          onClick={() => setActiveTab("project")}
        >
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/15">
              <Building2 className="size-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Project Closures
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalProjectDays} <span className="text-sm font-medium text-slate-400">days</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {filteredProjectHolidays.length} {filteredProjectHolidays.length === 1 ? "closure" : "closures"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Personal Time Off */}
        <Card
          className={`border-white/[0.06] bg-slate-900/50 cursor-pointer transition-shadow ${activeTab === "personal" ? "ring-1 ring-amber-500/40" : ""}`}
          onClick={() => setActiveTab("personal")}
        >
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <UserX className="size-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Personal Time Off
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalPtoDays} <span className="text-sm font-medium text-slate-400">person-days</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {sprintPtoStats.people} {sprintPtoStats.people === 1 ? "person" : "people"} affected
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Days Lost */}
        <Card className="border-white/[0.06] bg-slate-900/50">
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/15">
              <Clock className="size-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Days Off
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {totalPublicDays + totalProjectDays + totalPtoDays} <span className="text-sm font-medium text-slate-400">days</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {teamMembers.filter((m) => m.isActive).length} active team members
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Public Holidays Tab */}
        <TabsContent value="public">
          <Card className="border-white/[0.06] bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-100">
                    Public Holidays
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    {filteredPublicHolidays.length} holidays
                    {countryFilter !== "all" && ` for ${countryFilter}`}
                    {" "}&mdash; {totalPublicDays} total days
                    {selectedSprint && (
                      <span className="text-slate-500">
                        {" "}in {selectedSprint.name}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Select
                  value={countryFilter}
                  onValueChange={setCountryFilter}
                >
                  <SelectTrigger className="w-[160px] border-white/[0.06] bg-slate-800/50 text-slate-300">
                    <SelectValue placeholder="Filter by country" />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-slate-900">
                    <SelectItem value="all">All Countries</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400">Holiday Name</TableHead>
                    <TableHead className="text-slate-400">Country</TableHead>
                    <TableHead className="text-slate-400">Sprint</TableHead>
                    <TableHead className="text-right text-slate-400">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPublicHolidays.length === 0 ? (
                    <TableRow className="border-white/[0.06]">
                      <TableCell
                        colSpan={5}
                        className="text-center text-slate-500 py-8"
                      >
                        No public holidays
                        {countryFilter !== "all" && ` for ${countryFilter}`}
                        {selectedSprint && ` in ${selectedSprint.name}`}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPublicHolidays.map((h) => {
                      const matchedSprint = findSprintForDate(h.date, sprints);
                      return (
                        <TableRow
                          key={h.id}
                          className="border-white/[0.06] hover:bg-white/[0.02]"
                        >
                          <TableCell className="text-slate-300">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="size-3.5 text-slate-500" />
                              {formatDate(h.date)}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-slate-200">
                            {h.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="colored"
                              interactive
                              active={countryFilter === h.country}
                              onClick={() => setCountryFilter(countryFilter === h.country ? "all" : h.country)}
                              className={getBadgeClasses("country", h.country)}
                            >
                              {h.country || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            {matchedSprint ? (
                              <span>{matchedSprint.name}</span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-slate-300">
                            {h.days}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Closures Tab */}
        <TabsContent value="project">
          <Card className="border-white/[0.06] bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-slate-100">Project Closures</CardTitle>
              <CardDescription className="text-slate-400">
                {filteredProjectHolidays.length} closures &mdash;{" "}
                {totalProjectDays} total days
                {selectedSprint && (
                  <span className="text-slate-500">
                    {" "}in {selectedSprint.name}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-slate-400">Date</TableHead>
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400">Sprint</TableHead>
                    <TableHead className="text-right text-slate-400">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjectHolidays.length === 0 ? (
                    <TableRow className="border-white/[0.06]">
                      <TableCell
                        colSpan={4}
                        className="text-center text-slate-500 py-8"
                      >
                        No project closures{selectedSprint && ` in ${selectedSprint.name}`}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProjectHolidays.map((h) => {
                      const matchedSprint = findSprintForDate(h.date, sprints);
                      return (
                        <TableRow
                          key={h.id}
                          className="border-white/[0.06] hover:bg-white/[0.02]"
                        >
                          <TableCell className="text-slate-300">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="size-3.5 text-slate-500" />
                              {formatDate(h.date)}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-slate-200">
                            {h.name}
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            {matchedSprint ? (
                              <span>{matchedSprint.name}</span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-slate-300">
                            {h.days}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personal Holidays (PTO) Tab */}
        <TabsContent value="personal">
          <Card className="border-white/[0.06] bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-slate-100">
                Personal Time Off (PTO)
              </CardTitle>
              <CardDescription className="text-slate-400">
                {filteredPtoEntries.length}{" "}
                {filteredPtoEntries.length === 1 ? "entry" : "entries"} &mdash;{" "}
                {totalPtoDays} total business days
                {selectedSprint && (
                  <span className="text-slate-500">
                    {" "}in {selectedSprint.name}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* Add PTO form + CSV upload */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-4">
                {/* Manual entry row */}
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="flex flex-col gap-1.5 min-w-[200px]">
                    <Label className="text-xs text-slate-400">Team Member</Label>
                    <Select
                      value={selectedMemberId}
                      onValueChange={setSelectedMemberId}
                    >
                      <SelectTrigger className="border-white/[0.06] bg-slate-800/50 text-slate-300">
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent className="border-white/[0.06] bg-slate-900">
                        {sortedMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.lastName}, {m.firstName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-slate-400">Start Date</Label>
                    <Input
                      type="date"
                      value={ptoStartDate}
                      onChange={(e) => setPtoStartDate(e.target.value)}
                      className="border-white/[0.06] bg-slate-800/50 text-slate-300"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-slate-400">End Date</Label>
                    <Input
                      type="date"
                      value={ptoEndDate}
                      onChange={(e) => setPtoEndDate(e.target.value)}
                      className="border-white/[0.06] bg-slate-800/50 text-slate-300"
                    />
                  </div>
                  <Button
                    onClick={handleAddPto}
                    disabled={
                      isSubmitting ||
                      !selectedMemberId ||
                      !ptoStartDate ||
                      !ptoEndDate
                    }
                    className="gap-1.5 bg-[#E31837] hover:bg-[#AF0D1A] text-white"
                  >
                    {isSubmitting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add PTO
                  </Button>

                  {/* Separator */}
                  <div className="mx-2 h-8 w-px bg-white/[0.08]" />

                  {/* CSV upload */}
                  <input
                    ref={ptoCsvFileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handlePtoCsvImport}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 border border-white/[0.06] bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                    onClick={() => ptoCsvFileRef.current?.click()}
                    disabled={ptoCsvImporting}
                  >
                    {ptoCsvImporting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <Upload className="size-3.5" />
                        Import CSV
                      </>
                    )}
                  </Button>
                </div>

                {/* CSV import result feedback */}
                {ptoCsvResult && (
                  <div className={`flex items-start justify-between rounded-lg px-3 py-2 ${
                    ptoCsvResult.success
                      ? "border border-emerald-500/20 bg-emerald-500/5"
                      : "border border-red-500/20 bg-red-500/5"
                  }`}>
                    <div className="flex-1">
                      {ptoCsvResult.success ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-emerald-400" />
                          <span className="text-sm text-emerald-400">
                            {ptoCsvResult.imported} PTO entries imported
                          </span>
                          {ptoCsvResult.detectedColumns && (
                            <span className="text-xs text-slate-500">
                              ({ptoCsvResult.detectedColumns.join(", ")})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="size-4 text-red-400" />
                          <span className="text-sm text-red-400">{ptoCsvResult.error}</span>
                        </div>
                      )}
                      {ptoCsvResult.warnings && ptoCsvResult.warnings.length > 0 && (
                        <ul className="mt-1 text-xs text-amber-400/70 space-y-0.5">
                          {ptoCsvResult.warnings.slice(0, 5).map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                          {ptoCsvResult.warnings.length > 5 && (
                            <li>… and {ptoCsvResult.warnings.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                    <button
                      onClick={() => setPtoCsvResult(null)}
                      className="text-slate-500 hover:text-slate-300 ml-2"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}

                {/* CSV format hint */}
                <p className="text-[11px] text-slate-600">
                  CSV format: Who, Location, Start Date, End Date (headers auto-detected)
                </p>
              </div>

              {/* PTO Table */}
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-slate-400">Who</TableHead>
                    <TableHead className="text-slate-400">Location</TableHead>
                    <TableHead className="text-slate-400">Start</TableHead>
                    <TableHead className="text-slate-400">End</TableHead>
                    <TableHead className="text-slate-400">Sprint</TableHead>
                    <TableHead className="text-right text-slate-400">Duration</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPtoEntries.length === 0 ? (
                    <TableRow className="border-white/[0.06]">
                      <TableCell
                        colSpan={7}
                        className="text-center text-slate-500 py-8"
                      >
                        No personal time off
                        {selectedSprint && ` in ${selectedSprint.name}`}.
                        Use the form above to add PTO entries.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPtoEntries.map((entry) => {
                      const isEditing = editingPtoId === entry.id;
                      const inactive = isPtoInactive(entry.who);
                      const displayStart = isEditing ? editPtoStart : entry.startDate;
                      const displayEnd = isEditing ? editPtoEnd : entry.endDate;
                      const duration = computeDurationDays(displayStart, displayEnd);
                      const matchedSprint = findSprintForDate(entry.startDate, sprints);
                      return (
                        <TableRow
                          key={entry.id}
                          className={`border-white/[0.06] hover:bg-white/[0.02] ${isEditing ? "bg-white/[0.03]" : ""} ${inactive ? "opacity-40" : ""}`}
                        >
                          <TableCell className="font-medium text-slate-200">
                            <div className="flex items-center gap-2">
                              {entry.who}
                              {inactive && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-600 text-slate-500">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="colored"
                              interactive
                              active={countryFilter === entry.location}
                              onClick={() => setCountryFilter(countryFilter === entry.location ? "all" : entry.location)}
                              className={getBadgeClasses("country", entry.location)}
                            >
                              {entry.location || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {isEditing ? (
                              <Input
                                type="date"
                                value={editPtoStart}
                                onChange={(e) => setEditPtoStart(e.target.value)}
                                className="h-7 w-[140px] border-white/[0.06] bg-slate-800/50 text-slate-300 text-xs"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <CalendarDays className="size-3.5 text-slate-500" />
                                {formatDate(entry.startDate)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-300">
                            {isEditing ? (
                              <Input
                                type="date"
                                value={editPtoEnd}
                                onChange={(e) => setEditPtoEnd(e.target.value)}
                                className="h-7 w-[140px] border-white/[0.06] bg-slate-800/50 text-slate-300 text-xs"
                              />
                            ) : (
                              formatDate(entry.endDate)
                            )}
                          </TableCell>
                          <TableCell className="text-slate-400 text-xs">
                            {matchedSprint ? (
                              <span>{matchedSprint.name}</span>
                            ) : (
                              <span className="text-slate-600">&mdash;</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="colored"
                              className={getBadgeClasses("country", "Personal")}
                            >
                              {duration} {duration === 1 ? "day" : "days"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              {isEditing ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                    onClick={handleSaveEditPto}
                                    disabled={editPtoSaving || !editPtoStart || !editPtoEnd}
                                  >
                                    {editPtoSaving ? (
                                      <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                      <Check className="size-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-slate-500 hover:text-slate-300 hover:bg-white/5"
                                    onClick={handleCancelEditPto}
                                    disabled={editPtoSaving}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-slate-500 hover:text-slate-300 hover:bg-white/5"
                                    onClick={() => handleStartEditPto(entry)}
                                    disabled={isPending}
                                  >
                                    <Pencil className="size-3 " />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => handleDeletePto(entry.id)}
                                    disabled={isPending}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
