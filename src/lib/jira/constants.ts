/**
 * Jira Flow constants — ported verbatim from the standalone
 * `york-ai-jira-toolkit.html`. Everything references statuses by **numeric ID**,
 * never by name: nine early-batch statuses (ids ~10301–10312) carry a trailing
 * zero-width space (U+200B) in their names, so hand-typed name matching silently
 * returns 0. IDs are immune. See the toolkit CLAUDE.md for the full saga.
 *
 * Instance: yorkussrp.atlassian.net · Project AI (Admissions Implementation).
 */

/** Scrum board carrying every sprint: 344 — "00 AI Full Board". */
export const BOARD_ID = 344;

/** Blocked — multiselect custom field. "Blocked" (case-insensitive) = blocked. */
export const BLOCKED_FIELD = "customfield_10657";

/** Story Points — number/float custom field. */
export const STORY_POINTS_FIELD = "customfield_10028";

/** POD_Name — multi-option field carrying "Pod 1".."Pod 4". */
export const POD_FIELD = "customfield_10927";

/**
 * The 9 due-date fields: the standard Jira `duedate` plus, per stream, a
 * "Due Date" and an "Adjusted Due Date". Editing any of these is real work.
 */
export const DUE_DATE_FIELD_IDS = [
  "duedate",
  "customfield_10961", "customfield_10960", // Refining: Due Date / Adjusted
  "customfield_10963", "customfield_10962", // Design
  "customfield_10965", "customfield_10964", // Development
  "customfield_10967", "customfield_10966", // Testing
] as const;

/** Refined Acceptance Criteria — editing it is real refinement work. */
export const REFINED_AC_FIELD = "customfield_10654";

/**
 * Changelog fields that count as "movement" on a story: a status change, an
 * assignee change, a due-date edit, or a Refined Acceptance Criteria edit.
 * (Comments are tracked separately.)
 */
export const MOVEMENT_FIELD_IDS = new Set<string>([
  "status",
  "assignee",
  REFINED_AC_FIELD,
  ...DUE_DATE_FIELD_IDS,
]);

/**
 * Delivery track, derived from the pod: Marketing = Pod 4; everything else
 * (Pod 1/2/3 or no pod) = CRM.
 */
export type Track = "CRM" | "Marketing";

/**
 * Dev-cycle stream, derived from the status' numeric prefix (the native Jira
 * "Stream" field is unpopulated, so we read it off the workflow position):
 * 10x → Refining, 20x → Design, 30x → Development, 40x+ → Testing.
 */
export type Stream = "Refining" | "Design" | "Development" | "Testing";

/** Rolling window (days) for the stream-transition metrics. */
export const DEFAULT_WINDOW_DAYS = 7;

/** Default "flag stale after" threshold (days) for status aging. */
export const DEFAULT_AGING_THRESHOLD = 3;

/** Workflow statuses: [name, id, hasZeroWidthSpace]. */
export const STATUSES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["10 - To be Refined", "10301", true],
  ["11 - Refining", "10304", true],
  ["12 - York Review", "10306", true],
  ["20 - To Be Designed", "10334", false],
  ["21 - Designing", "10305", true],
  ["30 - Ready to Build", "10302", true],
  ["31 - Low level design", "10367", false],
  ["32 - Build & Unit Test", "10307", true],
  ["33 - PR Review", "10400", false],
  ["34 - York Validation", "10308", true],
  ["35 - Ready to Deploy (QA)", "10312", true],
  ["40 - Ready to Functional Test", "10303", true],
  ["41 - Functional Testing (QA)", "10309", false],
  ["42 - Failed(QA)", "10401", false],
  ["43 - Ready to Demo(QA)", "10310", false],
  ["50 - Demo dry run", "10532", false],
  ["51 - Ready to Deploy (SIT)", "10313", false],
];

/** Set of valid workflow status IDs — used to keep only on-flow stories. */
export const WORKFLOW_IDS = new Set(STATUSES.map((s) => s[1]));

/**
 * "Demo and beyond" statuses — 43 Ready to Demo(QA), 50 Demo dry run,
 * 51 Ready to Deploy (SIT). A story sitting here is effectively done with the
 * dev cycle, so it is never counted/coloured as "stale" in the aging view
 * (the user can still toggle it visible or hidden).
 */
export const DEMO_STATUS_IDS = new Set(["10310", "10532", "10313"]);

/** 42 - Failed(QA). A blocker in this status legitimately blocks. */
export const FAILED_STATUS_ID = "10401";

/** Public instance browse base — build direct links to issues (client-safe). */
export const JIRA_BROWSE_URL = "https://yorkussrp.atlassian.net/browse";

/** status id → numeric prefix (e.g. "10306" → 12), from the status name. */
const STATUS_ORDER = new Map<string, number>(
  STATUSES.map((s) => [s[1], parseInt(s[0], 10)]),
);

/** Dev-cycle stream + a 1..4 ordering key for a status id. */
export function statusStream(statusId: string): { stream: Stream; order: number } {
  const n = STATUS_ORDER.get(statusId) ?? 99;
  if (n < 20) return { stream: "Refining", order: 1 };
  if (n < 30) return { stream: "Design", order: 2 };
  if (n < 40) return { stream: "Development", order: 3 };
  return { stream: "Testing", order: 4 };
}

export interface FlowMetric {
  kind: string;
  arrival: boolean;
  fromN: string;
  fromName: string;
  toN: string;
  toName: string;
  desc: string;
  /** Saved Jira filter id = source of truth (edits in Jira propagate). */
  filterId: number;
  /** Reference JQL at wiring time (documentary; does not auto-follow). */
  jql: string;
}

/**
 * The four stream metrics, each backed by a saved Jira filter.
 *  - FROM…TO  = a single direct transition.
 *  - CHANGED TO alone = all arrivals into the status, any origin.
 */
export const METRICS: ReadonlyArray<FlowMetric> = [
  {
    kind: "Direct transition", arrival: false,
    fromN: "12", fromName: "York Review", toN: "20", toName: "To Be Designed",
    desc: "Stories that cleared York review and entered the design queue.",
    filterId: 21146,
    jql: `project = "AI" AND type = Story AND status CHANGED FROM 10306 TO 10334 AFTER -7d ORDER BY updated DESC`,
  },
  {
    kind: "Direct transition", arrival: false,
    fromN: "21", fromName: "Designing", toN: "30", toName: "Ready to Build",
    desc: "Stories that moved from design into the build queue.",
    filterId: 21147,
    jql: `project = "AI" AND type = Story AND status CHANGED FROM 10305 TO 10302 AFTER -7d ORDER BY updated DESC`,
  },
  {
    kind: "Direct transition", arrival: false,
    fromN: "35", fromName: "Ready to Deploy (QA)", toN: "40", toName: "Ready to Functional Test",
    desc: "Stories that moved from QA deploy-ready into the functional-test queue.",
    filterId: 21148,
    jql: `project = "AI" AND type = Story AND status CHANGED FROM 10312 TO 10303 AFTER -7d ORDER BY updated DESC`,
  },
  {
    kind: "Arrivals (any origin)", arrival: true,
    fromN: "—", fromName: "any origin", toN: "43", toName: "Ready to Demo (QA)",
    desc: "All stories sent to QA demo, whatever the origin (includes re-submissions after Failed).",
    filterId: 21149,
    jql: `project = "AI" AND type = Story AND status CHANGED TO 10310 AFTER -7d ORDER BY updated DESC`,
  },
];

/** Predicate per metric over a single changelog status item ({from,to}). */
export const STREAM_RULES: ReadonlyArray<(it: { from?: unknown; to?: unknown }) => boolean> = [
  (it) => String(it.from) === "10306" && String(it.to) === "10334",
  (it) => String(it.from) === "10305" && String(it.to) === "10302",
  (it) => String(it.from) === "10312" && String(it.to) === "10303",
  (it) => String(it.to) === "10310",
];

export const STREAM_LABELS = ["12→20", "21→30", "35→40", "→43"];

/** Clear stream-flow names for each transition metric (same order). */
export const STREAM_FLOW = [
  "Refining → Design",
  "Design → Development",
  "Development → Testing",
  "Testing → Demo",
];
export const STREAM_COLORS = ["#9E1B32", "#9A6A12", "#3C6E47", "#5B554B"];

/** One fetch returns the union of the four saved filters. */
export const STREAM_JQL =
  "(filter = 21146 OR filter = 21147 OR filter = 21148 OR filter = 21149)";

export interface SprintRef {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  start: string;
  end: string;
}

/**
 * Sprints on board 344. Hard-coded from the toolkit; refresh via
 * /rest/agile/1.0/board/344/sprint?maxResults=100 when sprints are added.
 */
export const SPRINTS: ReadonlyArray<SprintRef> = [
  { id: 480, name: "Sprint 13B | Product Demo 3", state: "future", start: "2026-11-02", end: "2026-11-13" },
  { id: 479, name: "Sprint 13", state: "future", start: "2026-10-05", end: "2026-10-30" },
  { id: 412, name: "Sprint 12", state: "future", start: "2026-09-07", end: "2026-10-02" },
  { id: 379, name: "Sprint 11", state: "future", start: "2026-08-10", end: "2026-09-04" },
  { id: 378, name: "Sprint 10", state: "active", start: "2026-07-13", end: "2026-08-07" },
  { id: 377, name: "Sprint 9B | Product Demo 2", state: "future", start: "2026-06-22", end: "2026-07-10" },
  { id: 376, name: "Sprint 9", state: "active", start: "2026-05-25", end: "2026-06-19" },
  { id: 375, name: "Sprint 8", state: "closed", start: "2026-04-27", end: "2026-05-22" },
  { id: 374, name: "Sprint 7", state: "closed", start: "2026-03-30", end: "2026-04-24" },
  { id: 446, name: "Sprint 6", state: "closed", start: "2026-02-27", end: "2026-03-27" },
  { id: 366, name: "Sprint 5", state: "closed", start: "2026-02-02", end: "2026-02-27" },
  { id: 333, name: "Sprint 4", state: "closed", start: "2026-01-05", end: "2026-01-30" },
  { id: 239, name: "Sprint 3B | Product Demo 1", state: "closed", start: "2025-12-01", end: "2025-12-19" },
  { id: 238, name: "AP Sprint 3", state: "closed", start: "2025-10-20", end: "2025-11-28" },
  { id: 237, name: "AP Sprint 2", state: "closed", start: "2025-09-08", end: "2025-10-17" },
  { id: 235, name: "AP Sprint 1", state: "closed", start: "2025-07-28", end: "2025-09-05" },
  { id: 234, name: "AP Sprint 0", state: "closed", start: "2025-07-07", end: "2025-07-25" },
];

/**
 * Pick the default sprint, matching the rest of the app: the sprint we're
 * actively *planning for* — the upcoming active sprint (starts today or later),
 * not the one already in flight. Falls back to the in-flight sprint by date,
 * then the most recent active, then the first.
 */
export function defaultSprintId(today: string): number {
  const active = SPRINTS.filter((s) => s.state === "active");
  const upcoming = active
    .filter((s) => s.start >= today)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (upcoming) return upcoming.id;
  for (const s of SPRINTS) if (s.start <= today && today <= s.end) return s.id;
  if (active.length) return active[active.length - 1].id;
  return SPRINTS[0].id;
}
