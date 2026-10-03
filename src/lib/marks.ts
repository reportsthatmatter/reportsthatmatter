/**
 * Social proof (#96): who marked what — one row per share or save event.
 * Design: docs/plans/2026-08-21-highlights-design.md §4.
 *
 * `actor` is a salted daily hash of IP + user agent — enough to dedupe one
 * reader hammering the same passage; useless for tracking anyone across days,
 * because the salt (see `actorHash`) folds in the date.
 */

import { resolveParagraph, type AliasMeta } from "./aliases";

export type MarkKind = "share" | "save";

export type MarkEvent = {
  report: string;
  section: string;
  paragraph: string;
  exact: string;
  prefix: string;
  suffix: string;
  page: number | null;
  kind: MarkKind;
};

export type MarkCount = {
  paragraph: string;
  exact: string;
  prefix: string;
  suffix: string;
  page: number | null;
  /** Distinct anonymous readers. Never counts the editor (decision 0013). */
  readers: number;
  /** The editor highlighted these words (an `editorial:` actor, written by `pnpm seed-highlights`). */
  editor: boolean;
};

/**
 * Actors written by `pnpm seed-highlights`, never by a reader: a reader's actor
 * is a 64-hex hash computed on the server, so no request can claim this prefix.
 * Decision 0013: the editor's highlights are labelled as the editor's and are
 * not counted as readers.
 */
export const EDITOR_ACTOR_PREFIX = "editorial:";

/** Whether a stored actor is the editor rather than a reader. */
export function isEditorActor(actor: string): boolean {
  return actor.startsWith(EDITOR_ACTOR_PREFIX);
}

/** The minimal D1 surface this module uses, so it can be faked in tests. */
export type MarksDB = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      run(): Promise<unknown>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Enough to dedupe one reader hammering a report in a sitting; not a serious
 * cap. The salt rotating daily is what actually bounds this — a script cannot
 * accumulate the same actor hash across days to work around it.
 */
export const RATE_LIMIT_PER_DAY = 40;

/** Today, as the date component the salt rotates on. UTC, so it is the same instant everywhere. */
export function todayUTC(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** sha256(secret : date : ip : userAgent), hex-encoded. */
export async function actorHash(
  secret: string,
  date: string,
  ip: string,
  userAgent: string
): Promise<string> {
  const data = new TextEncoder().encode(`${secret}:${date}:${ip}:${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const KINDS: MarkKind[] = ["share", "save"];

/**
 * Validate a mark payload from the client. Never trust it — this is the only
 * thing standing between a malformed request and a bad row in `marks`.
 */
export function parseMarkPayload(body: unknown): MarkEvent | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;

  const report = value.report;
  const paragraph = value.paragraph;
  const exact = value.exact;
  const kind = value.kind;

  if (typeof report !== "string" || !report) return null;
  if (typeof paragraph !== "string" || !paragraph) return null;
  if (typeof exact !== "string" || !exact) return null;
  if (typeof kind !== "string" || !KINDS.includes(kind as MarkKind)) return null;

  // "" on the /full page, which has no single section — the paragraph id is
  // what actually identifies the passage, so section is descriptive only.
  const section = typeof value.section === "string" ? value.section : "";
  const prefix = typeof value.prefix === "string" ? value.prefix : "";
  const suffix = typeof value.suffix === "string" ? value.suffix : "";
  const page = typeof value.page === "number" && Number.isFinite(value.page) ? value.page : null;

  return { report, section, paragraph, exact, prefix, suffix, page, kind: kind as MarkKind };
}

/**
 * Record one marking event, unless the actor has hit the daily cap for this
 * report. Not atomic with the rate-limit check — an acceptable race at this
 * project's scale, where the cap is an abuse guard, not a security boundary.
 */
export async function recordMark(
  db: MarksDB,
  event: MarkEvent,
  actor: string,
  now: number = Date.now()
): Promise<"ok" | "rate-limited"> {
  const since = now - DAY_MS;
  const recent = await db
    .prepare("SELECT COUNT(*) as n FROM marks WHERE report = ? AND actor = ? AND created_at >= ?")
    .bind(event.report, actor, since)
    .first<{ n: number }>();
  if (recent && recent.n >= RATE_LIMIT_PER_DAY) return "rate-limited";

  await db
    .prepare(
      `INSERT INTO marks (report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.report,
      event.section,
      event.paragraph,
      event.exact,
      event.prefix,
      event.suffix,
      event.page,
      event.kind,
      actor,
      now
    )
    .run();

  return "ok";
}

/**
 * Passages in `report` marked by at least `threshold` distinct readers, plus
 * every passage the editor highlighted (flagged `editor`, its readers counted
 * without the editor: decision 0013), most-marked first. A reader who both shares and saves the same passage
 * counts once — this is "how many readers", not "how many clicks".
 *
 * Stored rows keep the paragraph id they were made under, and ids move when a
 * report is re-ingested (q8c). Given the report's pre-rendered `meta`, a row
 * whose id is no longer live is mapped through the paragraph aliases to the id
 * holding its text now, and rows that land on the same (paragraph, words) are
 * merged (j53o). Rows are never rewritten in D1: the alias map ships with the
 * content, so a rollback of the content rolls the mapping back with it. A row
 * with no live id and no alias is returned as stored, as before. Merging adds
 * the readers of each group; a reader who marked the same words under both the
 * old and the new id (only possible across a re-ingest) counts twice, which we
 * accept rather than ship every actor hash out of D1.
 */
export async function markCounts(
  db: MarksDB,
  report: string,
  threshold: number,
  meta?: AliasMeta
): Promise<MarkCount[]> {
  // Grouped by whether the actor is the editor, so readers and the editor are
  // counted apart (decision 0013); the two halves of a passage are merged
  // below. Floor 1: the threshold applies to readers after merging, and an
  // editor's highlight shows whatever its reader count.
  const { results } = await db
    .prepare(
      `SELECT paragraph, exact, prefix, suffix, MAX(page) as page, COUNT(DISTINCT actor) as readers,
              (actor LIKE '${EDITOR_ACTOR_PREFIX}%') as editor
       FROM marks
       WHERE report = ?
       GROUP BY paragraph, exact, editor
       HAVING readers >= ?
       ORDER BY readers DESC`
    )
    .bind(report, 1)
    .all<Omit<MarkCount, "editor"> & { editor: number | boolean }>();

  const merged = new Map<string, MarkCount>();
  for (const row of results) {
    const paragraph = (meta?.paragraphAliases ? resolveParagraph(meta, row.paragraph)?.id : undefined) ?? row.paragraph;
    const key = `${paragraph}\u0000${row.exact}`;
    const editor = Boolean(row.editor);
    const readers = editor ? 0 : row.readers;
    const have = merged.get(key);
    if (!have) {
      merged.set(key, { ...row, paragraph, readers, editor });
    } else {
      have.readers += readers;
      have.editor ||= editor;
      if (row.page !== null && (have.page === null || row.page > have.page)) have.page = row.page;
    }
  }
  return [...merged.values()]
    .filter((row) => row.editor || row.readers >= threshold)
    .sort((a, b) => b.readers - a.readers || Number(b.editor) - Number(a.editor));
}
