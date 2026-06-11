"use client";

import * as React from "react";
import { RefreshCw, AlertTriangle, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JIRA_BROWSE_URL } from "@/lib/jira/constants";

/** A story/issue key rendered as a direct link to the Jira issue. */
export function IssueLink({ issueKey, className }: { issueKey: string; className?: string }) {
  if (!issueKey || issueKey === "—") return <span className="text-muted-fg">—</span>;
  return (
    <a
      href={`${JIRA_BROWSE_URL}/${issueKey}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-mono font-medium text-foreground underline decoration-line-strong underline-offset-2 transition-colors hover:text-coral hover:decoration-coral",
        className,
      )}
    >
      {issueKey}
    </a>
  );
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span className="font-mono">{message}</span>
    </div>
  );
}

export function RefreshButton({
  loading,
  onClick,
  takenAt,
}: {
  loading: boolean;
  onClick: () => void;
  takenAt: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      {takenAt && <span className="text-xs text-muted-fg">refreshed {fmtTime(takenAt)}</span>}
      <Button size="sm" variant="outline" onClick={onClick} disabled={loading}>
        <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        {loading ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}

export function ExportButton({ sprintId }: { sprintId: number }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={`/api/jira/export?sprintId=${sprintId}`}>
        <Download className="size-4" />
        Export SteerCo (CSV)
      </a>
    </Button>
  );
}
