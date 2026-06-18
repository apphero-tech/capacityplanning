/**
 * Server-only Jira client. Replaces the toolkit's browser copy-paste flow:
 * the Next server itself calls the Agile API with Basic auth, pages
 * automatically, and never exposes the token to the browser.
 *
 * Uses the **Agile API** (/rest/agile/1.0/…) on purpose: the platform
 * /rest/api/3/search endpoint was removed (CHANGE-2046) and its replacement no
 * longer returns the changelog inline, while the Agile API still honours
 * expand=changelog — and the changelog is the only source of transition dates.
 *
 * Server-only: this module reads JIRA_API_TOKEN from process.env and is only
 * ever imported by route handlers (which run on the server). Never import it
 * into a Client Component.
 */
import { BOARD_ID, BLOCKED_FIELD, POD_FIELD, STORY_POINTS_FIELD } from "./constants";
import type { JiraIssue, JiraIssuePage } from "./types";

const PAGE_SIZE = 100;
const SPRINT_FIELDS = `summary,status,created,issuetype,issuelinks,assignee,${BLOCKED_FIELD},${POD_FIELD}`;

function requireEnv(): { base: string; email: string; token: string } {
  const base = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) {
    const missing = [
      !base && "JIRA_BASE_URL",
      !email && "JIRA_EMAIL",
      !token && "JIRA_API_TOKEN",
    ].filter(Boolean).join(", ");
    throw new Error(
      `Jira is not configured — missing ${missing} in .env. ` +
      `Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens ` +
      `and set JIRA_EMAIL + JIRA_API_TOKEN.`,
    );
  }
  return { base: base.replace(/\/$/, ""), email, token };
}

async function jiraGet<T>(pathAndQuery: string): Promise<T> {
  const { base, email, token } = requireEnv();
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(`${base}${pathAndQuery}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403
        ? " — check JIRA_EMAIL and JIRA_API_TOKEN (the token must belong to that email)."
        : "";
    throw new Error(`Jira ${res.status} ${res.statusText}${hint} ${body.slice(0, 300)}`.trim());
  }
  return (await res.json()) as T;
}

/** Page through an Agile-API issue endpoint until every issue is collected. */
async function fetchAllPages(buildPath: (startAt: number) => string): Promise<JiraIssue[]> {
  const all: JiraIssue[] = [];
  let startAt = 0;
  // Hard cap as a runaway guard (≈10k issues at this page size).
  for (let guard = 0; guard < 100; guard++) {
    const page = await jiraGet<JiraIssuePage>(buildPath(startAt));
    const issues = page.issues ?? [];
    all.push(...issues);
    const total = typeof page.total === "number" ? page.total : all.length;
    startAt += issues.length;
    if (issues.length === 0 || startAt >= total) break;
  }
  return all;
}

/** Stream metrics: union of the four saved filters, with changelog + SP. */
export function fetchBoardIssues(jql: string, extraFields = ""): Promise<JiraIssue[]> {
  const fields = `summary,status${extraFields}`;
  return fetchAllPages(
    (startAt) =>
      `/rest/agile/1.0/board/${BOARD_ID}/issue?jql=${encodeURIComponent(jql)}` +
      `&fields=${encodeURIComponent(fields)}&expand=changelog` +
      `&startAt=${startAt}&maxResults=${PAGE_SIZE}`,
  );
}

/**
 * Backlog refresh: a sprint's Story issues with just the fields the backlog
 * needs (story points + pod). No changelog — much lighter than
 * fetchSprintIssues. The Agile API already scopes by sprint, so each story
 * comes back under the sprint it lives in today.
 */
export function fetchSprintStories(sprintId: number): Promise<JiraIssue[]> {
  const fields = `summary,status,issuetype,${STORY_POINTS_FIELD},${POD_FIELD}`;
  return fetchAllPages(
    (startAt) =>
      `/rest/agile/1.0/sprint/${sprintId}/issue?jql=${encodeURIComponent("type = Story")}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&startAt=${startAt}&maxResults=${PAGE_SIZE}`,
  );
}

/** Status aging: every Story in a sprint, with changelog. */
export function fetchSprintIssues(sprintId: number): Promise<JiraIssue[]> {
  return fetchAllPages(
    (startAt) =>
      `/rest/agile/1.0/sprint/${sprintId}/issue?jql=${encodeURIComponent("type = Story")}` +
      `&fields=${encodeURIComponent(SPRINT_FIELDS)}&expand=changelog` +
      `&startAt=${startAt}&maxResults=${PAGE_SIZE}`,
  );
}

export interface LatestComment {
  created: string;
  author: string;
  text: string;
}

/** Flatten an Atlassian Document Format (ADF) comment body to plain text. */
function adfToText(body: unknown): string {
  const parts: string[] = [];
  const walk = (n: unknown): void => {
    if (!n) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "object") {
      const node = n as Record<string, unknown>;
      if (node.type === "text" && typeof node.text === "string") parts.push(node.text);
      if (node.type === "mention") {
        const attrs = node.attrs as Record<string, unknown> | undefined;
        if (typeof attrs?.text === "string") parts.push(attrs.text);
      }
      if (node.content) walk(node.content);
    }
  };
  walk(body);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The single most recent comment on an issue (for the activity heuristic). */
export async function fetchLatestComment(issueKey: string): Promise<LatestComment | null> {
  const data = await jiraGet<{
    comments?: Array<{ created?: string; author?: { displayName?: string }; body?: unknown }>;
  }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?orderBy=-created&maxResults=1`);
  const c = data.comments?.[0];
  if (!c?.created) return null;
  return { created: c.created, author: c.author?.displayName ?? "", text: adfToText(c.body) };
}
