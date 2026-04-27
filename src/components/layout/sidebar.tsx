"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Editorial sidebar.
 *
 * Layout — three movements:
 *   1. Masthead   : a compressed serif "Y." mark + the publication line.
 *   2. Sections   : navigation rendered as a numbered editorial table of
 *                   contents. Active item gets a hairline coral underline,
 *                   not a filled pill — pills feel SaaS, underlines feel
 *                   typeset.
 *   3. Colophon   : settings + collapse toggle, in a small caps register.
 *
 * Collapsed state shrinks to a 56px rail showing only the section number;
 * the label appears in a tooltip. The whole rail keeps its 1px right rule.
 */

const sections = [
  { href: "/",                label: "Dashboard"        },
  { href: "/sprints",         label: "Sprint Plan"      },
  { href: "/project-backlog", label: "Project Backlog"  },
  { href: "/team",            label: "Team"             },
  { href: "/time-off",        label: "Time Off"         },
  { href: "/capacity",        label: "Capacity Planning"},
] as const

const colophon = [
  { href: "/settings", label: "Settings" },
] as const

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r hairline bg-[color:var(--paper)] transition-[width] duration-300 ease-out",
        collapsed ? "w-14" : "w-64",
      )}
    >
      {/* Masthead */}
      <div className="px-5 pt-7 pb-6">
        <Link href="/" className="block group">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[44px] leading-none font-light text-[color:var(--ink)] tracking-tight">
              Y
            </span>
            <span className="text-[color:var(--coral)] text-2xl leading-none">.</span>
          </div>
          {!collapsed && (
            <>
              <p className="eyebrow mt-3">York Planning</p>
              <p className="font-display text-[11px] italic font-light text-[color:var(--muted-fg)] mt-1 tracking-wide">
                A capacity journal
              </p>
            </>
          )}
        </Link>
      </div>

      <div className="px-5">
        <div className="h-px bg-[color:var(--line)]" />
      </div>

      {/* Sections */}
      <nav className={cn("flex-1 overflow-y-auto py-6", collapsed ? "px-2" : "px-5")}>
        {!collapsed && <p className="eyebrow mb-4">Sections</p>}
        <ol className="flex flex-col gap-0.5" data-stagger>
          {sections.map((item, idx) => {
            const active = isActive(item.href)
            const number = String(idx + 1).padStart(2, "0")

            const inner = (
              <Link
                href={item.href}
                className={cn(
                  "group relative flex items-baseline py-2.5 transition-colors",
                  collapsed ? "justify-center" : "gap-4",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[10px] tracking-wider tabular-nums shrink-0 transition-colors",
                    active
                      ? "text-[color:var(--coral)]"
                      : "text-[color:var(--faint-fg)] group-hover:text-[color:var(--muted-fg)]",
                  )}
                >
                  {number}
                </span>
                {!collapsed && (
                  <span
                    className={cn(
                      "text-[14px] tracking-tight transition-colors flex-1",
                      active
                        ? "text-[color:var(--ink)]"
                        : "text-[color:var(--muted-fg)] group-hover:text-[color:var(--ink)]",
                    )}
                  >
                    {item.label}
                    {active && (
                      <span className="block h-px bg-[color:var(--coral)] mt-1.5 origin-left draw-line" />
                    )}
                  </span>
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger asChild>{inner}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            }
            return <li key={item.href}>{inner}</li>
          })}
        </ol>
      </nav>

      {/* Colophon */}
      <div className={cn("pb-6", collapsed ? "px-2" : "px-5")}>
        <div className="h-px bg-[color:var(--line)] mb-4" />
        {colophon.map((item) => {
          const active = isActive(item.href)
          const inner = (
            <Link
              href={item.href}
              className={cn(
                "flex items-baseline py-2 transition-colors",
                collapsed ? "justify-center" : "gap-4",
                active
                  ? "text-[color:var(--ink)]"
                  : "text-[color:var(--muted-fg)] hover:text-[color:var(--ink)]",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px] tracking-wider tabular-nums",
                  active ? "text-[color:var(--coral)]" : "text-[color:var(--faint-fg)]",
                )}
              >
                {String(sections.length + 1).padStart(2, "0")}
              </span>
              {!collapsed && <span className="text-[14px] tracking-tight">{item.label}</span>}
            </Link>
          )
          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{inner}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={12}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          }
          return <React.Fragment key={item.href}>{inner}</React.Fragment>
        })}

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "mt-4 w-full text-left text-[10px] tracking-[0.2em] uppercase transition-colors",
            collapsed ? "text-center" : "",
            "text-[color:var(--faint-fg)] hover:text-[color:var(--ink)]",
          )}
        >
          {collapsed ? "→" : "← Collapse"}
        </button>
      </div>
    </aside>
  )
}
