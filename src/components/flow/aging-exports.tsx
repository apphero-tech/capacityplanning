"use client";

import * as React from "react";
import { Download, MessageSquareText, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SPRINTS, JIRA_BROWSE_URL } from "@/lib/jira/constants";
import { momentum } from "@/lib/jira/flow-metrics";
import type { AgingRow } from "@/lib/jira/flow-metrics";

const STREAM_ORDER = ["Refining", "Design", "Development", "Testing"] as const;

function dayLabel(days: number | null): string {
  if (days === null) return "—";
  return days < 1 ? "<1" : String(Math.floor(days));
}

/** A short, report-ready note about how a story's blockers bear on it. */
function blockerNote(r: AgingRow): string {
  const blockingNow = r.blockers.filter((b) => b.blockState === "active" || b.blockState === "failed");
  const stale = r.blockers.filter((b) => b.blockState === "stale");
  if (r.blockedState === "yes") {
    const active = r.recentlyActive ? " · recent activity" : "";
    if (stale.length) return `should be unblocked — blocker ${stale.map((b) => b.key).join(", ")} in testing${active}`;
    if (blockingNow.length) return `blocked by ${blockingNow.map((b) => b.key).join(", ")}${active}`;
    return `flagged, no open blocker${active}`;
  }
  if (stale.length) return `should be unblocked — blocker ${stale.map((b) => b.key).join(", ")} in testing`;
  if (blockingNow.length) return `open blocker, flag not set (${blockingNow.map((b) => b.key).join(", ")})`;
  return "";
}

function blockedLabel(r: AgingRow): string {
  if (r.blockedState === "yes") return r.blockedLabels.join(" / ") || "Blocked";
  if (r.blockedState === "other") return r.blockedLabels.join(" / ");
  if (r.blockedState === "no") return "No";
  return "—";
}

/** The blocker key(s) that actually bear on the story (resolved ones dropped). */
function blockedByKeys(r: AgingRow): string {
  return r.blockers.filter((b) => b.blockState !== "resolved").map((b) => b.key).join(", ");
}

function groupByStream(rows: AgingRow[]): Array<{ stream: string; rows: AgingRow[] }> {
  return STREAM_ORDER.map((stream) => ({
    stream,
    rows: rows
      .filter((r) => r.stream === stream)
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1)),
  })).filter((g) => g.rows.length);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AgingExports({
  rows,
  sprintId,
  trackView,
  threshold,
  takenAt,
}: {
  rows: AgingRow[];
  sprintId: number;
  trackView: "all" | "CRM" | "Marketing";
  threshold: number;
  takenAt: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const sprintName = SPRINTS.find((s) => s.id === sprintId)?.name ?? String(sprintId);
  const scope = trackView === "all" ? "all tracks" : trackView;
  const date = (takenAt ?? "").slice(0, 10);
  const groups = groupByStream(rows);

  // ---- CSV (simple, essential columns for analysis) -------------------
  const buildCsv = (): string => {
    const lines: string[] = [];
    // Single clear header row — easy to open in Excel/Sheets and sort.
    // One value per column; mirrors the on-screen table order, plus the
    // filtering dimensions (Track/Pod/Stream/Status) and a free-text note.
    lines.push("Key,Summary,Track,Pod,Stream,Status,Assignee,Days w/ assignee,Activity,Idle (days no activity),Blocked,Days blocked,Blocked by,Days in status,Blocker note");
    groups.forEach((g) => {
      g.rows.forEach((r) => {
        const m = momentum(r);
        lines.push([
          // Clickable key: Excel / Google Sheets render =HYPERLINK as a link.
          csvCell(`=HYPERLINK("${JIRA_BROWSE_URL}/${r.key}","${r.key}")`),
          csvCell(r.summary),
          csvCell(r.track),
          csvCell(r.pod ?? ""),
          csvCell(g.stream),
          csvCell(r.status.replace(/​/g, "")),
          csvCell(r.assigneeName ?? "Unassigned"),
          csvCell(r.daysWithAssignee == null ? "" : Math.floor(r.daysWithAssignee)),
          csvCell(m === "unknown" ? "" : m),
          csvCell(r.daysSinceActivity ?? ""),
          csvCell(blockedLabel(r)),
          csvCell(r.daysBlocked == null ? "" : Math.floor(r.daysBlocked)),
          csvCell(blockedByKeys(r)),
          csvCell(dayLabel(r.days)),
          csvCell(blockerNote(r)),
        ].join(","));
      });
    });
    return lines.join("\n");
  };

  const downloadCsv = () => {
    const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aging-${sprintName.replace(/[^\w]+/g, "-")}-${scope}-${date}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---- Teams / Slack message ------------------------------------------
  // Mirrors the table: grouped by stream, most days first, one short comment
  // excerpt per story. Complete and paste-ready — no "see CSV".
  const excerpt = (s: string | null | undefined, max = 90): string => {
    if (!s) return "";
    const clean = s.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  };

  /** Second line for a story: activity + blocker + latest-comment excerpt. */
  const storyNote = (r: AgingRow): string => {
    const m = momentum(r);
    const activity =
      m === "moving" ? "🟢 moving"
      : r.daysSinceActivity == null ? "🔴 no activity yet"
      : `${m === "stuck" ? "🔴" : "🟡"} idle ${r.daysSinceActivity}d`;
    const note = blockerNote(r);
    const ex = excerpt(r.lastCommentText);
    return [activity, note ? `⚠ ${note}` : "", ex ? `“${ex}”` : ""].filter(Boolean).join("  ·  ");
  };

  const buildTrackSection = (track: string, trackRows: AgingRow[]): string[] => {
    const c = { moving: 0, quiet: 0, stuck: 0, unknown: 0 };
    trackRows.forEach((r) => { c[momentum(r)]++; });

    const out: string[] = [];
    out.push(`${track} — ${trackRows.length} stories  ·  🟢 ${c.moving} moving  🟡 ${c.quiet} quiet  🔴 ${c.stuck} stuck`);

    // Same grouping/order as the table: by stream, most days first.
    groupByStream(trackRows).forEach((g) => {
      out.push("");
      out.push(`▸ ${g.stream} (${g.rows.length})`);
      g.rows.forEach((r) => {
        const who = r.assigneeName
          ? `${r.assigneeName}${r.daysWithAssignee == null ? "" : ` ${Math.floor(r.daysWithAssignee)}d`}`
          : "Unassigned";
        out.push(`• ${r.key} · ${dayLabel(r.days)}d in status · ${who}`);
        out.push(`    ${storyNote(r)}`);
      });
    });
    return out;
  };

  const buildMessage = (): string => {
    const tracks = trackView === "all" ? (["CRM", "Marketing"] as const) : [trackView];
    const out: string[] = [];
    out.push(`📊 Aging report — ${sprintName}`);
    out.push(`${date} · stale ≥ ${threshold} days`);

    // Top 5 to focus on: the most-aged stuck stories (no activity ≥ 3 business days).
    const focus = [...rows]
      .filter((r) => momentum(r) === "stuck")
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
      .slice(0, 5);
    if (focus.length) {
      out.push("");
      out.push("🎯 TOP 5 TO FOCUS ON (aged + no recent activity)");
      focus.forEach((r, i) => {
        const idle = r.daysSinceActivity == null ? "no activity" : `idle ${r.daysSinceActivity}d`;
        const who = r.assigneeName ?? "Unassigned";
        const tk = trackView === "all" ? `${r.track} · ` : "";
        out.push(`${i + 1}. ${r.key} · ${dayLabel(r.days)}d in status · ${idle} · ${tk}${r.status.replace(/​/g, "")} · ${who}`);
      });
    }

    tracks.forEach((t) => {
      out.push("");
      out.push(`━━━━━━━━━━  ${t.toUpperCase()}  ━━━━━━━━━━`);
      out.push(...buildTrackSection(t, rows.filter((r) => r.track === t)));
    });
    return out.join("\n");
  };

  const message = open ? buildMessage() : "";

  const copyMessage = () => {
    navigator.clipboard.writeText(buildMessage()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows.length}>
        <Download className="size-4" />
        Export CSV
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!rows.length}>
        <MessageSquareText className="size-4" />
        Draft message
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Teams summary</DialogTitle>
            <DialogDescription>
              Reflects the current view ({sprintName} · {scope} · stale ≥{threshold}d). Copy and paste into Teams.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-line-strong bg-card p-3 font-mono text-xs text-foreground">
            {message}
          </pre>
          <DialogFooter>
            <Button size="sm" onClick={copyMessage}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
