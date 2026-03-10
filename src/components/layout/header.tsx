"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  Download,
  Loader2,
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

const statusLabels: Record<SprintStatus, string> = {
  past: "Past",
  previous: "Testing & QA",
  current: "Current",
  next: "Next Sprint",
  planning: "Capacity",
  future: "Future",
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
    allSprints,
    selectedSprint,
    selectedIndex,
    setSelectedIndex,
  } = useSprint()

  const [exporting, setExporting] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)

  // Default export selection: active sprints
  const defaultSelection = React.useMemo(() => {
    return new Set<string>(sprints.map((s) => s.id))
  }, [sprints])

  const [exportSelection, setExportSelection] = React.useState<Set<string>>(defaultSelection)

  // Update selection when sprint changes
  React.useEffect(() => {
    setExportSelection(defaultSelection)
  }, [defaultSelection])

  const toggleSprint = (id: string) => {
    setExportSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExport = async () => {
    if (exportSelection.size === 0) return
    setExporting(true)
    try {
      const ids = Array.from(exportSelection).join(",")
      const res = await fetch(`/api/export?sprints=${ids}`)
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `York_Capacity_Planning.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportOpen(false)
    } catch (err) {
      console.error("Export error:", err)
    } finally {
      setExporting(false)
    }
  }

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

      {/* Right: export + sprint selector */}
      <div className="flex items-center gap-3">
        {/* Export button */}
        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-slate-400 hover:text-slate-200 text-xs"
            >
              <Download className="size-3.5" />
              Export
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 bg-slate-900 border-white/[0.06] p-0"
            align="end"
          >
            <div className="p-3 border-b border-white/[0.06]">
              <p className="text-sm font-medium text-slate-200">
                Export to Excel
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Select sprints to include
              </p>
            </div>
            <div className="max-h-52 overflow-y-auto p-2 space-y-0.5">
              {allSprints.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04] cursor-pointer ${
                    s.isActive ? "bg-white/[0.02]" : ""
                  }`}
                >
                  <Checkbox
                    checked={exportSelection.has(s.id)}
                    onCheckedChange={() => toggleSprint(s.id)}
                    className="border-white/20 data-[state=checked]:bg-[#E31837] data-[state=checked]:border-[#E31837]"
                  />
                  <span className={`size-1.5 rounded-full shrink-0 ${statusDotColors[s.status]}`} />
                  <span
                    className={`text-xs ${
                      s.isActive ? "text-slate-200 font-medium" : "text-slate-400"
                    }`}
                  >
                    {s.name}
                  </span>
                  {s.isActive && (
                    <span className="text-[9px] text-slate-500 ml-auto">
                      {statusLabels[s.status]}
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="p-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                {exportSelection.size} sprint{exportSelection.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                size="sm"
                className="h-7 bg-[#E31837] hover:bg-[#AF0D1A] text-white text-xs gap-1.5"
                disabled={exporting || exportSelection.size === 0}
                onClick={handleExport}
              >
                {exporting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="size-3" />
                    Download
                  </>
                )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

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
