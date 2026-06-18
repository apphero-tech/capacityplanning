"use client";

import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Day / night switch. The theme class is applied pre-paint by the inline
 * script in app/layout.tsx (default dark); this only flips it and persists the
 * choice. :root is the light palette, .dark the dark one — same York accent.
 */
export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  React.useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };

  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "flex items-center rounded-md text-[color:var(--faint-fg)] transition-colors hover:bg-[color:var(--ink)]/[0.03] hover:text-[color:var(--muted-fg)]",
        collapsed ? "mx-auto h-9 w-9 justify-center" : "h-8 w-full gap-3 px-2.5",
      )}
    >
      <Icon className="size-[14px] shrink-0" />
      {!collapsed && <span className="text-[12px] tracking-tight">{label}</span>}
    </button>
  );
}
