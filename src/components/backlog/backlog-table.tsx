"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Eye,
  EyeOff,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { getBadgeClasses } from "@/lib/badge-utils";
import { StatStrip } from "@/components/ui/stat-strip";
import { ChipFilter } from "@/components/ui/segmented-control";
import { useSprint } from "@/contexts/sprint-context";
import type { SprintStory } from "@/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BacklogTableProps {
  storiesBySprint: Record<string, SprintStory[]>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = "key" | "summary" | "status" | "storyPoints" | "pod" | "stream" | "groupName";
type SortDirection = "asc" | "desc";

interface ImportResult {
  success: boolean;
  imported?: number;
  replaced?: number;
  warnings?: string[];
  detectedColumns?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BacklogTable({ storiesBySprint }: BacklogTableProps) {
  const router = useRouter();
  const { selectedSprint } = useSprint();

  // Import state
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Filter/sort state
  const [search, setSearch] = React.useState("");
  const [streamFilter, setStreamFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [podFilter, setPodFilter] = React.useState<string>("all");
  const [showExcluded, setShowExcluded] = React.useState(false);
  const [sortField, setSortField] = React.useState<SortField>("key");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");

  // Get stories for selected sprint
  const stories = React.useMemo(() => {
    if (!selectedSprint) return [];
    return storiesBySprint[selectedSprint.id] ?? [];
  }, [selectedSprint, storiesBySprint]);

  // Reset filters when sprint changes
  React.useEffect(() => {
    setSearch("");
    setStreamFilter("all");
    setStatusFilter("all");
    setPodFilter("all");
    setImportResult(null);
  }, [selectedSprint?.id]);

  // ---------------------------------------------------------------------------
  // Import handler (for selected sprint)
  // ---------------------------------------------------------------------------

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedSprint) return;

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sprintId", selectedSprint.id);

    try {
      const res = await fetch("/api/backlog/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        setImportResult({
          success: true,
          imported: data.imported,
          replaced: data.replaced,
          warnings: data.warnings,
          detectedColumns: data.detectedColumns,
        });
        React.startTransition(() => router.refresh());
      } else {
        setImportResult({
          success: false,
          error: data.error,
          warnings: data.details,
        });
      }
    } catch {
      setImportResult({ success: false, error: "Network error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ---------------------------------------------------------------------------
  // Derived filter values
  // ---------------------------------------------------------------------------

  const streams = React.useMemo(
    () => [...new Set(stories.map((s) => s.stream))].filter(Boolean).sort(),
    [stories]
  );
  const statuses = React.useMemo(
    () => [...new Set(stories.map((s) => s.status))].filter(Boolean).sort(),
    [stories]
  );
  const pods = React.useMemo(
    () =>
      [...new Set(stories.map((s) => s.pod).filter(Boolean))].sort() as string[],
    [stories]
  );

  // Filter
  // When the user explicitly filters by X-OUT, show excluded stories automatically
  const filtered = React.useMemo(() => {
    return stories.filter((s) => {
      const wantsExcluded = showExcluded || streamFilter === "X-OUT";
      if (!wantsExcluded && s.isExcluded) return false;
      const matchesSearch =
        search === "" ||
        s.key.toLowerCase().includes(search.toLowerCase()) ||
        s.summary.toLowerCase().includes(search.toLowerCase());
      const matchesStream = streamFilter === "all" || s.stream === streamFilter;
      const matchesStatus = statusFilter === "all" || s.status === statusFilter;
      const matchesPod =
        podFilter === "all" ||
        (podFilter === "none" ? s.pod === null : s.pod === podFilter);
      return matchesSearch && matchesStream && matchesStatus && matchesPod;
    });
  }, [stories, search, streamFilter, statusFilter, podFilter, showExcluded]);

  // Sort
  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "key":
          cmp = a.key.localeCompare(b.key, undefined, { numeric: true });
          break;
        case "summary":
          cmp = a.summary.localeCompare(b.summary);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "storyPoints":
          cmp = (a.storyPoints ?? 0) - (b.storyPoints ?? 0);
          break;
        case "pod":
          cmp = (a.pod ?? "").localeCompare(b.pod ?? "");
          break;
        case "stream":
          cmp = a.stream.localeCompare(b.stream);
          break;
        case "groupName":
          cmp = (a.groupName ?? "").localeCompare(b.groupName ?? "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDirection]);

  // Summary stats — totals reflect excluded visibility, stream badges always include X-OUT
  const stats = React.useMemo(() => {
    const excludedVisible = showExcluded || streamFilter === "X-OUT";
    const active = stories.filter((s) => !s.isExcluded);
    const excluded = stories.filter((s) => s.isExcluded);

    // Totals: include excluded stories only when they're visible
    const countable = excludedVisible ? stories : active;
    const totalSP = countable.reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);

    // Stream breakdown: active streams always shown
    const byStream: Record<string, { count: number; sp: number }> = {};
    for (const s of active) {
      if (!byStream[s.stream]) byStream[s.stream] = { count: 0, sp: 0 };
      byStream[s.stream].count += 1;
      byStream[s.stream].sp += s.storyPoints ?? 0;
    }
    // X-OUT badge always visible so users can discover excluded stories
    if (excluded.length > 0) {
      const sp = excluded.reduce((sum, s) => sum + (s.storyPoints ?? 0), 0);
      byStream["X-OUT"] = { count: excluded.length, sp };
    }

    return { totalStories: countable.length, totalSP, byStream };
  }, [stories, showExcluded, streamFilter]);

  // ---------------------------------------------------------------------------
  // Sort handler
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Build stream chip options for the filter bar
  const streamChipOptions = [
    { value: "all", label: `All streams` },
    ...Object.entries(stats.byStream)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([stream, data]) => ({
        value: stream,
        label: `${stream} ${data.count}`,
      })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stat strip — only once we have stories */}
      {stories.length > 0 && (
        <StatStrip
          stats={[
            { label: "Sprint", value: selectedSprint?.name ?? "—", muted: !selectedSprint },
            { label: "Stories", value: stats.totalStories },
            { label: "Story points", value: stats.totalSP, hint: "total" },
            { label: "Showing", value: filtered.length, hint: `of ${stats.totalStories}` },
          ]}
        />
      )}

      {/* Toolbar row 1: search + filters + excluded toggle */}
      {stories.length > 0 && (
        <div className="flex items-center flex-wrap gap-x-3 gap-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 border-white/10 bg-slate-900/60 text-[13px] text-slate-300 placeholder:text-slate-600"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[200px] border-white/10 bg-slate-900/60 text-[13px] text-slate-300">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All statuses</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={podFilter} onValueChange={setPodFilter}>
            <SelectTrigger className="h-8 w-[120px] border-white/10 bg-slate-900/60 text-[13px] text-slate-300">
              <SelectValue placeholder="All pods" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All pods</SelectItem>
              <SelectItem value="none">No pod</SelectItem>
              {pods.map((pod) => (
                <SelectItem key={pod} value={pod}>
                  {pod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className={`h-8 flex items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors ${
              showExcluded
                ? "bg-white/[0.06] text-slate-50"
                : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.03]"
            }`}
          >
            {showExcluded ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            Excluded
          </button>
        </div>
      )}

      {/* Toolbar row 2: stream chip filter */}
      {stories.length > 0 && streams.length > 0 && (
        <ChipFilter
          options={streamChipOptions}
          value={streamFilter}
          onChange={setStreamFilter}
        />
      )}

      {/* Empty state */}
      {stories.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-slate-900/30 py-16">
          <FileSpreadsheet className="size-10 text-slate-600 mb-4" />
          <h3 className="text-base font-medium text-slate-300 mb-1">
            No backlog for {selectedSprint?.name ?? "this sprint"}
          </h3>
          <p className="text-sm text-slate-500">
            Use <span className="text-slate-300 font-medium">Import All Sprints</span> at the top of the page to load your Jira CSV.
          </p>
        </div>
      )}

      {/* Table */}
      {stories.length > 0 && (
        <div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead
                  className="w-28 cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("key")}
                >
                  Key <SortIcon field="key" />
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("summary")}
                >
                  Summary <SortIcon field="summary" />
                </TableHead>
                <TableHead
                  className="w-48 cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("status")}
                >
                  Status <SortIcon field="status" />
                </TableHead>
                <TableHead
                  className="w-16 cursor-pointer select-none text-right text-slate-400"
                  onClick={() => handleSort("storyPoints")}
                >
                  SP <SortIcon field="storyPoints" />
                </TableHead>
                <TableHead
                  className="w-24 cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("pod")}
                >
                  Pod <SortIcon field="pod" />
                </TableHead>
                <TableHead
                  className="w-24 cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("stream")}
                >
                  Stream <SortIcon field="stream" />
                </TableHead>
                <TableHead
                  className="w-36 cursor-pointer select-none text-slate-400"
                  onClick={() => handleSort("groupName")}
                >
                  Group <SortIcon field="groupName" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => {
                const isGrayed = s.isExcluded;
                return (
                  <TableRow
                    key={s.id}
                    className={`border-white/[0.06] ${
                      isGrayed
                        ? "opacity-40 hover:opacity-60"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <TableCell className="font-mono text-sm font-medium text-[#E31837]">
                      {s.key}
                    </TableCell>
                    <TableCell
                      className="max-w-md truncate text-slate-300"
                      title={s.summary}
                    >
                      {s.summary}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="colored"
                        interactive
                        active={statusFilter === s.status}
                        onClick={() => setStatusFilter(statusFilter === s.status ? "all" : s.status)}
                        className={`text-xs ${getBadgeClasses("story-status", s.status)}`}
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-slate-200">
                      {s.storyPoints ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {s.pod ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="colored"
                        interactive
                        active={streamFilter === s.stream}
                        onClick={() => setStreamFilter(streamFilter === s.stream ? "all" : s.stream)}
                        className={`text-xs ${getBadgeClasses("stream", s.stream)}`}
                      >
                        {s.stream}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {s.groupName ?? "\u2014"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && stories.length > 0 && (
                <TableRow className="border-white/[0.06]">
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-slate-500"
                  >
                    No stories match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
