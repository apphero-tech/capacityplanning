"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
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
import {
  METRICS,
  STREAM_LABELS,
  STREAM_FLOW,
  STREAM_COLORS,
  defaultSprintId,
} from "@/lib/jira/constants";
import type { StreamResult } from "@/lib/jira/flow-metrics";
import type { StreamHistoryPoint } from "@/lib/jira/snapshots";
import { ErrorBanner, RefreshButton, ExportButton, IssueLink, fmtDateTime } from "./shared";

type StreamResponse = StreamResult & { takenAt: string };

// Cached at module scope so re-opening the tab reuses the last result instead
// of re-hitting Jira; only the manual Refresh button (force) re-fetches.
// Lost on a full page reload.
let transitionsCache: { data: StreamResponse; history: StreamHistoryPoint[] } | null = null;

async function fetchStreamHistory(): Promise<StreamHistoryPoint[]> {
  try {
    const res = await fetch("/api/jira/stream/history", { cache: "no-store" });
    const json = await res.json();
    return res.ok ? (json.history ?? []) : [];
  } catch {
    return []; // trend is best-effort
  }
}

export function TransitionsView() {
  const today = new Date().toISOString().slice(0, 10);
  const exportSprint = React.useMemo(() => defaultSprintId(today), [today]);

  const [data, setData] = React.useState<StreamResponse | null>(null);
  const [history, setHistory] = React.useState<StreamHistoryPoint[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [measure, setMeasure] = React.useState<"stories" | "points">("points");
  const [view, setView] = React.useState<"stream" | "day">("stream");

  const load = React.useCallback(async (force = false) => {
    // Reuse the cached result on tab re-entry; only Refresh (force) re-fetches.
    if (!force && transitionsCache) {
      setData(transitionsCache.data);
      setHistory(transitionsCache.history);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jira/stream", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const hist = await fetchStreamHistory();
      setData(json as StreamResponse);
      setHistory(hist);
      transitionsCache = { data: json as StreamResponse, history: hist };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const chartData = React.useMemo(() => {
    if (!data) return [];
    if (view === "stream") {
      const vals = measure === "stories" ? data.counts : data.points;
      return STREAM_FLOW.map((label, i) => ({ name: label, value: vals[i] }));
    }
    return data.daily.map((d) => {
      const row: Record<string, string | number> = { name: d.day.slice(5) };
      d.perMetric.forEach((m, i) => {
        row[`m${i}`] = measure === "stories" ? m.stories : m.points;
      });
      return row;
    });
  }, [data, measure, view]);

  // Weekly trend: the transition metrics are a rolling 7-day window, so the
  // meaningful comparison is week-over-week. We keep one point per Thursday —
  // the snapshot closest to Thursday 10:00 AM (Eastern; the server runs in
  // Toronto time). Snapshots taken any other day are ignored for the trend.
  const trendData = React.useMemo(() => {
    const distTo10 = (iso: string) => {
      const d = new Date(iso);
      return Math.abs(d.getHours() + d.getMinutes() / 60 - 10);
    };
    const byThursday = new Map<string, StreamHistoryPoint>();
    history.forEach((h) => {
      if (new Date(h.takenAt).getDay() !== 4) return; // 4 = Thursday
      const day = h.takenAt.slice(0, 10);
      const prev = byThursday.get(day);
      if (!prev || distTo10(h.takenAt) < distTo10(prev.takenAt)) byThursday.set(day, h);
    });
    return [...byThursday.keys()].sort().map((day) => {
      const h = byThursday.get(day)!;
      const vals = measure === "stories" ? h.counts : h.points;
      const row: Record<string, string | number> = { name: day.slice(5) };
      STREAM_FLOW.forEach((_, i) => { row[`m${i}`] = vals[i] ?? 0; });
      return row;
    });
  }, [history, measure]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Distinct stories making each transition over the last {data?.windowDays ?? 7} days —
          counted from the changelog, by status ID.
        </p>
        <div className="flex items-center gap-3">
          <ExportButton sprintId={exportSprint} />
          <RefreshButton loading={loading} onClick={() => load(true)} takenAt={data?.takenAt ?? null} />
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <Card key={i} className="gap-3 py-4">
            <div className="flex flex-col gap-2 px-5">
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span className="inline-block size-2 rounded-full" style={{ background: STREAM_COLORS[i] }} />
                {m.arrival ? `→ ${m.toN}` : `${m.fromN} → ${m.toN}`}
              </div>
              <div className="text-sm font-medium text-foreground">{STREAM_FLOW[i]}</div>
              <div className="text-[11px] text-muted-fg">
                {m.arrival ? `Arrivals in ${m.toName}` : `${m.fromName} → ${m.toName}`}
              </div>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold tabular-nums text-foreground">
                  {data ? data.points[i] : "—"}
                </span>
                <span className="mb-1 text-xs text-muted-fg">
                  SP{data ? ` · ${data.counts[i]} stories` : ""}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {data && data.unclassified > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="size-3.5" />
          {data.unclassified} unclassified issue(s) — a Jira filter may have drifted from the
          reference definitions.
        </div>
      )}

      {/* Current chart */}
      {data && data.rows.length > 0 && (
        <Card className="gap-4 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5">
            <SegmentedControl
              value={measure}
              onChange={setMeasure}
              options={[
                { value: "stories", label: "User stories" },
                { value: "points", label: "Story points" },
              ]}
            />
            <SegmentedControl
              value={view}
              onChange={setView}
              options={[
                { value: "stream", label: "By stream" },
                { value: "day", label: "By day" },
              ]}
            />
          </div>
          <div className="px-3">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<ChartTooltip />} />
                {view === "stream" ? (
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={STREAM_COLORS[i]} />
                    ))}
                  </Bar>
                ) : (
                  STREAM_FLOW.map((label, i) => (
                    <Bar key={i} dataKey={`m${i}`} name={label} stackId="a" fill={STREAM_COLORS[i]} radius={i === STREAM_FLOW.length - 1 ? [4, 4, 0, 0] : undefined} />
                  ))
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Weekly trend (one point per Thursday). */}
      {data && trendData.length > 0 && (
        <Card className="gap-3 py-5">
          <div className="px-5">
            <div className="text-sm font-medium text-foreground">Weekly trend</div>
            <div className="text-xs text-muted-fg">
              {measure === "stories" ? "Stories" : "Story points"} per transition, one point per week
              (Thursday 10:00 AM, Toronto time).
            </div>
          </div>
          {trendData.length > 1 ? (
            <div className="px-3">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} />
                  <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip cursor={{ stroke: "rgba(255,255,255,0.12)" }} content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} formatter={(v: string) => <span style={{ color: "#94a3b8" }}>{v}</span>} />
                  {STREAM_FLOW.map((label, i) => (
                    <Line key={i} type="monotone" dataKey={`m${i}`} name={label} stroke={STREAM_COLORS[i]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="px-5 pb-1 text-xs text-muted-fg">
              The trend adds one point each Thursday — only this week&apos;s data so far. Come back next Thursday.
            </div>
          )}
        </Card>
      )}

      {/* Detail table */}
      {data && data.rows.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Current status</TableHead>
                <TableHead className="text-right">SP</TableHead>
                <TableHead>Matched metric(s)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell><IssueLink issueKey={r.key} /></TableCell>
                  <TableCell className="text-foreground">
                    <div className="max-w-[360px] truncate" title={r.summary}>{r.summary}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.status}</TableCell>
                  <TableCell className="text-right font-mono">{r.storyPoints || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.hits.length ? (
                      <div className="flex flex-col gap-0.5">
                        {r.hits.map((h, j) => (
                          <span key={j} className="text-muted-foreground">
                            <span className="font-mono text-foreground">{STREAM_LABELS[h.metric]}</span>{" "}
                            ({fmtDateTime(h.when)})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-destructive">unclassified</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
