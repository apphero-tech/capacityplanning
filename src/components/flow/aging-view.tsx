"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { cn } from "@/lib/utils";
import { SPRINTS, defaultSprintId, DEFAULT_AGING_THRESHOLD } from "@/lib/jira/constants";
import type { AgingResult } from "@/lib/jira/flow-metrics";
import { momentum } from "@/lib/jira/flow-metrics";
import type { AgingHistoryPoint } from "@/lib/jira/snapshots";
import { ErrorBanner, RefreshButton, IssueLink, fmtDateTime } from "./shared";
import { AgingExports } from "./aging-exports";

type AgingResponse = AgingResult & { sprintId: number; takenAt: string };

/** Table section order. */
const STREAM_GROUPS = ["Refining", "Design", "Development", "Testing"] as const;

export function AgingView() {
  const today = new Date().toISOString().slice(0, 10);
  const [sprintId, setSprintId] = React.useState<number>(() => defaultSprintId(today));
  const [threshold, setThreshold] = React.useState<number>(DEFAULT_AGING_THRESHOLD);
  const [data, setData] = React.useState<AgingResponse | null>(null);
  const [history, setHistory] = React.useState<AgingHistoryPoint[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [demoView, setDemoView] = React.useState<"show" | "hide">("hide");
  const [trackView, setTrackView] = React.useState<"all" | "CRM" | "Marketing">("CRM");
  // Stream scope = the per-stream boards (Refining=REF, Design=DES, Development=DEV, Testing=QA).
  const [streamView, setStreamView] = React.useState<"all" | "Refining" | "Design" | "Development" | "Testing">("all");
  // Activity focus: "stuck" hides stories that are moving — leaves the real
  // problems (aged AND no activity ≥ 3 business days).
  const [activityView, setActivityView] = React.useState<"all" | "stuck">("all");

  const loadHistory = React.useCallback(async (sid: number) => {
    try {
      const res = await fetch(`/api/jira/aging/history?sprintId=${sid}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setHistory(json.history ?? []);
    } catch {
      /* trend is best-effort */
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/jira/aging?sprintId=${sprintId}&threshold=${threshold}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json as AgingResponse);
      await loadHistory(sprintId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sprintId, threshold, loadHistory]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintId]);

  // One point per calendar day = the last snapshot of that day. History is
  // chronological, so the last write for a date wins.
  const trendData = React.useMemo(() => {
    const byDay = new Map<string, { Stale: number; Blocked: number }>();
    history.forEach((h) => {
      byDay.set(h.takenAt.slice(0, 10), { Stale: h.staleCount, Blocked: h.blockedCount });
    });
    return [...byDay.entries()].map(([day, v]) => ({ name: day.slice(5), ...v }));
  }, [history]);

  // The "Stale after (days)" field is the live threshold — it drives colouring,
  // the stats, AND now filters the table (only stories aged ≥ threshold show).
  const dataThreshold = threshold;

  // Track filter first, then demo filter, then the age threshold. The summary
  // stats below are derived from the *visible* rows so they update live.
  const trackRows = React.useMemo(
    () => (data ? data.rows.filter((r) => trackView === "all" || r.track === trackView) : []),
    [data, trackView],
  );
  // Apply the stream scope (a single stream = that stream's board view).
  const scopeRows = React.useMemo(
    () => trackRows.filter((r) => streamView === "all" || r.stream === streamView),
    [trackRows, streamView],
  );
  const visibleRows = React.useMemo(
    () =>
      scopeRows.filter(
        (r) =>
          (demoView === "show" || !r.isDemo) &&
          (threshold <= 0 || (r.days !== null && r.days >= threshold)) &&
          (activityView === "all" || momentum(r) === "stuck"),
      ),
    [scopeRows, demoView, threshold, activityView],
  );
  const demoCount = scopeRows.filter((r) => r.isDemo).length;
  const marketingCount = data ? data.rows.filter((r) => r.track === "Marketing").length : 0;
  // Percentages are computed against the full counted universe (all on-flow,
  // non-demo stories in the current track + stream scope, regardless of age) —
  // not the threshold-filtered view, so they're meaningful (% stale, % blocked).
  const counted = scopeRows.filter((r) => !r.isDemo);
  const stats = {
    total: counted.length,
    stale: counted.filter((r) => r.days !== null && dataThreshold > 0 && r.days >= dataThreshold).length,
    blocked: counted.filter((r) => r.blockedState === "yes").length,
  };
  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  const renderRow = (r: AgingResponse["rows"][number]) => {
    // Demo/deploy-ready stories are done with the dev cycle — never "late".
    const stale = !r.isDemo && r.days !== null && dataThreshold > 0 && r.days >= 2 * dataThreshold;
    const warn = !r.isDemo && !stale && r.days !== null && dataThreshold > 0 && r.days >= dataThreshold;
    // A blocker legitimately blocks when it's still upstream (active) or Failed(QA).
    // A "stale" blocker has reached testing without failing → the block is an error.
    const blockingNow = r.blockers.filter((b) => b.blockState === "active" || b.blockState === "failed");
    const staleBlocks = r.blockers.filter((b) => b.blockState === "stale");
    const blkClass = (b: (typeof r.blockers)[number]) =>
      b.blockState === "resolved"
        ? "text-faint-fg decoration-slate-700"
        : b.blockState === "stale"
          ? "text-amber-400 decoration-amber-500/50"
          : "text-destructive decoration-destructive/50";

    return (
      <TableRow key={r.key} className={cn(r.isDemo && "opacity-60")}>
        <TableCell><IssueLink issueKey={r.key} /></TableCell>
        <TableCell className="text-foreground">
          <div className="max-w-[340px] truncate" title={r.summary}>{r.summary}</div>
        </TableCell>
        <TableCell className={cn(
          "text-right font-mono font-semibold tabular-nums",
          stale ? "text-destructive" : warn ? "text-amber-400" : "text-foreground",
        )}>
          {r.days === null ? "—" : r.days < 1 ? "<1" : Math.floor(r.days)}
          {stale && " ●"}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs">
          {r.assigneeName ? (
            <span className="text-foreground">{r.assigneeName}</span>
          ) : (
            <span className="text-muted-fg">Unassigned</span>
          )}
        </TableCell>
        <TableCell className="text-right text-xs">
          {r.assigneeName && r.daysWithAssignee !== null ? (() => {
            const a = r.daysWithAssignee;
            const aStale = !r.isDemo && dataThreshold > 0 && a >= 2 * dataThreshold;
            const aWarn = !r.isDemo && !aStale && dataThreshold > 0 && a >= dataThreshold;
            return (
              <span
                title={`Assigned ${fmtDateTime(r.assignedAt)}`}
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  aStale ? "text-destructive" : aWarn ? "text-amber-400" : "text-muted-foreground",
                )}
              >
                {a < 1 ? "<1" : Math.floor(a)}
                {aStale && " ●"}
              </span>
            );
          })() : (
            <span className="text-faint-fg">—</span>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {(() => {
            const m = momentum(r);
            if (m === "unknown") return <span className="text-faint-fg">—</span>;
            const cfg = {
              moving: { c: "text-emerald-400", t: "Moving" },
              quiet: { c: "text-amber-400", t: "Quiet" },
              stuck: { c: "text-destructive", t: "Stuck" },
            }[m];
            const tip = [
              r.lastMoveAt ? `Last move ${fmtDateTime(r.lastMoveAt)}` : "",
              r.lastCommentAt
                ? `Last comment ${fmtDateTime(r.lastCommentAt)}${r.lastCommentAuthor ? ` · ${r.lastCommentAuthor}` : ""}${r.lastCommentText ? `\n“${r.lastCommentText.slice(0, 200)}”` : ""}`
                : "",
            ].filter(Boolean).join("\n") || "No activity recorded";
            return (
              <span className={cn("font-mono", cfg.c)} title={tip}>
                {cfg.t}
                {m !== "moving" && r.daysSinceActivity != null ? ` ${r.daysSinceActivity}d` : ""}
                {m === "stuck" && r.daysSinceActivity == null ? " (none)" : ""}
              </span>
            );
          })()}
        </TableCell>
        <TableCell className="text-xs">
          {r.blockedState === "yes" ? (
            <span className="font-medium text-destructive">{r.blockedLabels.join(", ") || "Blocked"}</span>
          ) : r.blockedState === "other" ? (
            <span className="font-medium text-amber-400">{r.blockedLabels.join(", ")}</span>
          ) : r.blockedState === "no" ? (
            <span className="text-muted-fg">No</span>
          ) : (
            <span className="text-faint-fg">—</span>
          )}
        </TableCell>
        <TableCell className="text-xs">
          {/* Only list blockers when the story is actually flagged blocked. */}
          {r.blockedState === "yes" ? (
            r.blockers.length ? (
              <div className="flex flex-col gap-0.5">
                {r.blockers.map((b) => (
                  <span key={b.key} title={b.summary} className={b.done ? "line-through" : ""}>
                    <IssueLink issueKey={b.key} className={blkClass(b)} />{" "}
                    <span className="text-muted-fg">({b.status})</span>
                  </span>
                ))}
                {staleBlocks.length > 0 ? (
                  <span className="font-mono text-[10px] text-amber-400">⚠ blocker in testing (not failed) — should be unblocked</span>
                ) : blockingNow.length === 0 ? (
                  <span className="font-mono text-[10px] text-amber-400">⚠ flagged, no open blocker</span>
                ) : null}
              </div>
            ) : (
              <span className="font-mono text-[10px] text-amber-400">⚠ flagged, no open blocker</span>
            )
          ) : staleBlocks.length > 0 ? (
            // Not flagged, but a "is blocked by" link points at a testing (not
            // failed) story — the block has moved on and should be removed.
            <div className="flex flex-col gap-0.5">
              {staleBlocks.map((b) => (
                <span key={b.key} title={b.summary}>
                  <IssueLink issueKey={b.key} className="text-amber-400 decoration-amber-500/50" />{" "}
                  <span className="text-muted-fg">({b.status})</span>
                </span>
              ))}
              <span className="font-mono text-[10px] text-amber-400">⚠ blocker in testing (not failed) — should be unblocked</span>
            </div>
          ) : blockingNow.length > 0 ? (
            <span className="font-mono text-[10px] text-amber-400">⚠ open blocker, flag not set</span>
          ) : (
            <span className="text-faint-fg">—</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Collapsible legend — what the three independent signals mean. */}
      <details className="group rounded-lg border border-line bg-muted/30 text-sm">
        <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-4 py-2.5 text-foreground [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Stale · Stuck · Blocked — what&apos;s the difference?</span>
          <span className="ml-auto text-muted-fg transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-[13px] text-muted-foreground">
          <div>
            <span className="font-semibold text-amber-400">Stale</span> — <span className="text-foreground">time.</span>{" "}
            Days in status / with assignee vs the “Stale after” threshold (amber ≥ threshold, red ● ≥ 2×). Purely from dates.
          </div>
          <div>
            <span className="font-semibold text-rose-400">Stuck</span> — <span className="text-foreground">activity.</span>{" "}
            From the latest activity — a comment, or a change to status, assignee, due date, or refined acceptance criteria: 🟢 Moving (moved within the last business day) · 🟡 Quiet · 🔴 Stuck (no activity ≥ 3 business days).
          </div>
          <div>
            <span className="font-semibold text-destructive">Blocked</span> — <span className="text-foreground">dependency.</span>{" "}
            The Jira “Blocked” flag and the “is blocked by” links.
          </div>
          <div className="text-muted-fg">
            These are independent — a story can be old (stale) yet have a fresh assignee, inactive (stuck) without being formally blocked, etc.
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-fg">Sprint</span>
            <select
              value={sprintId}
              onChange={(e) => setSprintId(Number(e.target.value))}
              className="h-8 rounded-md border border-line-strong bg-card px-2 text-sm text-foreground focus:border-line-strong focus:outline-none"
            >
              {SPRINTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.state}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-fg">Stale after (days)</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value) || 0)}
              className="h-8 w-24"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <AgingExports
            rows={visibleRows}
            sprintId={sprintId}
            trackView={trackView}
            threshold={threshold}
            takenAt={data?.takenAt ?? null}
          />
          <RefreshButton loading={loading} onClick={load} takenAt={data?.takenAt ?? null} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span><b className="text-foreground">{stats.total}</b> stories counted{trackView !== "all" ? ` (${trackView})` : ""}</span>
            <span><b className="text-amber-400">{stats.stale}</b> <span className="text-amber-400/70">({pct(stats.stale)}%)</span> at/beyond {dataThreshold}d</span>
            <span><b className="text-destructive">{stats.blocked}</b> <span className="text-destructive/70">({pct(stats.blocked)}%)</span> flagged blocked</span>
            {trackView === "all" && (
              <span className="text-muted-fg">
                {data.rows.length - marketingCount} CRM · {marketingCount} Marketing
              </span>
            )}
            {demoCount > 0 && (
              <span className="text-muted-fg">{demoCount} in demo (not counted late)</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              value={streamView}
              onChange={setStreamView}
              options={[
                { value: "all", label: "All streams" },
                { value: "Refining", label: "REF" },
                { value: "Design", label: "DES" },
                { value: "Development", label: "DEV" },
                { value: "Testing", label: "QA" },
              ]}
            />
            <SegmentedControl
              size="sm"
              value={trackView}
              onChange={setTrackView}
              options={[
                { value: "all", label: "All" },
                { value: "CRM", label: "CRM" },
                { value: "Marketing", label: "Marketing" },
              ]}
            />
            <SegmentedControl
              size="sm"
              value={activityView}
              onChange={setActivityView}
              options={[
                { value: "all", label: "Any activity" },
                { value: "stuck", label: "Stuck only" },
              ]}
            />
            {demoCount > 0 && (
              <SegmentedControl
                size="sm"
                value={demoView}
                onChange={setDemoView}
                options={[
                  { value: "show", label: "Show demo" },
                  { value: "hide", label: "Hide demo" },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {/* Day-by-day trend (one point per calendar day). */}
      {data && trendData.length > 0 && (
        <Card className="gap-3 py-5">
          <div className="px-5">
            <div className="text-sm font-medium text-foreground">Trend</div>
            <div className="text-xs text-muted-fg">
              Stale and blocked stories, by day (whole sprint).
            </div>
          </div>
          {trendData.length > 1 ? (
            <div className="px-3">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} formatter={(v: string) => <span style={{ color: "#94a3b8" }}>{v}</span>} />
                  <Line type="monotone" dataKey="Stale" stroke="#9A6A12" strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="Blocked" stroke="#9E1B32" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="px-5 pb-1 text-xs text-muted-fg">
              The trend builds up one point per day — only today&apos;s data so far. Come back tomorrow.
            </div>
          )}
        </Card>
      )}

      {/* One distinct table per stream — clearer separation than group rows. */}
      {data &&
        STREAM_GROUPS.map((streamName) => {
          const groupRows = visibleRows
            .filter((r) => r.stream === streamName)
            // Within each stream, most days first.
            .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
          if (!groupRows.length) return null;
          return (
            <div key={streamName} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-base font-semibold text-foreground">{streamName}</h3>
                <span className="text-xs text-muted-fg">{groupRows.length} stories</span>
              </div>
              <Card className="overflow-hidden py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Summary</TableHead>
                      <TableHead className="text-right">Days in status</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead className="text-right">Days w/ them</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Blocked</TableHead>
                      <TableHead>Blocked by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      // Sub-group by status (ordered by the numeric prefix),
                      // rows within each status by days descending.
                      const byStatus = new Map<string, AgingResponse["rows"]>();
                      groupRows.forEach((r) => {
                        const arr = byStatus.get(r.status) ?? [];
                        arr.push(r);
                        byStatus.set(r.status, arr);
                      });
                      const ord = (s: string) => {
                        const m = s.match(/^(\d+)/);
                        return m ? Number(m[1]) : 999;
                      };
                      return [...byStatus.keys()]
                        .sort((a, b) => ord(a) - ord(b))
                        .map((st) => {
                          const rows = (byStatus.get(st) ?? []).sort(
                            (a, b) => (b.days ?? -1) - (a.days ?? -1),
                          );
                          return (
                            <React.Fragment key={st}>
                              <TableRow className="border-y border-line bg-muted/40 hover:bg-muted/40">
                                <TableCell colSpan={8} className="py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                                  {st.replace(/​/g, "")}
                                  <span className="ml-2 text-faint-fg">· {rows.length}</span>
                                </TableCell>
                              </TableRow>
                              {rows.map((r) => renderRow(r))}
                            </React.Fragment>
                          );
                        });
                    })()}
                  </TableBody>
                </Table>
              </Card>
            </div>
          );
        })}
    </div>
  );
}
