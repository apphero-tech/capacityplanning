import {
  TEAM_BADGE_STYLES,
  LOCATION_BADGE_STYLES,
  STREAM_BADGE_STYLES,
  SPRINT_STATUS_BADGE,
  COVERAGE_STATUS_BADGE,
  COUNTRY_BADGE_STYLES,
} from "./constants";

export type BadgeCategory =
  | "team"
  | "location"
  | "stream"
  | "sprint-status"
  | "coverage"
  | "country"
  | "story-status";

const FALLBACK = "bg-slate-500/10 text-slate-400 border-slate-500/20";

/**
 * Returns Badge className for a given category and value.
 * Use with `variant="colored"` on the Badge component.
 */
export function getBadgeClasses(category: BadgeCategory, value: string): string {
  switch (category) {
    case "team":
      return TEAM_BADGE_STYLES[value] ?? FALLBACK;
    case "location":
      return LOCATION_BADGE_STYLES[value] ?? FALLBACK;
    case "stream":
      return STREAM_BADGE_STYLES[value] ?? FALLBACK;
    case "sprint-status":
      return SPRINT_STATUS_BADGE[value]?.className ?? FALLBACK;
    case "coverage":
      return COVERAGE_STATUS_BADGE[value] ?? FALLBACK;
    case "country":
      return COUNTRY_BADGE_STYLES[value] ?? FALLBACK;
    case "story-status":
      return getStoryStatusClasses(value);
    default:
      return FALLBACK;
  }
}

/**
 * Story status colours — migrated from backlog-table.tsx getStatusColor().
 * Returns Tailwind class string.
 */
function getStoryStatusClasses(status: string): string {
  const KNOWN: Record<string, string> = {
    "To Do":              "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "In Progress":        "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "In Review":          "bg-violet-500/10 text-violet-400 border-violet-500/20",
    "Done":               "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Descoped":           "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "Merged":             "bg-slate-500/10 text-slate-400 border-slate-500/20",
    "Split":              "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Blocked":            "bg-red-500/10 text-red-400 border-red-500/20",
    "Ready for Dev":      "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    "Ready for QA":       "bg-amber-500/10 text-amber-400 border-amber-500/20",
    "Ready for SIT":      "bg-violet-500/10 text-violet-400 border-violet-500/20",
    "Ready for Demo":     "bg-[#E31837]/10 text-[#E31837] border-[#E31837]/20",
  };
  if (KNOWN[status]) return KNOWN[status];

  // Fuzzy matching
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("complete") || lower.includes("demo"))
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (lower.includes("progress") || lower.includes("build") || lower.includes("unit test"))
    return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (lower.includes("review") || lower.includes("validation") || lower.includes("deploy"))
    return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  if (lower.includes("block") || lower.includes("failed"))
    return "bg-red-500/10 text-red-400 border-red-500/20";
  if (lower.includes("descope") || lower.includes("merge"))
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  if (lower.includes("ready"))
    return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
  if (lower.includes("to do") || lower.includes("backlog") || lower.includes("open") || lower.includes("refin"))
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  if (lower.includes("design"))
    return "bg-[#3AC2EF]/10 text-[#3AC2EF] border-[#3AC2EF]/20";
  if (lower.includes("testing") || lower.includes("functional"))
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return FALLBACK;
}
