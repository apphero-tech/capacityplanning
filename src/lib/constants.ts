export const EXCLUDED_STATUSES = ["Descoped", "Merged", "Split"];

export const TEAM_STREAMS = ["PMO", "MAN", "DES", "REF", "DEV", "QA", "UX", "OCM", "EXEC"] as const;

export const BACKLOG_STREAMS = ["1-REF", "2-DES", "3-DEV", "4-QA", "5-DEMO", "6-SIT", "X-OUT"] as const;

export const COUNTRIES = ["Canada", "Quebec", "India", "USA", "Venezuela"] as const;

export const STREAM_LABELS: Record<string, string> = {
  "1-REF": "Refinement",
  "2-DES": "Design",
  "3-DEV": "Development",
  "4-QA": "QA",
  "5-DEMO": "Demo",
  "6-SIT": "SIT",
  "X-OUT": "Out of Scope",
  PMO: "PMO",
  MAN: "Management",
  DES: "Design",
  REF: "Refinement",
  DEV: "Development",
  QA: "QA",
  UX: "UX",
  OCM: "OCM",
  EXEC: "Executive",
};

export const STREAM_COLORS: Record<string, string> = {
  "1-REF": "#AF0D1A",
  "2-DES": "#3AC2EF",
  "3-DEV": "#10b981",
  "4-QA": "#f59e0b",
  "5-DEMO": "#E31837",
  "6-SIT": "#8b5cf6",
  "X-OUT": "#686260",
  PMO: "#AF0D1A",
  MAN: "#686260",
  DES: "#3AC2EF",
  REF: "#AF0D1A",
  DEV: "#10b981",
  QA: "#f59e0b",
  UX: "#D49F0F",
  OCM: "#14b8a6",
  EXEC: "#810001",
};

export const STATUS_STREAM_PREFIX: Record<string, string> = {
  FCT: "1-REF",
  DES: "2-DES",
  DEV: "3-DEV",
  QA: "4-QA",
  DEMO: "5-DEMO",
  SIT: "6-SIT",
};

export const DEFAULT_FOCUS_FACTOR = 0.9;
export const DEFAULT_ONSHORE_HRS = 40;
export const DEFAULT_OFFSHORE_HRS = 45;
export const VELOCITY_REALISTIC = 0.46;
export const VELOCITY_OPTIMISTIC = 0.65;

// ---------------------------------------------------------------------------
// Centralized badge style maps (JIT-safe — all class strings are literals)
// Pattern: bg-[hex]/10 text-[hex] border-[hex]/20  (or Tailwind palette)
// ---------------------------------------------------------------------------

/** Sprint team badges (Refinement, Design, Development, QA, Overhead). */
export const TEAM_BADGE_STYLES: Record<string, string> = {
  Refinement:  "bg-[#AF0D1A]/10 text-[#AF0D1A] border-[#AF0D1A]/20",
  Design:      "bg-[#3AC2EF]/10 text-[#3AC2EF] border-[#3AC2EF]/20",
  Development: "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  QA:          "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  Overhead:    "bg-[#6b7280]/10 text-[#6b7280] border-[#6b7280]/20",
};

/** Location badges. */
export const LOCATION_BADGE_STYLES: Record<string, string> = {
  Canada:    "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/20",
  Quebec:    "bg-[#6366f1]/10 text-[#6366f1] border-[#6366f1]/20",
  India:     "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  USA:       "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  Venezuela: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20",
};

/** Backlog stream badges. */
export const STREAM_BADGE_STYLES: Record<string, string> = {
  "1-REF":  "bg-[#AF0D1A]/10 text-[#AF0D1A] border-[#AF0D1A]/20",
  "2-DES":  "bg-[#3AC2EF]/10 text-[#3AC2EF] border-[#3AC2EF]/20",
  "3-DEV":  "bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20",
  "4-QA":   "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  "5-DEMO": "bg-[#E31837]/10 text-[#E31837] border-[#E31837]/20",
  "6-SIT":  "bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20",
  "X-OUT":  "bg-[#686260]/10 text-[#686260] border-[#686260]/20",
};

/** Sprint status badges. */
export const SPRINT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  past:     { label: "Past",     className: "bg-slate-700/30 text-slate-500 border-slate-700/50" },
  previous: { label: "Previous", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  current:  { label: "Current",  className: "bg-[#E31837]/20 text-[#E31837] border-[#E31837]/30" },
  next:     { label: "Next",     className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  planning: { label: "Planning", className: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  future:   { label: "Future",   className: "bg-slate-700/30 text-slate-500 border-slate-700/50" },
};

/** Capacity coverage status badges. */
export const COVERAGE_STATUS_BADGE: Record<string, string> = {
  OK:        "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "At Risk": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Over:      "bg-red-500/20 text-red-400 border-red-500/30",
  "N/A":     "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

/** Country badges for holidays. */
export const COUNTRY_BADGE_STYLES: Record<string, string> = {
  Canada:    "bg-red-500/15 text-red-400 border-red-500/30",
  Quebec:    "bg-[#E31837]/15 text-[#E31837] border-[#E31837]/30",
  India:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  USA:       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Venezuela: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Project:   "bg-slate-500/15 text-slate-400 border-slate-500/30",
  Personal:  "bg-pink-500/15 text-pink-400 border-pink-500/30",
};
