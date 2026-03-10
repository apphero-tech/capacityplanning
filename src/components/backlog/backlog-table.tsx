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

  return (
    <div className="flex flex-col gap-4">
      {/* Import bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-slate-900/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-4 text-slate-400" />
          <span className="text-sm text-slate-300">
            Jira backlog for{" "}
            <span className="font-medium text-slate-100">
              {selectedSprint?.name ?? "—"}
            </span>
          </span>
          {stories.length > 0 && (
            <Badge
              variant="outline"
              className="border-transparent bg-slate-800 text-xs text-slate-400"
            >
              {stories.length} stories imported
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Import result feedback */}
          {importResult && (
            <div className="flex items-center gap-2">
              {importResult.success ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  {importResult.imported} stories imported
                  {importResult.detectedColumns && (
                    <span className="text-slate-500">
                      ({importResult.detectedColumns.join(", ")})
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="size-3.5" />
                  {importResult.error}
                </span>
              )}
              <button
                onClick={() => setImportResult(null)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />

          {/* Import button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 border border-white/[0.06] bg-slate-800/50 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            onClick={() => fileRef.current?.click()}
            disabled={importing || !selectedSprint}
          >
            {importing ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="size-3.5" />
                {stories.length > 0 ? "Re-import" : "Import"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Import warnings */}
      {importResult?.success && importResult.warnings && importResult.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs font-medium text-amber-400 mb-1">
            {importResult.warnings.length} warning(s)
          </p>
          <ul className="text-xs text-amber-400/70 space-y-0.5">
            {importResult.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
            {importResult.warnings.length > 5 && (
              <li>… and {importResult.warnings.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Summary stats cards */}
      {stories.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Stories
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-100">
              {stats.totalStories}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total SP
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-100">
              {stats.totalSP}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-2">
            {Object.entries(stats.byStream)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([stream, data]) => {
                const isActive = streamFilter === stream;
                return (
                  <Badge
                    key={stream}
                    variant="colored"
                    interactive
                    active={isActive}
                    onClick={() => setStreamFilter(isActive ? "all" : stream)}
                    className={`text-xs font-medium ${getBadgeClasses("stream", stream)}`}
                  >
                    {stream}: {data.count} ({data.sp} SP)
                  </Badge>
                );
              })}
          </div>
        </div>
      )}

      {/* Filter bar */}
      {stories.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Search key or summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9 border-white/[0.06] bg-slate-900/50 text-slate-300 placeholder:text-slate-600"
            />
          </div>

          <Select value={streamFilter} onValueChange={setStreamFilter}>
            <SelectTrigger className="w-36 border-white/[0.06] bg-slate-900/50 text-slate-300">
              <SelectValue placeholder="All Streams" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All Streams</SelectItem>
              {streams.map((stream) => (
                <SelectItem key={stream} value={stream}>
                  {stream}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-52 border-white/[0.06] bg-slate-900/50 text-slate-300">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={podFilter} onValueChange={setPodFilter}>
            <SelectTrigger className="w-36 border-white/[0.06] bg-slate-900/50 text-slate-300">
              <SelectValue placeholder="All Pods" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.06] bg-slate-900">
              <SelectItem value="all">All Pods</SelectItem>
              <SelectItem value="none">No Pod</SelectItem>
              {pods.map((pod) => (
                <SelectItem key={pod} value={pod}>
                  {pod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              showExcluded
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-white/[0.06] bg-slate-900/50 text-slate-500 hover:text-slate-300"
            }`}
          >
            {showExcluded ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
            {showExcluded ? "Excluded shown" : "Show excluded"}
          </button>

          <span className="ml-auto text-xs text-slate-500">
            {filtered.length} stories
          </span>
        </div>
      )}

      {/* Empty state */}
      {stories.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-slate-900/30 py-16">
          <FileSpreadsheet className="size-10 text-slate-600 mb-4" />
          <h3 className="text-base font-medium text-slate-300 mb-1">
            No backlog for {selectedSprint?.name ?? "this sprint"}
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Upload a Jira CSV export to populate the backlog.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 border border-white/[0.08] bg-slate-800/50 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            onClick={() => fileRef.current?.click()}
            disabled={importing || !selectedSprint}
          >
            {importing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Import CSV
              </>
            )}
          </Button>
        </div>
      )}

      {/* Table */}
      {stories.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-slate-900/50 overflow-hidden">
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
