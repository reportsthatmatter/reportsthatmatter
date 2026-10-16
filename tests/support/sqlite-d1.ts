/**
 * A D1 stand-in that runs real SQL: Node's built-in SQLite (`node:sqlite`), with the repo's own migrations
 * applied, behind the `prepare().bind().run/all/first` surface the Worker uses. Unlike tests/support/fake-d1.ts,
 * which recognises the shape of a few statements, this executes whatever the code sends, so a test of the public
 * feed (bght.10.1) proves the SQL itself, including what happens when a table is missing.
 *
 * It does not count rows read; scripts/measure-feed.mjs measures that against miniflare's D1.
 */
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MarksDB } from "../../src/lib/marks";

// Loaded through require: vite 5 (vitest 2) does not know `node:sqlite` is a builtin and tries to resolve "sqlite".
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type SqliteD1 = MarksDB & {
  db: DatabaseSyncType;
  /** Every statement prepared, in order: lets a test assert what was (not) queried. */
  statements: string[];
  rows(sql: string, ...args: unknown[]): Array<Record<string, unknown>>;
};

/** A fresh in-memory database with every migration applied, or only those `only` keeps (by file name). */
export function createSqliteD1(options: { only?: (file: string) => boolean } = {}): SqliteD1 {
  const db = new DatabaseSync(":memory:");
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    if (options.only && !options.only(file)) continue;
    // FTS5 may be missing from Node's SQLite build; the feed's tests never touch search.
    try {
      db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      if (!/fts5|no such module|no such table: search_index_versions/i.test(String(error))) throw error;
    }
  }

  const statements: string[] = [];
  const bindable = (args: unknown[]) => args.map((value) => (value === undefined ? null : value)) as Array<string | number | null>;

  return {
    db,
    statements,
    rows: (sql, ...args) => db.prepare(sql).all(...bindable(args)) as Array<Record<string, unknown>>,
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(...args: unknown[]) {
          const values = bindable(args);
          return {
            async run() {
              const result = db.prepare(sql).run(...values);
              return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            },
            async all<T>() {
              return { results: db.prepare(sql).all(...values) as T[] };
            },
            async first<T>() {
              return ((db.prepare(sql).get(...values) as T | undefined) ?? null) as T | null;
            },
          };
        },
      };
    },
  };
}
