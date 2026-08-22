/**
 * Social proof (#96): who marked what — one row per share or save event.
 * Design: docs/plans/2026-08-21-highlights-design.md §4.
 *
 * `actor` is a salted daily hash of IP + user agent — enough to dedupe one
 * reader hammering the same passage; useless for tracking anyone across days,
 * because the salt (see `actorHash`) folds in the date.
 */

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
  readers: number;
};

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
 * Passages in `report` marked by at least `threshold` distinct readers,
 * most-marked first. A reader who both shares and saves the same passage
 * counts once — this is "how many readers", not "how many clicks".
 */
export async function markCounts(
  db: MarksDB,
  report: string,
  threshold: number
): Promise<MarkCount[]> {
  const { results } = await db
    .prepare(
      `SELECT paragraph, exact, prefix, suffix, MAX(page) as page, COUNT(DISTINCT actor) as readers
       FROM marks
       WHERE report = ?
       GROUP BY paragraph, exact
       HAVING readers >= ?
       ORDER BY readers DESC`
    )
    .bind(report, threshold)
    .all<MarkCount>();
  return results;
}
