"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useSprint } from "@/contexts/sprint-context"
import type { SprintStatus } from "@/types"

const PAGE_TITLES: Record<string, { eyebrow: string; title: string }> = {
  "/":                { eyebrow: "I",   title: "Dashboard" },
  "/sprints":         { eyebrow: "II",  title: "Sprint Plan" },
  "/project-backlog": { eyebrow: "III", title: "Project Backlog" },
  "/team":            { eyebrow: "IV",  title: "Team" },
  "/time-off":        { eyebrow: "V",   title: "Time Off" },
  "/capacity":        { eyebrow: "VI",  title: "Capacity Planning" },
  "/settings":        { eyebrow: "VII", title: "Settings" },
}

const SPRINT_SELECTOR_ROUTES = new Set([
  "/capacity",
  "/sprints",
  "/project-backlog",
  "/team",
  "/time-off",
  "/velocity",
])

const STATUS_DOT: Record<SprintStatus, string> = {
  past:     "bg-[color:var(--faint-fg)]",
  previous: "bg-sky-300/70",
  current:  "bg-[color:var(--coral)]",
  next:     "bg-amber-300/80",
  planning: "bg-violet-300/70",
  future:   "bg-[color:var(--faint-fg)]",
}

export function Header() {
  const pathname = usePathname()
  const { sprints, selectedIndex, setSelectedIndex } = useSprint()

  const route = pathname.startsWith("/")
    ? `/${pathname.split("/")[1] || ""}` || "/"
    : pathname
  const meta = PAGE_TITLES[route] ?? { eyebrow: "—", title: "—" }
  const showSelector = SPRINT_SELECTOR_ROUTES.has(route)

  const today = React.useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    [],
  )

  return (
    <header className="border-b hairline bg-[color:var(--paper)]/80 backdrop-blur-md">
      {/* Editorial dateline */}
      <div className="px-10 pt-5 pb-1 flex items-center justify-between">
        <p className="eyebrow">
          <span className="text-[color:var(--coral)]">●</span>{" "}
          <span className="ml-2">York · Capacity Journal</span>
        </p>
        <p className="eyebrow tabular-nums">{today}</p>
      </div>

      {/* Title row */}
      <div className="px-10 pb-5 flex items-end justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-5">
          <span className="font-mono text-[10px] tracking-[0.25em] text-[color:var(--faint-fg)]">
            §{meta.eyebrow}
          </span>
          <h1 className="font-display text-[28px] leading-none font-light tracking-tight text-[color:var(--ink)]">
            {meta.title}
          </h1>
        </div>

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
    <nav className="flex items-baseline gap-0">
      <span className="eyebrow mr-4">Window</span>
      <ul className="flex items-baseline divide-x divide-[color:var(--line)]">
        {sprints.map((s, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(idx)}
                className="group relative px-4 py-1.5 text-left transition-colors"
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={`size-1.5 rounded-full shrink-0 ${STATUS_DOT[s.status]} ${
                      s.isCurrent && isSelected ? "pulse-soft" : ""
                    }`}
                  />
                  <span
                    className={`text-[12px] tracking-tight whitespace-nowrap transition-colors ${
                      isSelected
                        ? "text-[color:var(--ink)]"
                        : "text-[color:var(--muted-fg)] group-hover:text-[color:var(--ink)]"
                    }`}
                  >
                    {s.name}
                  </span>
                </span>
                {isSelected && (
                  <span className="absolute left-4 right-4 -bottom-px h-px bg-[color:var(--coral)] origin-left draw-line" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
