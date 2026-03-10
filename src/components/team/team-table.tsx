"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Check, X } from "lucide-react";
import { TEAM_BADGE_STYLES, LOCATION_BADGE_STYLES, COUNTRIES } from "@/lib/constants";
import { getBadgeClasses } from "@/lib/badge-utils";
import type { ComputedMember } from "./team-page-client";

interface TeamTableProps {
  members: ComputedMember[];
  onUpdate?: (id: string, field: string, value: string | number | boolean) => Promise<void>;
}

type SortField =
  | "name"
  | "role"
  | "location"
  | "team"
  | "ftPt"
  | "hrsPerWeek"
  | "netHrs";

type SortDirection = "asc" | "desc";

/** Activity colour palette for the allocation distribution bar. */
const ACTIVITY_COLORS: Record<string, string> = {
  refinement: "#AF0D1A",
  design: "#3AC2EF",
  development: "#10b981",
  qa: "#f59e0b",
  kt: "#8b5cf6",
  lead: "#6366f1",
  pmo: "#ef4444",
  other: "#6b7280",
};

const ACTIVITY_LABELS: Record<string, string> = {
  refinement: "REF",
  design: "DES",
  development: "DEV",
  qa: "QA",
  kt: "KT",
  lead: "Lead",
  pmo: "PMO",
  other: "Other",
};

const ACTIVITY_KEYS = ["refinement", "design", "development", "qa", "kt", "lead", "pmo", "other"] as const;

// ---------------------------------------------------------------------------
// Sprint teams: the 4 streams that actively participate in sprints
// ---------------------------------------------------------------------------

type SprintTeam = "Refinement" | "Design" | "Development" | "QA";
type TeamLabel = SprintTeam | "Overhead";

const SPRINT_TEAMS: { key: keyof ComputedMember; label: SprintTeam; color: string }[] = [
  { key: "refinement", label: "Refinement", color: "#AF0D1A" },
  { key: "design", label: "Design", color: "#3AC2EF" },
  { key: "development", label: "Development", color: "#10b981" },
  { key: "qa", label: "QA", color: "#f59e0b" },
];

/** Maps a team filter label to the IC field key used for weighting. */
const TEAM_TO_IC_FIELD: Record<string, keyof ComputedMember> = {
  Refinement: "refinement",
  Design: "design",
  Development: "development",
  QA: "qa",
};

/**
 * Returns the weighted net hrs for a member based on the active team filter.
 * When a sprint team filter is active, netHrs is multiplied by the allocation %.
 * When "all" or "Overhead" is selected, returns total netHrs.
 */
function getWeightedNetHrs(m: ComputedMember, teamFilter: string): number {
  const field = TEAM_TO_IC_FIELD[teamFilter];
  if (!field) return m.netHrs; // "all" or "Overhead" → total
  return Math.round(m.netHrs * (m[field] as number) * 100) / 100;
};

/**
 * Determine the sprint team(s) a member contributes to.
 * A member belongs to a team if they have > 0% allocation in that activity.
 * Members with no sprint activity at all are "Overhead".
 */
function getTeams(m: ComputedMember): TeamLabel[] {
  const teams: TeamLabel[] = [];
  for (const t of SPRINT_TEAMS) {
    if ((m[t.key] as number) > 0) teams.push(t.label);
  }
  if (teams.length === 0) teams.push("Overhead");
  return teams;
}

/** Primary team = the sprint team with the highest allocation, or Overhead. */
function getPrimaryTeam(m: ComputedMember): TeamLabel {
  let best: TeamLabel = "Overhead";
  let bestPct = 0;
  for (const t of SPRINT_TEAMS) {
    const pct = m[t.key] as number;
    if (pct > bestPct) {
      bestPct = pct;
      best = t.label;
    }
  }
  return best;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Compact horizontal bar showing activity distribution. */
function AllocationBar({ member }: { member: ComputedMember }) {
  const segments = ACTIVITY_KEYS
    .map((key) => ({
      key,
      pct: member[key] as number,
      color: ACTIVITY_COLORS[key],
      label: ACTIVITY_LABELS[key],
    }))
    .filter((s) => s.pct > 0);

  if (segments.length === 0) return <span className="text-slate-600">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {/* Stacked bar */}
      <div className="flex h-4 w-24 overflow-hidden rounded-sm">
        {segments.map((s) => (
          <div
            key={s.key}
            className="h-full"
            style={{
              width: `${s.pct * 100}%`,
              backgroundColor: s.color,
              minWidth: s.pct > 0 ? 2 : 0,
            }}
            title={`${s.label}: ${Math.round(s.pct * 100)}%`}
          />
        ))}
      </div>
      {/* Labels */}
      <span className="text-xs text-slate-500 whitespace-nowrap">
        {segments.map((s) => `${s.label} ${Math.round(s.pct * 100)}%`).join(" · ")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline editable cells
// ---------------------------------------------------------------------------

function EditableTextCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 -mx-1 hover:bg-white/[0.06] transition-colors"
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
      >
        {value || <span className="text-slate-600">—</span>}
      </span>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { if (draft !== value) onSave(draft); setEditing(false); }
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-7 w-32 border-white/[0.06] bg-slate-800/80 text-slate-200 text-sm px-2"
    />
  );
}

function EditableSelectCell({
  value,
  options,
  onSave,
  displayValue,
}: {
  value: string;
  options: readonly string[];
  onSave: (v: string) => void;
  displayValue?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);

  if (!editing) {
    return (
      <span
        className="cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {displayValue ?? value}
      </span>
    );
  }

  return (
    <Select
      defaultOpen
      value={value}
      onValueChange={(v) => { if (v !== value) onSave(v); setEditing(false); }}
      onOpenChange={(open) => { if (!open) setEditing(false); }}
    >
      <SelectTrigger className="h-7 w-32 border-white/[0.06] bg-slate-800/80 text-slate-200 text-sm px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-white/[0.06] bg-slate-900">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditableNumberCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value));

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 -mx-1 hover:bg-white/[0.06] transition-colors"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        title="Click to edit"
      >
        {formatNumber(value)}
      </span>
    );
  }

  return (
    <Input
      autoFocus
      type="number"
      step="0.5"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseFloat(draft);
        if (!isNaN(n) && n !== value) onSave(n);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const n = parseFloat(draft);
          if (!isNaN(n) && n !== value) onSave(n);
          setEditing(false);
        }
        if (e.key === "Escape") setEditing(false);
      }}
      className="h-7 w-20 border-white/[0.06] bg-slate-800/80 text-slate-200 text-sm px-2 text-right"
    />
  );
}

function EditableNameCell({
  firstName,
  lastName,
  onSave,
}: {
  firstName: string;
  lastName: string;
  onSave: (firstName: string, lastName: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draftFirst, setDraftFirst] = React.useState(firstName);
  const [draftLast, setDraftLast] = React.useState(lastName);
  const lastRef = React.useRef<HTMLInputElement>(null);

  if (!editing) {
    return (
      <span
        className="cursor-pointer rounded px-1 -mx-1 hover:bg-white/[0.06] transition-colors"
        onClick={() => {
          setDraftFirst(firstName);
          setDraftLast(lastName);
          setEditing(true);
        }}
        title="Click to edit name"
      >
        {firstName} {lastName}
      </span>
    );
  }

  const commit = () => {
    const f = draftFirst.trim();
    const l = draftLast.trim();
    if (f && l && (f !== firstName || l !== lastName)) {
      onSave(f, l);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        value={draftFirst}
        onChange={(e) => setDraftFirst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") lastRef.current?.focus();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="First"
        className="h-7 w-24 border-white/[0.06] bg-slate-800/80 text-slate-200 text-sm px-2"
      />
      <Input
        ref={lastRef}
        value={draftLast}
        onChange={(e) => setDraftLast(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Last"
        className="h-7 w-24 border-white/[0.06] bg-slate-800/80 text-slate-200 text-sm px-2"
      />
    </div>
  );
}

export function TeamTable({ members, onUpdate }: TeamTableProps) {
  const [search, setSearch] = React.useState("");
  const [teamFilter, setTeamFilter] = React.useState<string>("all");
  const [locationFilter, setLocationFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [ftPtFilter, setFtPtFilter] = React.useState<string>("all");
  const [sortField, setSortField] = React.useState<SortField>("name");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");

  // Get unique locations & roles
  const locations = React.useMemo(
    () => [...new Set(members.map((m) => m.location).filter(Boolean))].sort(),
    [members]
  );
  const roles = React.useMemo(
    () => [...new Set(members.map((m) => m.role).filter(Boolean))].sort(),
    [members]
  );

  // Count active filters (for the "clear" affordance)
  const activeFilterCount = [teamFilter, locationFilter, statusFilter, roleFilter, ftPtFilter]
    .filter((f) => f !== "all").length + (search ? 1 : 0);

  // Filter
  const filtered = React.useMemo(() => {
    return members.filter((m) => {
      const matchesSearch =
        search === "" ||
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        m.role.toLowerCase().includes(search.toLowerCase());
      const matchesLocation = locationFilter === "all" || m.location === locationFilter;
      const matchesTeam =
        teamFilter === "all" || getTeams(m).includes(teamFilter as TeamLabel);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && m.isActive) ||
        (statusFilter === "inactive" && !m.isActive);
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      const matchesFtPt = ftPtFilter === "all" || m.ftPt === ftPtFilter;
      return matchesSearch && matchesLocation && matchesTeam && matchesStatus && matchesRole && matchesFtPt;
    });
  }, [members, search, locationFilter, teamFilter, statusFilter, roleFilter, ftPtFilter]);

  // Sort
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "location":
          cmp = a.location.localeCompare(b.location);
          break;
        case "team":
          cmp = getPrimaryTeam(a).localeCompare(getPrimaryTeam(b));
          break;
        case "ftPt":
          cmp = a.ftPt.localeCompare(b.ftPt);
          break;
        case "hrsPerWeek":
          cmp = a.hrsPerWeek - b.hrsPerWeek;
          break;
        case "netHrs":
          cmp = getWeightedNetHrs(a, teamFilter) - getWeightedNetHrs(b, teamFilter);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDirection, teamFilter]);

  // Totals — only active members, weighted by team filter
  const totals = React.useMemo(() => {
    const active = filtered.filter((m) => m.isActive);
    return {
      hrsPerWeek: active.reduce((s, m) => s + m.hrsPerWeek, 0),
      netHrs: active.reduce((s, m) => s + getWeightedNetHrs(m, teamFilter), 0),
      activeCount: active.length,
    };
  }, [filtered, teamFilter]);

  // Dynamic header label for the Net Hrs column
  const netHrsLabel = React.useMemo(() => {
    if (TEAM_TO_IC_FIELD[teamFilter]) return `Net Hrs (${teamFilter})`;
    return "Net Hrs";
  }, [teamFilter]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 inline size-3 text-slate-600" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 inline size-3 text-[#E31837]" />
    ) : (
      <ArrowDown className="ml-1 inline size-3 text-[#E31837]" />
    );
  }

  const clearAllFilters = () => {
    setSearch("");
    setTeamFilter("all");
    setLocationFilter("all");
    setStatusFilter("all");
    setRoleFilter("all");
    setFtPtFilter("all");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Search by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-9 border-white/[0.06] bg-slate-900/50 text-slate-300 placeholder:text-slate-600"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 border-white/[0.06] bg-slate-900/50 text-slate-300">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.06] bg-slate-900">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-36 border-white/[0.06] bg-slate-900/50 text-slate-300">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.06] bg-slate-900">
            <SelectItem value="all">All Teams</SelectItem>
            <SelectItem value="Refinement">Refinement</SelectItem>
            <SelectItem value="Design">Design</SelectItem>
            <SelectItem value="Development">Development</SelectItem>
            <SelectItem value="QA">QA</SelectItem>
            <SelectItem value="Overhead">Overhead</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40 border-white/[0.06] bg-slate-900/50 text-slate-300">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.06] bg-slate-900 max-h-64">
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-36 border-white/[0.06] bg-slate-900/50 text-slate-300">
            <SelectValue placeholder="All Locations" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.06] bg-slate-900">
            <SelectItem value="all">All Locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ftPtFilter} onValueChange={setFtPtFilter}>
          <SelectTrigger className="w-28 border-white/[0.06] bg-slate-900/50 text-slate-300">
            <SelectValue placeholder="FT / PT" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.06] bg-slate-900">
            <SelectItem value="all">FT / PT</SelectItem>
            <SelectItem value="FT">Full-Time</SelectItem>
            <SelectItem value="PT">Part-Time</SelectItem>
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-white/[0.04]"
            title="Clear all filters"
          >
            <X className="size-3" />
            Clear ({activeFilterCount})
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500">
          {totals.activeCount} active of {filtered.length} members
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              <TableHead
                className="cursor-pointer select-none text-slate-400"
                onClick={() => handleSort("name")}
              >
                Name <SortIcon field="name" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-slate-400"
                onClick={() => handleSort("role")}
              >
                Role <SortIcon field="role" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-slate-400"
                onClick={() => handleSort("team")}
              >
                Team <SortIcon field="team" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-slate-400"
                onClick={() => handleSort("location")}
              >
                Location <SortIcon field="location" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-slate-400"
                onClick={() => handleSort("ftPt")}
              >
                FT/PT <SortIcon field="ftPt" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right text-slate-400"
                onClick={() => handleSort("hrsPerWeek")}
              >
                Hrs/Wk <SortIcon field="hrsPerWeek" />
              </TableHead>
              <TableHead className="text-slate-400">
                Allocation
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right text-slate-400"
                onClick={() => handleSort("netHrs")}
              >
                {netHrsLabel} <SortIcon field="netHrs" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((m) => {
              const teams = getTeams(m);
              return (
                <TableRow key={m.id} className={`border-white/[0.06] hover:bg-white/[0.02] ${!m.isActive ? "opacity-40" : ""}`}>
                  <TableCell className="font-medium text-slate-200">
                    <div className="flex items-center gap-2">
                      {onUpdate && (
                        <button
                          onClick={() => onUpdate(m.id, "isActive", !m.isActive)}
                          className={`size-2.5 shrink-0 rounded-full border transition-colors ${
                            m.isActive
                              ? "bg-emerald-400 border-emerald-400/50"
                              : "bg-transparent border-slate-600 hover:border-slate-400"
                          }`}
                          title={m.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                        />
                      )}
                      {onUpdate ? (
                        <EditableNameCell
                          firstName={m.firstName}
                          lastName={m.lastName}
                          onSave={(first, last) => {
                            // Fire both updates (they hit the same row)
                            if (first !== m.firstName) onUpdate(m.id, "firstName", first);
                            if (last !== m.lastName) onUpdate(m.id, "lastName", last);
                          }}
                        />
                      ) : (
                        <span>{m.firstName} {m.lastName}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {onUpdate ? (
                      <EditableTextCell value={m.role} onSave={(v) => onUpdate(m.id, "role", v)} />
                    ) : m.role}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {teams.map((team) => (
                        <Badge
                          key={team}
                          variant="colored"
                          interactive
                          active={teamFilter === team}
                          onClick={() => setTeamFilter(teamFilter === team ? "all" : team)}
                          className={`text-xs font-medium ${getBadgeClasses("team", team)}`}
                        >
                          {team}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {onUpdate ? (
                      <EditableSelectCell
                        value={m.location}
                        options={COUNTRIES}
                        onSave={(v) => onUpdate(m.id, "location", v)}
                        displayValue={
                          <Badge
                            variant="colored"
                            className={`text-xs font-medium cursor-pointer ${getBadgeClasses("location", m.location)}`}
                          >
                            {m.location || "—"}
                          </Badge>
                        }
                      />
                    ) : (
                      <Badge
                        variant="colored"
                        interactive
                        active={locationFilter === m.location}
                        onClick={() => setLocationFilter(locationFilter === m.location ? "all" : m.location)}
                        className={`text-xs font-medium ${getBadgeClasses("location", m.location)}`}
                      >
                        {m.location}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {onUpdate ? (
                      <EditableSelectCell
                        value={m.ftPt}
                        options={["FT", "PT"] as const}
                        onSave={(v) => onUpdate(m.id, "ftPt", v)}
                      />
                    ) : m.ftPt}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-300">
                    {onUpdate ? (
                      <EditableNumberCell value={m.hrsPerWeek} onSave={(v) => onUpdate(m.id, "hrsPerWeek", v)} />
                    ) : formatNumber(m.hrsPerWeek)}
                  </TableCell>
                  <TableCell>
                    <AllocationBar member={m} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-slate-100">
                    {formatNumber(getWeightedNetHrs(m, teamFilter))}
                  </TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow className="border-white/[0.06]">
                <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                  No team members found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {sorted.length > 0 && (
            <TableFooter className="border-white/[0.06] bg-white/[0.02]">
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableCell className="font-bold text-slate-100">
                  TOTAL ({totals.activeCount} active)
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell className="text-right tabular-nums font-bold text-slate-100">
                  {formatNumber(totals.hrsPerWeek)}
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums font-bold text-[#E31837]">
                  {formatNumber(totals.netHrs)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}
