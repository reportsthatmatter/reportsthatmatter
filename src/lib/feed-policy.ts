/**
 * What may appear in the public highlights feed (decision 0023, reportsthatmatter-bght.10.1). Pure constants and
 * checks, so the policy can be read and changed in one place and tested without a database.
 *
 * Every default here is decision 0023's option A. The ones an operator may need to change without a code change
 * are environment variables (`[vars]` in wrangler.toml, which still needs a deploy); the immediate, no-deploy
 * switch is `pnpm feed hide --all` (scripts/feed.mjs).
 */

import { AFFECTED_COMMUNITY_REPORTS } from "../generated/affected";

/** The environment the feed reads. All optional: unset means the decision 0023 default. */
export type FeedEnv = {
  /** "false" turns the feed off: no new rows are written and /highlights shows Editor's picks only. */
  FEED_ENABLED?: string;
  /** Comma-separated report ids left out of the feed, on top of `AFFECTED_COMMUNITY_REPORTS`. */
  FEED_EXCLUDE?: string;
  /** Minutes before a reader's passage appears on /highlights (default 30). */
  FEED_DELAY_MINUTES?: string;
};

/**
 * Reports about events with affected communities (decision bead 63cd, strategy section 8). Decision 0023 Q2 A:
 * left out of the public stream until 63cd is decided; they are still shaded inside the report as before.
 * Read from `affected_community: true` in reports/registry.yaml (zh1w), the one list: `pnpm editorial` copies it
 * to src/generated/affected.ts, which the Worker bundles (no YAML parse in the Worker), and `--check` fails if stale.
 */
export { AFFECTED_COMMUNITY_REPORTS };

/** A selection shorter than this (in words, or in characters) is never published: it is not a quotation. */
export const MIN_WORDS = 4;
export const MIN_CHARS = 20;

/**
 * Marks one reader (one daily actor) may make in one report in 24 hours before further passages are held, not
 * shown (design §5.4). The count is the one `recordMark` already reads for its rate limit, so the cap costs no
 * extra D1 read; it counts marks, not distinct passages, which is slightly stricter than the design's wording.
 */
export const PER_ACTOR_REPORT_CAP = 5;

/** Default minutes between a mark and its appearance on /highlights (decision 0023 Q1 A). */
export const DEFAULT_DELAY_MINUTES = 30;

/**
 * Words that hold a passage for a person to look at (`pnpm feed list --held`) instead of showing it. The words a
 * passage contains are always the report's own, so the risk is not invented text but report text lifted out of
 * context: a slur the report quotes in order to condemn it. Matched as whole words, case-insensitively. Kept
 * short on purpose; the affected-community exclusion already covers the reports where this matters most.
 */
export const BLOCKLIST: readonly string[] = [
  "nigger",
  "niggers",
  "faggot",
  "faggots",
  "kike",
  "kikes",
  "paki",
  "pakis",
  "spic",
  "spics",
  "wog",
  "wogs",
  "retard",
  "retards",
  "cunt",
  "cunts",
];

export function feedEnabled(env: FeedEnv | undefined): boolean {
  return (env?.FEED_ENABLED ?? "").trim().toLowerCase() !== "false";
}

/** Whether a report's passages are kept out of the feed. */
export function isExcludedReport(env: FeedEnv | undefined, report: string): boolean {
  if (AFFECTED_COMMUNITY_REPORTS.includes(report)) return true;
  const extra = (env?.FEED_EXCLUDE ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return extra.includes(report);
}

export function delayMs(env: FeedEnv | undefined): number {
  const minutes = Number(env?.FEED_DELAY_MINUTES);
  return (Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_DELAY_MINUTES) * 60_000;
}

export type Verdict = { status: "visible" | "held"; reason: "" | "blocklist" | "cap" } | null;

/**
 * What happens to a verified passage: null (too short, never stored), held, or visible. `actorMarksBefore` is how
 * many marks this actor had made in this report in the last 24 hours before this one.
 */
export function verdictFor(words: string, actorMarksBefore: number): Verdict {
  const trimmed = words.trim();
  if (trimmed.length < MIN_CHARS) return null;
  if (trimmed.split(/\s+/).length < MIN_WORDS) return null;
  if (containsBlockedWord(trimmed)) return { status: "held", reason: "blocklist" };
  if (actorMarksBefore >= PER_ACTOR_REPORT_CAP) return { status: "held", reason: "cap" };
  return { status: "visible", reason: "" };
}

export function containsBlockedWord(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((word) => BLOCKLIST.includes(word));
}
