/**
 * A D1 stand-in for tests: exactly the surface `src/lib/marks.ts` uses, backed
 * by an in-memory array. It does not parse SQL — it recognises the shape of
 * the three statements that module issues, the same way `tests/routes.test.ts`
 * fakes the ASSETS binding rather than serving real files.
 *
 * SQL correctness itself (the GROUP BY, the index, the migration) is proven
 * against a real local D1 by `wrangler d1 migrations apply --local` and the
 * `/api/mark` round trip in scripts/e2e.mjs, not here.
 */
import type { MarksDB } from "../../src/lib/marks";

type Row = {
  report: string;
  section: string;
  paragraph: string;
  exact: string;
  prefix: string;
  suffix: string;
  page: number | null;
  kind: string;
  actor: string;
  created_at: number;
};

export function createFakeD1(): MarksDB & { rows: Row[] } {
  const rows: Row[] = [];

  return {
    rows,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("INSERT")) {
                const [report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at] =
                  args as [string, string, string, string, string, string, number | null, string, string, number];
                rows.push({ report, section, paragraph, exact, prefix, suffix, page, kind, actor, created_at });
              }
              return {};
            },
            async first<T>() {
              if (sql.includes("COUNT(*)")) {
                const [report, actor, since] = args as [string, string, number];
                const n = rows.filter(
                  (row) => row.report === report && row.actor === actor && row.created_at >= since
                ).length;
                return { n } as T;
              }
              throw new Error(`fake-d1: unrecognised first() query: ${sql}`);
            },
            async all<T>() {
              if (sql.includes("GROUP BY")) {
                const [report, threshold] = args as [string, number];
                const groups = new Map<string, Row[]>();
                for (const row of rows) {
                  if (row.report !== report) continue;
                  const editor = sql.includes("editorial:") && row.actor.startsWith("editorial:");
                  const key = `${row.paragraph} ${row.exact} ${editor}`;
                  const group = groups.get(key) ?? [];
                  group.push(row);
                  groups.set(key, group);
                }
                const results = [...groups.values()]
                  .map((group) => ({
                    paragraph: group[0].paragraph,
                    exact: group[0].exact,
                    prefix: group[0].prefix,
                    suffix: group[0].suffix,
                    page: Math.max(...group.map((row) => row.page ?? -Infinity)),
                    readers: new Set(group.map((row) => row.actor)).size,
                    editor: group[0].actor.startsWith("editorial:") ? 1 : 0,
                  }))
                  .filter((row) => row.readers >= threshold)
                  .sort((a, b) => b.readers - a.readers);
                return { results: results as T[] };
              }
              throw new Error(`fake-d1: unrecognised all() query: ${sql}`);
            },
          };
        },
      };
    },
  };
}
