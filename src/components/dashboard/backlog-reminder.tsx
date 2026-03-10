"use client";

import { useState, useEffect } from "react";
import { useSprint } from "@/contexts/sprint-context";
import Link from "next/link";
import { RefreshCw, Clock, X } from "lucide-react";
import { SPRINT_MODE_LABELS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BacklogFreshness {
  count: number;
  lastImportedAt: string | null;
}

interface BacklogReminderProps {
  freshness: Record<string, BacklogFreshness>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL = SPRINT_MODE_LABELS;

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "never imported";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

function isStale(dateStr: string | null): boolean {
  if (!dateStr) return true;
  return Date.now() - new Date(dateStr).getTime() > 86_400_000;
}

function getDismissKey(sprintId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `backlog-reminder-${sprintId}-${today}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BacklogReminder({ freshness }: BacklogReminderProps) {
  const { selectedSprint } = useSprint();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!selectedSprint) return;
    setDismissed(
      localStorage.getItem(getDismissKey(selectedSprint.id)) === "1",
    );
  }, [selectedSprint]);

  if (!selectedSprint) return null;

  // Planning sprint doesn't need a backlog
  if (selectedSprint.status === "planning" || selectedSprint.status === "past" || selectedSprint.status === "future") {
    return null;
  }

  const info = freshness[selectedSprint.id];
  const count = info?.count ?? 0;
  const lastImported = info?.lastImportedAt ?? null;

  // Not stale → nothing to show
  if (!isStale(lastImported)) return null;
  if (dismissed) return null;

  const roleLabel = STATUS_LABEL[selectedSprint.status] ?? "";
  const timeLabel = count === 0 ? "No backlog imported" : `Last import: ${getRelativeTime(lastImported)}`;

  const handleDismiss = () => {
    localStorage.setItem(getDismissKey(selectedSprint.id), "1");
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-slate-900/80 backdrop-blur-sm">
      <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-amber-400/60 via-amber-400/20 to-transparent" />

      <div className="flex items-center gap-4 px-5 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/[0.08]">
          <RefreshCw className="size-3.5 text-amber-400/80" />
        </div>

        <Link
          href="/backlog"
          className="group flex flex-1 items-center gap-3 min-w-0"
        >
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-slate-200">
              Update backlog
            </span>
            <span className="text-slate-500">—</span>
            <span className="font-medium text-slate-300 group-hover:text-slate-100">
              {selectedSprint.name}
            </span>
            {roleLabel && (
              <span className="text-slate-600 hidden sm:inline">
                {roleLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-amber-400/60">
            <Clock className="size-3" />
            <span>{timeLabel}</span>
          </div>
        </Link>

        <button
          onClick={handleDismiss}
          className="rounded-md p-1 text-slate-600 transition-colors hover:bg-white/[0.04] hover:text-slate-400"
          title="Dismiss for today"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
