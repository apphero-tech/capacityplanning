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
