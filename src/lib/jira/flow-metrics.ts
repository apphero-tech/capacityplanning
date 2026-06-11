/**
 * Flow metrics — pure functions ported verbatim from the toolkit HTML
 * (classifyIssue / computeStream / computeAging / blockedInfo / getBlockers).
 * No I/O here: they take raw Jira issues and return plain serialisable objects,
 * so the same code powers the API routes and any future batch/export job.
 */
import {
  WORKFLOW_IDS,
  DEMO_STATUS_IDS,
  FAILED_STATUS_ID,
  MOVEMENT_FIELD_IDS,
  STREAM_RULES,
  STREAM_LABELS,
  STORY_POINTS_FIELD,
  BLOCKED_FIELD,
  POD_FIELD,
  METRICS,
  DEFAULT_WINDOW_DAYS,
  statusStream,
} from "./constants";
import type { Stream, Track } from "./constants";
import type {
  JiraIssue,
  JiraIssueFields,
  JiraChangelogItem,
} from "./types";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isStatusItem(it: JiraChangelogItem): boolean {
  return (it.field || it.fieldId || "").toLowerCase() === "status";
}

function histories(iss: JiraIssue) {
  return iss.changelog?.histories ?? [];
}

function storyPoints(iss: JiraIssue): number {
  const v = (iss.fields ?? {})[STORY_POINTS_FIELD];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function dayKey(d: string | number): string {
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

// ---------------------------------------------------------------------------
// Stream transitions
// ---------------------------------------------------------------------------

export interface StreamHit {
  metric: number;
  when: string;
}

/** Status transitions (within the window) that match a stream rule. */
export function classifyIssue(iss: JiraIssue, cutoffMs: number): StreamHit[] {
  const hits: StreamHit[] = [];
  histories(iss).forEach((h) => {
    if (new Date(h.created).getTime() < cutoffMs) return;
    (h.items ?? []).forEach((it) => {
      if (!isStatusItem(it)) return;
      STREAM_RULES.forEach((rule, mi) => {
        if (rule(it)) hits.push({ metric: mi, when: h.created });
      });
    });
  });
  return hits;
}

export interface StreamRow {
  key: string;
  summary: string;
  status: string;
  storyPoints: number;
  hits: StreamHit[];
}

export interface StreamResult {
  /** distinct-issue count per metric */
  counts: number[];
  /** story-point sum per metric */
  points: number[];
  /** day -> per-metric {stories, points}; ordered oldest→newest */
  daily: Array<{ day: string; perMetric: Array<{ stories: number; points: number }> }>;
  rows: StreamRow[];
  /** issues that matched no rule (a Jira filter may have drifted) */
  unclassified: number;
  windowDays: number;
}

export function computeStream(
  issues: JiraIssue[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
  now: number = Date.now(),
): StreamResult {
  const cutoff = now - windowDays * DAY_MS;
  const counts = METRICS.map(() => new Set<string>());
  const points = METRICS.map(() => 0);

  // Build the ordered set of day buckets across the window.
  const dayKeys: string[] = [];
  const seenDay = new Set<string>();
  for (let t = cutoff; t <= now; t += DAY_MS) {
    const k = dayKey(t);
    if (!seenDay.has(k)) { seenDay.add(k); dayKeys.push(k); }
  }
  const todayKey = dayKey(now);
  if (!seenDay.has(todayKey)) { seenDay.add(todayKey); dayKeys.push(todayKey); }

  const daily: Record<string, Array<{ stories: number; points: number }>> = {};
  dayKeys.forEach((k) => { daily[k] = METRICS.map(() => ({ stories: 0, points: 0 })); });

  const rows: StreamRow[] = [];
  issues.forEach((iss) => {
    const hits = classifyIssue(iss, cutoff);
    const sp = storyPoints(iss);
    const seen = new Set<number>();
    hits.forEach((h) => {
      if (!seen.has(h.metric)) {
        counts[h.metric].add(iss.key ?? "");
        points[h.metric] += sp;
        seen.add(h.metric);
      }
      const dk = dayKey(h.when);
      if (daily[dk]) { daily[dk][h.metric].stories++; daily[dk][h.metric].points += sp; }
    });
    rows.push({
      key: iss.key ?? "—",
      summary: iss.fields?.summary ?? "",
      status: iss.fields?.status?.name ?? "?",
      storyPoints: sp,
      hits,
    });
  });

  // Most-recent transition first; unclassified sink to the bottom.
  const latest = (r: StreamRow) =>
    r.hits.length ? Math.max(...r.hits.map((x) => new Date(x.when).getTime())) : 0;
  rows.sort((a, b) => latest(b) - latest(a));

  return {
    counts: counts.map((s) => s.size),
    points,
    daily: dayKeys.map((k) => ({ day: k, perMetric: daily[k] })),
    rows,
    unclassified: rows.filter((r) => !r.hits.length).length,
    windowDays,
  };
}

export { STREAM_LABELS };

// ---------------------------------------------------------------------------
// Blocked flag + blockers
// ---------------------------------------------------------------------------

export type BlockedState = "yes" | "other" | "no" | "unknown";

export interface BlockedInfo { state: BlockedState; labels: string[]; }

/** Blocked = a selected option whose value equals "Blocked" (case-insensitive).
 *  Any other selection = "other" (shown, not counted as blocked). */
export function blockedInfo(f: JiraIssueFields): BlockedInfo {
  const v = f[BLOCKED_FIELD];
  const lab = (o: unknown): string => {
    if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      return String(r.value ?? r.name ?? r.id ?? o);
    }
    return String(o);
  };
  if (v == null || (Array.isArray(v) && !v.length)) return { state: "no", labels: [] };
  let labels: string[];
  if (Array.isArray(v)) labels = v.map(lab);
  else if (typeof v === "boolean") return { state: v ? "yes" : "no", labels: v ? ["Blocked"] : [] };
  else if (typeof v === "object") labels = [lab(v)];
  else labels = [String(v)];
  labels = labels.filter((x) => x && x.trim() !== "");
  if (!labels.length) return { state: "no", labels: [] };
  const isBlocked = labels.some((x) => x.trim().toLowerCase() === "blocked");
  return { state: isBlocked ? "yes" : "other", labels };
}

/**
 * How a blocker actually bears on the blocked story:
 *  - resolved : blocker is Done — no longer blocking.
 *  - failed   : blocker is in 42 Failed(QA) — a legitimate, active block.
 *  - active   : blocker still in refining/design/development — legitimate block.
 *  - stale    : blocker has reached testing (40+) but is NOT failed — it has
 *               moved on, so the block is an ERROR and the story should be
 *               unblocked.
 */
export type BlockState = "resolved" | "failed" | "active" | "stale";

export interface Blocker {
  key: string;
  status: string;
  statusId: string;
  summary: string;
  done: boolean;
  blockState: BlockState;
}

function classifyBlocker(statusId: string, done: boolean): BlockState {
  if (done) return "resolved";
  if (statusId === FAILED_STATUS_ID) return "failed";
  // Past development (testing stream) but not failed → the block is stale.
  if (WORKFLOW_IDS.has(statusId) && statusStream(statusId).order === 4) return "stale";
  return "active";
}

/**
 * Pod + delivery track. Pod 4 → Marketing; Pod 1/2/3 or no pod → CRM.
 * POD_Name is a multi-option field ("Pod 1".."Pod 4"); we read the digits.
 */
export function podTrack(f: JiraIssueFields): { pod: string | null; track: Track } {
  const v = f[POD_FIELD];
  const vals = Array.isArray(v) ? v : v != null ? [v] : [];
  const nums: number[] = [];
  let label: string | null = null;
  vals.forEach((o) => {
    const s =
      o && typeof o === "object"
        ? String((o as Record<string, unknown>).value ?? (o as Record<string, unknown>).name ?? "")
        : String(o);
    if (!label && s) label = s;
    const m = s.match(/(\d+)/);
    if (m) nums.push(Number(m[1]));
  });
  // Marketing only when the pod is 4; absent pod stays CRM by default.
  const track: Track = nums.includes(4) ? "Marketing" : "CRM";
  return { pod: label, track };
}

/** "is blocked by" links, each classified by how it bears on the story. */
export function getBlockers(f: JiraIssueFields): Blocker[] {
  const out: Blocker[] = [];
  (f.issuelinks ?? []).forEach((l) => {
    const inward = (l.type?.inward ?? "").toLowerCase();
    if (l.inwardIssue && /block/.test(inward)) {
      const bi = l.inwardIssue;
      const st = bi.fields?.status ?? {};
      const statusId = String(st.id ?? "");
      const done = (st.statusCategory?.key ?? "").toLowerCase() === "done";
      out.push({
        key: bi.key ?? "?",
        status: st.name ?? "?",
        statusId,
        summary: bi.fields?.summary ?? "",
        done,
        blockState: classifyBlocker(statusId, done),
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Status aging
// ---------------------------------------------------------------------------

export interface AgingRow {
  key: string;
  summary: string;
  status: string;
  /** ISO timestamp the story entered its current status. */
  enteredAt: string | null;
  /** Calendar days in current status (weekends included), or null. */
  days: number | null;
  /** Status is in the demo/deploy-ready set — never counted as stale. */
  isDemo: boolean;
  /** Dev-cycle stream derived from the status (Refining→Testing). */
  stream: Stream;
  streamOrder: number;
  /** Pod label ("Pod 1"…) or null, and the derived CRM/Marketing track. */
  pod: string | null;
  track: Track;
  blockedState: BlockedState;
  blockedLabels: string[];
  blockers: Blocker[];
  /** Current assignee display name, or null if unassigned. */
  assigneeName: string | null;
  /** ISO timestamp the story was assigned to the current assignee. */
  assignedAt: string | null;
  /** Calendar days with the current assignee (what really measures stagnation). */
  daysWithAssignee: number | null;
  /** ISO of the most recent movement: a status or assignee change. */
  lastMoveAt: string | null;
  // Activity heuristic, filled in by the API route. Activity = the most recent
  // of {comment, status change, assignee change}. `undefined` = not analysed.
  lastCommentAt?: string | null;
  lastCommentAuthor?: string | null;
  lastCommentText?: string | null;
  /** Business days since the last activity (comment OR move); null = unknown. */
  daysSinceActivity?: number | null;
  recentlyActive?: boolean;
}

/** A story is "stuck" once it has been silent for this many business days. */
export const STUCK_BUSINESS_DAYS = 3;

export type Momentum = "moving" | "quiet" | "stuck" | "unknown";

/**
 * Movement is the primary signal. Activity = the most recent of {comment,
 * status change, assignee change}, measured in business days:
 *  - moving : activity within the last business day (today or yesterday),
 *  - quiet  : 2 business days,
 *  - stuck  : no activity for ≥ STUCK_BUSINESS_DAYS, or none at all,
 *  - unknown: not analysed.
 */
export function momentum(r: Pick<AgingRow, "daysSinceActivity">): Momentum {
  if (r.daysSinceActivity === undefined) return "unknown";
  if (r.daysSinceActivity === null) return "stuck";
  if (r.daysSinceActivity <= 1) return "moving";
  if (r.daysSinceActivity >= STUCK_BUSINESS_DAYS) return "stuck";
  return "quiet";
}

export interface AgingResult {
  rows: AgingRow[];
  staleCount: number;
  blockedCount: number;
  excluded: number;
  threshold: number;
}

export function computeAging(
  issues: JiraIssue[],
  threshold: number,
  now: number = Date.now(),
): AgingResult {
  const total = issues.length;
  const onFlow = issues.filter((iss) => {
    const f = iss.fields ?? {};
    const isStory = !f.issuetype || (f.issuetype.name ?? "").toLowerCase() === "story";
    const sid = String(f.status?.id ?? "");
    return isStory && WORKFLOW_IDS.has(sid);
  });

  const rows: AgingRow[] = onFlow.map((iss) => {
    const f = iss.fields ?? {};
    const statusId = String(f.status?.id ?? "");
    // Entered current status = the most recent changelog move INTO it.
    let enter = f.created ?? null;
    let latest: number | null = null;
    histories(iss).forEach((h) =>
      (h.items ?? []).forEach((it) => {
        if (!isStatusItem(it)) return;
        if (String(it.to) !== statusId) return;
        const t = new Date(h.created).getTime();
        if (latest === null || t > latest) latest = t;
      }),
    );
    if (latest !== null) enter = new Date(latest).toISOString();
    const days = enter ? (now - new Date(enter).getTime()) / DAY_MS : null;
    const bi = blockedInfo(f);
    const { stream, order } = statusStream(statusId);
    const { pod, track } = podTrack(f);

    // When was the story assigned to whoever holds it now? The most recent
    // changelog "assignee" change INTO the current assignee; else its creation.
    const assigneeId = f.assignee?.accountId ?? null;
    const assigneeName = f.assignee?.displayName ?? null;
    let assignedAt: string | null = assigneeId ? (f.created ?? null) : null;
    if (assigneeId) {
      let latestA: number | null = null;
      histories(iss).forEach((h) =>
        (h.items ?? []).forEach((it) => {
          if ((it.field || it.fieldId || "").toLowerCase() !== "assignee") return;
          if (String(it.to) !== assigneeId) return;
          const t = new Date(h.created).getTime();
          if (latestA === null || t > latestA) latestA = t;
        }),
      );
      if (latestA !== null) assignedAt = new Date(latestA).toISOString();
    }
    const daysWithAssignee = assignedAt ? (now - new Date(assignedAt).getTime()) / DAY_MS : null;

    // Last movement = the most recent status, assignee, or due-date change.
    let moveAt: number | null = null;
    histories(iss).forEach((h) =>
      (h.items ?? []).forEach((it) => {
        const fid = String(it.fieldId ?? it.field ?? "");
        if (!MOVEMENT_FIELD_IDS.has(fid)) return;
        const t = new Date(h.created).getTime();
        if (moveAt === null || t > moveAt) moveAt = t;
      }),
    );
    const lastMoveAt = moveAt !== null ? new Date(moveAt).toISOString() : null;

    return {
      key: iss.key ?? "—",
      summary: f.summary ?? "",
      status: f.status?.name ?? "?",
      enteredAt: enter,
      days,
      isDemo: DEMO_STATUS_IDS.has(statusId),
      stream,
      streamOrder: order,
      pod,
      track,
      blockedState: bi.state,
      blockedLabels: bi.labels,
      blockers: getBlockers(f),
      assigneeName,
      assignedAt,
      daysWithAssignee,
      lastMoveAt,
    };
  });

  // Most days in current status first (oldest at top); unknowns sink to the bottom.
  rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

  return {
    rows,
    // Demo/deploy-ready stories are done with the dev cycle — not "stale".
    staleCount: rows.filter(
      (r) => !r.isDemo && r.days !== null && threshold > 0 && r.days >= threshold,
    ).length,
    blockedCount: rows.filter((r) => r.blockedState === "yes").length,
    excluded: total - onFlow.length,
    threshold,
  };
}
