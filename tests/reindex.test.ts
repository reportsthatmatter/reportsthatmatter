import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { D1Error, readStoredPassages, type Runner } from "../scripts/lib/d1";
import {
  DEFAULT_COST,
  deleteStatements,
  estimateFullWrites,
  estimateWrites,
  fullStatements,
  incrementalStatements,
  insertStatements,
  passageHash,
  planReindex,
  type Passage,
  type StoredPassage,
} from "../scripts/lib/reindex";

const p = (id: string, body = `text of ${id}`, section = "Intro", page: string | null = "1"): Passage => ({ section, paragraph_id: id, page, body });
const stored = (rows: Passage[]): StoredPassage[] => rows.map((r, i) => ({ ...r, rowid: 100 + i }));

describe("passageHash", () => {
  it("changes with any column the index stores", () => {
    const base = passageHash(p("a"));
    expect(passageHash(p("a", "other"))).not.toBe(base);
    expect(passageHash(p("a", undefined, "Other section"))).not.toBe(base);
    expect(passageHash(p("a", undefined, undefined, "2"))).not.toBe(base);
    expect(passageHash(p("a", undefined, undefined, null))).not.toBe(base);
    expect(passageHash(p("b"))).not.toBe(base);
  });
  it("is the same for the same paragraph", () => {
    expect(passageHash(p("a"))).toBe(passageHash(p("a")));
  });
});

describe("planReindex", () => {
  it("writes nothing when nothing changed", () => {
    const rows = [p("a"), p("b"), p("c")];
    const plan = planReindex(rows, stored(rows));
    expect(plan).toMatchObject({ unchanged: 3, added: 0, changed: 0, removed: 0, insert: [], deleteRowids: [] });
  });

  it("replaces a changed paragraph and leaves the rest", () => {
    const old = [p("a"), p("b"), p("c")];
    const plan = planReindex([p("a"), p("b", "reworded"), p("c")], stored(old));
    expect(plan.changed).toBe(1);
    expect(plan.unchanged).toBe(2);
    expect(plan.insert.map((x) => x.paragraph_id)).toEqual(["b"]);
    expect(plan.deleteRowids).toEqual([101]);
  });

  it("adds new paragraphs and removes ones that went", () => {
    const plan = planReindex([p("a"), p("d")], stored([p("a"), p("b"), p("c")]));
    expect(plan).toMatchObject({ added: 1, removed: 2, changed: 0, unchanged: 1 });
    expect(plan.deleteRowids).toEqual([101, 102]);
    expect(plan.insert.map((x) => x.paragraph_id)).toEqual(["d"]);
  });

  it("treats a paragraph that moved section as changed (the section is a searched column)", () => {
    const plan = planReindex([p("a", undefined, "New section")], stored([p("a")]));
    expect(plan.changed).toBe(1);
  });

  it("keeps duplicate paragraph ids apart rather than losing one", () => {
    const old = [p("x", "first"), p("x", "second")];
    const same = planReindex(old, stored(old));
    expect(same.unchanged).toBe(2);
    const edited = planReindex([p("x", "first"), p("x", "second, edited")], stored(old));
    expect(edited).toMatchObject({ unchanged: 1, changed: 1 });
    expect(edited.deleteRowids).toEqual([101]);
  });

  it("indexes everything into an empty index", () => {
    const plan = planReindex([p("a"), p("b")], []);
    expect(plan).toMatchObject({ added: 2, stored: 0, local: 2 });
  });
});

describe("statements", () => {
  it("escapes quotes in text", () => {
    const [sql] = insertStatements("r", [p("a", "it's the \"commission's\" finding")]);
    expect(sql).toContain("'it''s the \"commission''s\" finding'");
  });

  it("batches by size, and sends a row larger than the budget alone", () => {
    const big = p("big", "x".repeat(500));
    const statements = insertStatements("r", [p("a"), p("b"), big, p("c")], 300);
    expect(statements.length).toBeGreaterThan(1);
    expect(statements.some((s) => s.includes("'big'") && !s.includes("'a'") && !s.includes("'c'"))).toBe(true);
    for (const s of statements) expect(s.startsWith("INSERT INTO passages")).toBe(true);
  });

  it("deletes by rowid in batches of 500", () => {
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    const statements = deleteStatements(ids);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/^DELETE FROM passages WHERE rowid IN \(1,2,/);
  });

  it("an unchanged report is one version upsert", () => {
    const rows = [p("a")];
    const statements = incrementalStatements("r", planReindex(rows, stored(rows)), "v1", 5);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/ON CONFLICT\(report\) DO UPDATE/);
  });

  it("estimates 3 row writes per row written and removed, and one for the version", () => {
    const plan = planReindex([p("a", "new"), p("b")], stored([p("a"), p("b")]));
    expect(estimateWrites(plan)).toBe(3 + 3 + 1);
    expect(estimateFullWrites(2, 2)).toBe(2 * 3 + 2 * 3 + 2);
    expect(DEFAULT_COST).toEqual({ insert: 3, delete: 3, version: 1 });
  });
});

describe("readStoredPassages", () => {
  const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ rid: i + 1, section: "S", paragraph_id: `p${i + 1}`, page: i % 2 ? 7 : null, body: `b${i + 1}` }));

  it("reads in pages until a short page, passing the last rowid on", () => {
    const all = rowsOf(5);
    const seen: string[] = [];
    const run: Runner = (_t, sql) => {
      const command = (sql as { command: string }).command;
      seen.push(command);
      const after = Number(command.match(/rowid > (\d+)/)![1]);
      const limit = Number(command.match(/LIMIT (\d+)/)![1]);
      return [{ results: all.filter((r) => r.rid > after).slice(0, limit), meta: {} }];
    };
    const got = readStoredPassages(run, "--local", "r", 2);
    expect(got.map((r) => r.rowid)).toEqual([1, 2, 3, 4, 5]);
    expect(seen).toHaveLength(3);
    expect(got[1].page).toBe("7"); // a numeric page column comes back as text, as it is compared with
    expect(got[0].page).toBeNull();
  });
});

// node:sqlite ships with Node 22.5+ and includes FTS5; where it does not, these two tests skip.
// (Loaded with require: vite's resolver does not know `node:sqlite`.)
const sqlite: typeof import("node:sqlite") | null = (() => {
  try {
    return createRequire(import.meta.url)("node:sqlite");
  } catch {
    return null;
  }
})();

describe("against a real FTS5 table (node:sqlite)", () => {
  const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

  it.skipIf(!sqlite)("an incremental run leaves exactly the rows a full rewrite would, in far fewer writes", () => {
    const old = Array.from({ length: 200 }, (_, i) => p(`para-${i}`, `The commission found number ${i} and wrote it down.`, `Section ${i % 5}`, String(1 + (i >> 3))));
    // a release: 6 reworded, 4 gone, 3 new
    const next = old
      .filter((r) => !["para-10", "para-11", "para-12", "para-13"].includes(r.paragraph_id))
      .map((r, i) => (i % 33 === 0 ? { ...r, body: `${r.body} It was corrected.` } : r))
      .concat([p("para-new-1"), p("para-new-2"), p("para-new-3")]);

    const open = () => {
      const db = new sqlite!.DatabaseSync(":memory:");
      db.exec(migration("0002_search.sql"));
      for (const s of insertStatements("r", old)) db.exec(s);
      return db;
    };
    const rows = (db: InstanceType<NonNullable<typeof sqlite>["DatabaseSync"]>) =>
      (db.prepare("SELECT rowid, section, paragraph_id, page, body FROM passages WHERE report = 'r' ORDER BY rowid").all() as unknown as StoredPassage[]);
    const content = (list: Array<Passage>) => list.map((r) => [r.paragraph_id, r.section, r.page, r.body].join("|")).sort();

    const inc = open();
    const before = (inc.prepare("SELECT total_changes() AS c").get() as { c: number }).c;
    const plan = planReindex(next, rows(inc));
    for (const s of incrementalStatements("r", plan, "v2", 9)) inc.exec(s);
    const incWrites = (inc.prepare("SELECT total_changes() AS c").get() as { c: number }).c - before;

    const full = open();
    const beforeFull = (full.prepare("SELECT total_changes() AS c").get() as { c: number }).c;
    for (const s of fullStatements("r", next, "v2", 9)) full.exec(s);
    const fullWrites = (full.prepare("SELECT total_changes() AS c").get() as { c: number }).c - beforeFull;

    expect(content(rows(inc))).toEqual(content(next));
    expect(content(rows(inc))).toEqual(content(rows(full)));
    expect(plan).toMatchObject({ added: 3, removed: 4, changed: expect.any(Number) });
    expect(incWrites).toBeLessThan(fullWrites / 5);
    // the estimate is close to what SQLite counted (FTS5's segment maintenance makes it vary a little per run)
    expect(Math.abs(estimateWrites(plan) - incWrites) / incWrites).toBeLessThan(0.25);
    expect((inc.prepare("SELECT content_version FROM search_index_versions WHERE report = 'r'").get() as { content_version: string }).content_version).toBe("v2");

    // and a second run finds nothing to do
    const again = planReindex(next, rows(inc));
    expect(again).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: next.length });
  });

  it.skipIf(!sqlite)("repairs an index a failed run left half-written", () => {
    const old = [p("a"), p("b"), p("c")];
    const db = new sqlite!.DatabaseSync(":memory:");
    db.exec(migration("0002_search.sql"));
    for (const s of insertStatements("r", old)) db.exec(s);
    const next = [p("a"), p("b", "new text"), p("c"), p("d")];
    // a run that got as far as its deletes and then died
    const plan = planReindex(next, db.prepare("SELECT rowid, section, paragraph_id, page, body FROM passages").all() as unknown as StoredPassage[]);
    for (const s of deleteStatements(plan.deleteRowids)) db.exec(s);
    const repair = planReindex(next, db.prepare("SELECT rowid, section, paragraph_id, page, body FROM passages").all() as unknown as StoredPassage[]);
    expect(repair.insert.map((r) => r.paragraph_id).sort()).toEqual(["b", "d"]);
    for (const s of incrementalStatements("r", repair, "v", 1)) db.exec(s);
    expect((db.prepare("SELECT count(*) AS n FROM passages").get() as { n: number }).n).toBe(4);
  });
});

describe("D1Error", () => {
  it("recognises the daily quota error", () => {
    expect(new D1Error("D1_ERROR: exceeded free tier daily row write limit: SQLITE_ERROR [code: 7500]").quotaExhausted).toBe(true);
    expect(new D1Error("D1_ERROR: no such table: passages").quotaExhausted).toBe(false);
  });
});
