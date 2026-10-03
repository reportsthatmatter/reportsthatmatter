/**
 * What `pnpm seed-highlights` writes: the difference between the editor's
 * highlights in D1 and the ones in the approved `editorial/<id>.yaml` files
 * (decision 0013, reportsthatmatter-wb0).
 *
 * D1's free tier is 100,000 row writes a day, and the old seed deleted and
 * re-inserted every highlight on every run. A plan deletes only rows no file
 * asks for any more and inserts only rows that are missing, so a run over
 * unchanged files writes nothing. A row is identified by everything a reader
 * sees of it (report, paragraph, the quote selector, page, section), so a
 * re-ingest that moves an id or a page replaces exactly that highlight.
 */
import type { ResolvedHighlight } from "./editorial";
import { EDITOR_ACTOR_PREFIX } from "./marks";

/** The one editor today. Its prefix is what marks a row as the editor's, not a reader's. */
export const EDITOR_ACTOR = `${EDITOR_ACTOR_PREFIX}rufus-pollock`;

/** A row of the editor's already in D1. */
export type StoredHighlight = ResolvedHighlight & { id: number };

export type SeedPlan = {
  deletes: StoredHighlight[];
  inserts: ResolvedHighlight[];
  unchanged: number;
  /** Row writes D1 bills for the plan: one per delete, one per insert (no FTS on marks). */
  writes: number;
};

export function highlightKey(h: ResolvedHighlight): string {
  return [h.report, h.section, h.paragraph, h.prefix, h.exact, h.suffix, h.page ?? ""].join("\u0000");
}

/**
 * Plan the writes that make D1 match `wanted`, for the reports in `reports`
 * only (a report with no approved file is left alone unless named). Duplicate
 * stored rows (an old double seed) are deleted down to one.
 */
export function planSeed(stored: StoredHighlight[], wanted: ResolvedHighlight[], reports: Iterable<string>): SeedPlan {
  const scope = new Set(reports);
  const want = new Map<string, ResolvedHighlight>();
  for (const h of wanted) if (scope.has(h.report)) want.set(highlightKey(h), h);

  const kept = new Set<string>();
  const deletes: StoredHighlight[] = [];
  for (const row of stored) {
    if (!scope.has(row.report)) continue;
    const key = highlightKey(row);
    if (want.has(key) && !kept.has(key)) kept.add(key);
    else deletes.push(row);
  }
  const inserts = [...want.entries()].filter(([key]) => !kept.has(key)).map(([, h]) => h);
  return { deletes, inserts, unchanged: kept.size, writes: deletes.length + inserts.length };
}

const sql = (value: unknown): string =>
  value === null || value === undefined ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

/** The plan as SQL for `wrangler d1 execute --file`. */
export function planSql(plan: SeedPlan, now: number, actor = EDITOR_ACTOR): string {
  const statements: string[] = [];
  if (plan.deletes.length) {
    statements.push(`DELETE FROM marks WHERE actor = ${sql(actor)} AND id IN (${plan.deletes.map((row) => row.id).join(", ")});`);
  }
  for (const h of plan.inserts) {
    statements.push(
      `INSERT INTO marks (report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at) VALUES (` +
        [h.report, h.section, h.paragraph, h.exact, h.prefix, h.suffix, h.page, "save", actor, now].map(sql).join(", ") +
        `);`
    );
  }
  return statements.join("\n") + (statements.length ? "\n" : "");
}
