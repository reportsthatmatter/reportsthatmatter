/**
 * Full-text search (#100): query building and the arithmetic that turns an
 * FTS5 match into a quote-anchor link, so a result lands on the exact words
 * matched — the same citable-passage model the rest of the site uses.
 * Design: docs/plans/2026-08-21-search-decisions.md.
 */

/**
 * A reader's query, turned into a safe FTS5 MATCH expression.
 *
 * Only word characters survive extraction, so nothing here can be FTS5
 * syntax — no injection, no syntax error from a stray quote or hyphen.
 * Lowercasing matters for a second reason beyond normalising: FTS5 treats
 * bareword operators (AND, OR, NOT, NEAR) case-sensitively as uppercase, so
 * a reader typing "Cash AND Carry" — the phrase, not the operator — must not
 * have their own words parsed as query syntax.
 */
export function buildMatchQuery(raw: string): string | null {
  const words = raw.match(/[\p{L}\p{N}]+/gu)?.map((word) => word.toLowerCase()) ?? [];
  if (!words.length) return null;
  return words.map((word) => `${word}*`).join(" ");
}

/**
 * Delimiters for FTS5's `highlight()`: two control characters (0x01, 0x02),
 * built with `String.fromCharCode` rather than typed as literal bytes so
 * this file stays plain, diffable ASCII — no invisible character for an
 * editor, a diff view, or a copy-paste to silently mangle. Chosen so
 * nothing a real passage could ever contain is mistaken for one.
 */
export const MARK_OPEN = String.fromCharCode(1);
export const MARK_CLOSE = String.fromCharCode(2);

/**
 * Where the first matched span sits in the *original* (unmarked) text.
 *
 * Nothing before the first `MARK_OPEN` has been altered by `highlight()`, so
 * its index in the marked string is already the answer in the plain string's
 * coordinates — no need to reconstruct the plain text to compute this.
 *
 * @param marked The `body` column run through FTS5's `highlight()`.
 */
export function firstMatchOffsets(marked: string): { start: number; end: number } | null {
  const start = marked.indexOf(MARK_OPEN);
  if (start === -1) return null;
  const closeAt = marked.indexOf(MARK_CLOSE, start);
  if (closeAt === -1) return null;
  return { start, end: closeAt - MARK_OPEN.length };
}

/** The minimal D1 surface this module uses, so it can be faked in tests. */
export type SearchDB = {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
    };
  };
};

export type PassageRow = {
  report: string;
  section: string;
  paragraph_id: string;
  page: string | null;
  body: string;
  marked: string;
};

/**
 * bm25() weights, in `passages`' column order (report, section,
 * paragraph_id, page, body). report/paragraph_id/page are UNINDEXED, so
 * their weight is inert — kept explicit rather than omitted so the column
 * order stays self-evident at the call site. section outweighs body: a
 * report is ~10-2,600 paragraphs to a few dozen section headings, so a
 * heading hit is rare enough to be worth surfacing first when it happens.
 */
const BM25_WEIGHTS = [0, 3.0, 0, 0, 1.0] as const;

/**
 * Passages matching `rawQuery`, most relevant first, each carrying the same
 * `body` + `marked` pair `firstMatchOffsets` turns into a quote anchor.
 * Returns `[]` for a query with no usable words, without touching the
 * database — there's nothing to search for.
 */
export async function queryPassages(
  db: SearchDB,
  rawQuery: string,
  scope: string | null,
  limit = 20
): Promise<PassageRow[]> {
  const match = buildMatchQuery(rawQuery);
  if (!match) return [];

  const sql = `
    SELECT report, section, paragraph_id, page, body, highlight(passages, 4, ?, ?) as marked
    FROM passages
    WHERE passages MATCH ? ${scope ? "AND report = ?" : ""}
    ORDER BY bm25(passages, ${BM25_WEIGHTS.join(", ")})
    LIMIT ?
  `;

  const args: unknown[] = [MARK_OPEN, MARK_CLOSE, match];
  if (scope) args.push(scope);
  args.push(limit);

  const { results } = await db.prepare(sql).bind(...args).all<PassageRow>();
  return results;
}
