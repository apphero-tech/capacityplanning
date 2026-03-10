"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  ListTodo,
  BarChart3,
  Calendar,
  CalendarOff,
  PieChart,
  Activity,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/backlog", label: "Backlog", icon: ListTodo },
  { href: "/capacity", label: "Capacity", icon: BarChart3 },
  { href: "/sprints", label: "Sprints", icon: Calendar },
  { href: "/velocity", label: "Velocity", icon: Activity },
  { href: "/time-off", label: "Time Off", icon: CalendarOff },
  { href: "/team", label: "Team", icon: Users },
  { href: "/allocations", label: "Allocations", icon: PieChart },
] as const

const bottomNavItems = [
  { href: "/settings", label: "Settings", icon: Settings },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-white/[0.06] bg-[#0c0c14] transition-all duration-200 ease-in-out",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E31837] font-bold text-white text-sm">
          Y
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-slate-100">
            York Planning
          </span>
        )}
      </div>

      <Separator className="bg-white/[0.06]" />

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
        {navItems.map((item) => {
          const active = isActive(item.href)
          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[#E31837]/15 text-[#E31837]"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-[#E31837]" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          }

          return (
            <React.Fragment key={item.href}>{linkContent}</React.Fragment>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="flex flex-col gap-1 px-2 pb-3">
        <Separator className="mb-2 bg-white/[0.06]" />

        {bottomNavItems.map((item) => {
          const active = isActive(item.href)
          const linkContent = (
            <Link
              href={item.href}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[#E31837]/15 text-[#E31837]"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-[#E31837]" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          }

          return (
            <React.Fragment key={item.href}>{linkContent}</React.Fragment>
          )
        })}

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "mt-1 h-9 text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
            collapsed ? "mx-auto w-9" : "w-full justify-start gap-3 px-3"
          )}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
