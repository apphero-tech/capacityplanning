"use client";

import { useMemo } from "react";
import type { GuideEntry } from "@/lib/data";
import { useSprint } from "@/contexts/sprint-context";
import { formatDate } from "@/lib/date-utils";
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
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  Target,
  Zap,
  Clock,
  BookOpen,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// formatDate removed — using shared function from @/lib/date-utils

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SettingsViewProps {
  guideEntries: GuideEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsView({
  guideEntries,
}: SettingsViewProps) {
  const { selectedSprint: currentSprint } = useSprint();
  // Group guide entries by section
  const groupedGuide = useMemo(() => {
    const map = new Map<string, GuideEntry[]>();
    guideEntries.forEach((entry) => {
      const section = entry.section || "General";
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(entry);
    });
    return Array.from(map.entries());
  }, [guideEntries]);

  return (
    <div className="flex flex-col gap-6">
      {/* Sprint Parameters */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#E31837]/15">
              <CalendarDays className="size-5 text-[#E31837]" />
            </div>
            <div>
              <CardTitle className="text-slate-100">
                Current Sprint Parameters
              </CardTitle>
              <CardDescription className="text-slate-400">
                Configuration for the active sprint
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!currentSprint ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Info className="size-8 text-slate-500 mb-3" />
              <p className="text-sm text-slate-400">
                No current sprint configured.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Sprint Name */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Sprint Name
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {currentSprint.name}
                </p>
              </div>

              {/* Start Date */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Start Date
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {formatDate(currentSprint.startDate)}
                </p>
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  End Date
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {formatDate(currentSprint.endDate)}
                </p>
              </div>

              {/* Duration */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Duration
                </p>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-slate-500" />
                  <p className="text-lg font-semibold text-slate-100">
                    {currentSprint.durationWeeks} weeks ({currentSprint.workingDays} working days)
                  </p>
                </div>
              </div>

              {/* Velocity (Proven) */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Velocity (Proven)
                </p>
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-slate-500" />
                  <p className="text-lg font-semibold text-slate-100">
                    {currentSprint.velocityProven !== null
                      ? `${currentSprint.velocityProven.toFixed(2)} SP/hr`
                      : "Not set"}
                  </p>
                </div>
              </div>

              {/* Velocity (Target) */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Velocity (Target)
                </p>
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-slate-500" />
                  <p className="text-lg font-semibold text-slate-100">
                    {currentSprint.velocityTarget !== null
                      ? `${currentSprint.velocityTarget.toFixed(2)} SP/hr`
                      : "Not set"}
                  </p>
                </div>
              </div>

              {/* Focus Factor */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Focus Factor
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {Math.round(currentSprint.focusFactor * 100)}%
                </p>
              </div>

              {/* Story Count */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Story Count
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {currentSprint.storyCount ?? "Not set"}
                </p>
              </div>

              {/* Story Points */}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Story Points
                </p>
                <p className="text-lg font-semibold text-slate-100">
                  {currentSprint.storyPoints !== null
                    ? `${currentSprint.storyPoints} SP`
                    : "Not set"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide / Definitions */}
      <Card className="border-white/[0.06] bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
              <BookOpen className="size-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-slate-100">
                Guide &amp; Definitions
              </CardTitle>
              <CardDescription className="text-slate-400">
                Glossary of terms, default values, and descriptions used
                throughout the capacity planning model
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {groupedGuide.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen className="size-8 text-slate-500 mb-3" />
              <p className="text-sm text-slate-400">
                No guide entries found.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {groupedGuide.map(([section, entries], idx) => (
                <div key={section}>
                  {idx > 0 && (
                    <Separator className="bg-white/[0.06] mb-6" />
                  )}
                  <div className="mb-4">
                    <Badge
                      variant="outline"
                      className="border-white/[0.1] bg-white/[0.03] text-slate-300 mb-3"
                    >
                      {section}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/[0.06] hover:bg-transparent">
                        <TableHead className="text-slate-400 w-[200px]">
                          Term
                        </TableHead>
                        <TableHead className="text-slate-400 w-[120px]">
                          Default
                        </TableHead>
                        <TableHead className="text-slate-400">
                          Description
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow
                          key={entry.id}
                          className="border-white/[0.06] hover:bg-white/[0.02]"
                        >
                          <TableCell className="font-medium text-slate-200">
                            {entry.term}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {entry.defaultVal ?? (
                              <span className="text-slate-600">
                                &mdash;
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {entry.description ?? (
                              <span className="text-slate-600">
                                No description
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
