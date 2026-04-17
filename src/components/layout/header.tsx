"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useSprint } from "@/contexts/sprint-context"
import {
  LayoutDashboard,
  Users,
  ListTodo,
  BarChart3,
  Calendar,
  Palmtree,
  UserCheck,
  PieChart,
  Settings,
} from "lucide-react"

import type { SprintStatus } from "@/types"

const statusDotColors: Record<SprintStatus, string> = {
  past: "bg-slate-600",
  previous: "bg-blue-400",
  current: "bg-[#E31837]",
  next: "bg-amber-400",
  planning: "bg-violet-400",
  future: "bg-slate-600",
}

const pageConfig: Record<string, { title: string; icon: React.ElementType }> = {
  "/": { title: "Dashboard", icon: LayoutDashboard },
  "/team": { title: "Team", icon: Users },
  "/backlog": { title: "Backlog", icon: ListTodo },
  "/capacity": { title: "Capacity", icon: BarChart3 },
  "/sprints": { title: "Sprints", icon: Calendar },
  "/holidays": { title: "Holidays", icon: Palmtree },
  "/availability": { title: "Availability", icon: UserCheck },
  "/allocations": { title: "Allocations", icon: PieChart },
  "/settings": { title: "Settings", icon: Settings },
}

export function Header() {
  const pathname = usePathname()
  const {
    sprints,
    selectedSprint,
    selectedIndex,
    setSelectedIndex,
  } = useSprint()

  const currentPage =
    pageConfig[pathname] ??
    pageConfig[`/${pathname.split("/")[1]}`] ?? {
      title: "Dashboard",
      icon: LayoutDashboard,
    }

  const PageIcon = currentPage.icon

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0a0a12]/80 px-6 backdrop-blur-sm">
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        <PageIcon className="size-4 text-slate-500" />
        <h1 className="text-sm font-semibold text-slate-100">
          {currentPage.title}
        </h1>
      </div>

      {/* Right: sprint selector */}
      <div className="flex items-center gap-3">

        <Separator orientation="vertical" className="h-4 bg-white/[0.08]" />

        {/* Sprint selector — compact tabs for active sprints */}
        <div className="flex items-center rounded-lg bg-white/[0.03] p-0.5">
          {sprints.map((s, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <button
                key={s.id}
                onClick={() => setSelectedIndex(idx)}
                className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer transition-all ${
                  isSelected
                    ? "bg-slate-800 text-slate-100 shadow-sm"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full shrink-0 ${statusDotColors[s.status]} ${s.isCurrent && isSelected ? "animate-pulse" : ""}`}
                />
                <span className="whitespace-nowrap">{s.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
