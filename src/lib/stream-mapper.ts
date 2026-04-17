/**
 * Derives backlog stream from a Jira workflow status.
 *
 * Jira statuses follow the pattern "PREFIX-Detail" where the prefix
 * determines which delivery stream the story belongs to.
 *
 * Rules (from user specs):
 *   - Excluded (Descoped/Merged/Split)  → X-OUT
 *   - FCT + "design"                    → 2-DES  (Design: To Be Designed, Designing)
 *   - FCT (without "design")            → 1-REF  (Refinement: To Be Refined, Refining, York Review)
 *   - DES                               → 2-DES  (Design)
 *   - DEV                               → 3-DEV  (Development: Ready to Build, Low-Level Design,
 *                                                   Build & Unit Test, Peer Review, York Validation,
 *                                                   Ready to Deploy → exits to QA next sprint)
 *   - QA                                → 4-QA   (QA)
 *   - DEMO                              → 5-DEMO (Demo)
 *   - SIT                               → 6-SIT  (SIT, after Demo)
 *   - Fallback                          → X-OUT
 *
 * Note: Jira exports may include zero-width characters (U+200B, U+FEFF, etc.)
 * in status values — these are stripped before matching.
 */

import type { BacklogStream } from "@/types";
import { EXCLUDED_STATUSES } from "./constants";

/** Strip zero-width and invisible Unicode characters. */
function stripInvisible(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F\u2028\u2029]/g, "").trim();
}

/**
 * Derive the backlog stream from a Jira workflow status.
 */
export function deriveStream(rawStatus: string): BacklogStream {
  const status = stripInvisible(rawStatus);
  const upper = status.toUpperCase();
  const lower = status.toLowerCase();

  // Check excluded statuses first (Descoped, Merged, Split)
  if (EXCLUDED_STATUSES.some((s) => lower.includes(s.toLowerCase()))) {
    return "X-OUT";
  }

  // FCT with "design" → Design (must be checked before generic FCT)
  if (upper.includes("FCT") && lower.includes("design")) return "2-DES";

  // FCT alone → Refinement (To Be Refined, Refining, York Review)
  if (upper.includes("FCT")) return "1-REF";

  // DES → Design
  if (upper.includes("DES")) return "2-DES";

  // DEV → Development
  if (upper.includes("DEV")) return "3-DEV";

  // QA → QA
  if (upper.includes("QA")) return "4-QA";

  // DEMO → Demo
  if (upper.includes("DEMO")) return "5-DEMO";

  // SIT → SIT
  if (upper.includes("SIT")) return "6-SIT";

  // Fallback for unknown statuses
  return "X-OUT";
}

/**
 * Clean a Jira status string: strip invisible chars and normalize whitespace.
 */
export function cleanStatus(rawStatus: string): string {
  return stripInvisible(rawStatus).replace(/\s+/g, " ").trim();
}

/**
 * Pipeline order rules: each Jira status maps to a two-digit number so an
 * alphabetical sort reflects the real workflow progression. Kept separate
 * from the stream mapping so that fine-grained ordering within a stream
 * (e.g. Build & Unit Test before PR Review) stays explicit and tweakable.
 *
 * The tens digit tracks the stream (1x=refining, 2x=design, 3x=dev,
 * 4x=dev-done, 5x=QA, 6x=demo, 7x=done, 8x=excluded) and the units digit
 * the sub-step.
 */
const STATUS_ORDER_RULES: [RegExp, number][] = [
  [/^new$/i, 0],

  [/^FCT.*to\s*be\s*refined/i, 10],
  [/^FCT.*refining/i, 11],
  [/^FCT.*york\s*review/i, 12],
  [/^FTC.*refin/i, 11], // typo alias

  [/^FCT.*to\s*be\s*designed/i, 20],
  [/^FCT.*designing/i, 21],

  [/^DEV.*ready\s*to\s*build/i, 30],
  [/^DEV.*low\s*level\s*design/i, 31],
  [/^DEV.*build.*unit\s*test/i, 32],
  [/^DEV.*pr\s*review/i, 33],
  [/^DEV.*york\s*validation/i, 34],
  [/^DEV.*ready\s*to\s*deploy/i, 40],

  [/^QA.*ready\s*to\s*functional\s*test/i, 50],
  [/^QA.*functional\s*testing/i, 51],
  [/^QA.*failed/i, 52],
  [/^QA.*ready\s*to\s*demo/i, 53],

  [/^DEMO.*dry\s*run/i, 60],
  [/^DEMO.*demoing/i, 61],
  [/^DEMO.*ready\s*to\s*deploy/i, 62],

  [/^done$/i, 70],

  [/^merged$/i, 80],
  [/^descoped$/i, 81],
  [/^split$/i, 82],
];

/** Return the pipeline order number for a status (99 for unknown). */
export function statusOrder(rawStatus: string): number {
  const s = cleanStatus(rawStatus);
  for (const [pattern, order] of STATUS_ORDER_RULES) {
    if (pattern.test(s)) return order;
  }
  return 99;
}

/**
 * Return the status with a two-digit order prefix so alphabetical sort
 * matches workflow progression. E.g. "FCT-To be Refined" → "10-FCT-To be
 * Refined", "DEV-Ready to Deploy (QA)" → "40-DEV-Ready to Deploy (QA)".
 * Unknown statuses get prefix "99-".
 */
export function withOrderPrefix(rawStatus: string): string {
  const s = cleanStatus(rawStatus);
  if (!s) return s;
  const order = statusOrder(s);
  return `${String(order).padStart(2, "0")}-${s}`;
}
