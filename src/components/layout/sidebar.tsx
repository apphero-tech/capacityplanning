"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Calendar,
  Target,
  Users,
  CalendarOff,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/contexts/workspace-context"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Sidebar — software product.
 *
 *   • Compact "Y." mark + workspace name (no tagline, no italic).
 *   • Icon + label rows. Active row: coral indicator on the left edge,
 *     ink colour on the icon and label. Hover: subtle ink fade-in.
 *   • Collapsed state shrinks to a 56px rail of icons with tooltips.
 */

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

const sections: NavItem[] = [
  { path: "",                 label: "Dashboard",         icon: LayoutDashboard },
  { path: "/sprints",         label: "Sprint Plan",       icon: Calendar },
  { path: "/project-backlog", label: "Project Backlog",   icon: Target },
  { path: "/team",            label: "Team",              icon: Users },
  { path: "/time-off",        label: "Time Off",          icon: CalendarOff },
  { path: "/capacity",        label: "Capacity Planning", icon: BarChart3 },
]

const colophon: NavItem[] = [
  { path: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { slug, name } = useWorkspace()
  const [collapsed, setCollapsed] = React.useState(false)

  const hrefFor = (path: string) => `/${slug}${path}`
  const isActive = (path: string) => {
    const href = hrefFor(path)
    return path === "" ? pathname === href : pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r hairline bg-[color:var(--paper)] transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Masthead — compact, sober. */}
      <div className="px-4 h-14 flex items-center border-b hairline">
        <Link href={`/${slug}`} className="flex items-center gap-2.5 group">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--ink)]/[0.04] border hairline">
            <span className="font-display text-[16px] leading-none font-light text-[color:var(--ink)] tracking-tight">
              Y
            </span>
          </span>
          {!collapsed && (
            <span className="text-[13px] font-medium tracking-tight text-[color:var(--ink)] truncate">
              {name}
            </span>
          )}
        </Link>
      </div>

      {/* Sections */}
      <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {!collapsed && <p className="eyebrow px-2 mb-2.5">Navigate</p>}
        <ul className="flex flex-col gap-0.5">
          {sections.map((item) => {
            const href = hrefFor(item.path)
            const active = isActive(item.path)
            const Icon = item.icon

            const inner = (
              <Link
                href={href}
                className={cn(
                  "group relative flex items-center rounded-md transition-colors",
                  collapsed ? "h-9 w-9 justify-center mx-auto" : "h-9 px-2.5 gap-3",
                  active
                    ? "bg-[color:var(--ink)]/[0.05] text-[color:var(--ink)]"
                    : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)] hover:bg-[color:var(--ink)]/[0.03]",
                )}
              >
                {active && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] bg-[color:var(--coral)] rounded-r-sm" />
                )}
                <Icon
                  className={cn(
                    "size-[15px] shrink-0 transition-colors",
                    active
                      ? "text-[color:var(--coral)]"
                      : "text-[color:var(--faint-fg)] group-hover:text-[color:var(--muted-fg)]",
                  )}
                />
                {!collapsed && (
                  <span className="text-[13px] tracking-tight">{item.label}</span>
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>{inner}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            }
            return <li key={item.path}>{inner}</li>
          })}
        </ul>
      </nav>

      {/* Footer — settings + collapse */}
      <div className={cn("border-t hairline py-3", collapsed ? "px-2" : "px-3")}>
        <ul className="flex flex-col gap-0.5">
          {colophon.map((item) => {
            const href = hrefFor(item.path)
            const active = isActive(item.path)
            const Icon = item.icon

            const inner = (
              <Link
                href={href}
                className={cn(
                  "group relative flex items-center rounded-md transition-colors",
                  collapsed ? "h-9 w-9 justify-center mx-auto" : "h-9 px-2.5 gap-3",
                  active
                    ? "bg-[color:var(--ink)]/[0.05] text-[color:var(--ink)]"
                    : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)] hover:bg-[color:var(--ink)]/[0.03]",
                )}
              >
                <Icon
                  className={cn(
                    "size-[15px] shrink-0",
                    active ? "text-[color:var(--coral)]" : "text-[color:var(--faint-fg)]",
                  )}
                />
                {!collapsed && (
                  <span className="text-[13px] tracking-tight">{item.label}</span>
                )}
              </Link>
            )
            if (collapsed) {
              return (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>{inner}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            }
            return <li key={item.path}>{inner}</li>
          })}
        </ul>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "mt-2 flex items-center rounded-md text-[color:var(--faint-fg)] hover:text-[color:var(--muted-fg)] hover:bg-[color:var(--ink)]/[0.03] transition-colors",
            collapsed ? "h-9 w-9 justify-center mx-auto" : "h-8 px-2.5 gap-3 w-full",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-[14px]" />
          ) : (
            <>
              <PanelLeftClose className="size-[14px] shrink-0" />
              <span className="text-[12px] tracking-tight">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
