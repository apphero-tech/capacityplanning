"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useSprint } from "@/contexts/sprint-context"
import type { SprintStatus } from "@/types"

const PAGE_TITLES: Record<string, string> = {
  "":                 "Dashboard",
  "sprints":          "Sprint Plan",
  "project-backlog":  "Project Backlog",
  "team":             "Team",
  "time-off":         "Time Off",
  "capacity":         "Capacity Planning",
  "settings":         "Settings",
}

const SPRINT_SELECTOR_ROUTES = new Set([
  "capacity",
  "sprints",
  "project-backlog",
  "team",
  "time-off",
  "velocity",
])

const STATUS_DOT: Record<SprintStatus, string> = {
  past:     "bg-[color:var(--faint-fg)]",
  previous: "bg-sky-300/70",
  current:  "bg-[color:var(--coral)]",
  next:     "bg-amber-300/80",
  planning: "bg-violet-300/70",
  future:   "bg-[color:var(--faint-fg)]",
}

/**
 * Header — software-first.
 *
 * One row, two zones:
 *   • Left:  page title (sans, tight, 18px)
 *   • Right: sprint ribbon when relevant
 *
 * No date, no "journal" branding, no italic flourish — that lives in
 * the Dashboard hero only. Everywhere else, the header stays out of the
 * way so the content breathes.
 */
export function Header() {
  const pathname = usePathname()
  const { sprints, selectedIndex, setSelectedIndex } = useSprint()

  // Strip the workspace slug to find the "section" segment.
  // /york-planning/sprints → "sprints"
  // /york-planning        → ""
  const segments = pathname.split("/").filter(Boolean)
  const section = segments[1] ?? ""
  const title = PAGE_TITLES[section] ?? "Dashboard"
  const showSelector = SPRINT_SELECTOR_ROUTES.has(section)

  return (
    <header className="border-b hairline bg-[color:var(--paper)]/85 backdrop-blur-md">
      <div className="px-10 h-14 flex items-center justify-between gap-6">
        <h1 className="text-[15px] font-medium tracking-tight text-[color:var(--ink)]">
          {title}
        </h1>

        {showSelector && (
          <SprintRibbon
            sprints={sprints}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
        )}
      </div>
    </header>
  )
}

function SprintRibbon({
  sprints,
  selectedIndex,
  onSelect,
}: {
  sprints: ReturnType<typeof useSprint>["sprints"]
  selectedIndex: number
  onSelect: (idx: number) => void
}) {
  return (
    <nav className="flex items-center gap-0">
      <span className="code-label mr-3">window</span>
      <ul className="flex items-center rounded-md border hairline bg-[color:var(--paper-elev)]/40 p-0.5">
        {sprints.map((s, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(idx)}
                className={`group flex items-center gap-1.5 rounded-[4px] px-2.5 h-8 text-[12px] tracking-tight transition-colors ${
                  isSelected
                    ? "bg-[color:var(--ink)]/[0.06] text-[color:var(--ink)]"
                    : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)] hover:bg-[color:var(--ink)]/[0.03]"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full shrink-0 ${STATUS_DOT[s.status]} ${
                    s.isCurrent && isSelected ? "pulse-soft" : ""
                  }`}
                />
                <span className="whitespace-nowrap">{s.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
