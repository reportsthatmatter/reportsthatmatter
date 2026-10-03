import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { D1Error, readStored, readStoredPassages, readVersionRow, scanAllLayouts, scanStoredPassages, type Runner, type Statement } from "../scripts/lib/d1";
import {
  DEFAULT_COST,
  deleteStatements,
  estimateFullWrites,
  estimateWrites,
  fullStatements,
  incrementalStatements,
  insertStatements,
  layoutAfter,
  parseLayout,
  passageHash,
  planReindex,
  versionStatement,
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

describe("scanStoredPassages", () => {
  // rowids 1..9: r owns 1, 2, 4, 5, 9; another report owns 3, 6, 7, 8
  const table = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rid) => ({ rid, report: [1, 2, 4, 5, 9].includes(rid) ? "r" : "other", section: "S", paragraph_id: `p${rid}`, page: rid % 2 ? 7 : null, body: `b${rid}` }));
  const fake = (seen: string[]): Runner => (_t, sql) => {
    const command = (sql as { command: string }).command;
    seen.push(command);
    const after = Number(command.match(/rowid > (-?\d+)/)![1]);
    const limit = Number(command.match(/LIMIT (\d+)/)![1]);
    return [{ results: table.filter((r) => r.rid > after).slice(0, limit).map((r) => (r.report === "r" ? { ...r, mine: 1 } : { rid: r.rid, mine: 0, section: null, paragraph_id: null, page: null, body: null })), meta: { rows_read: Math.min(limit, table.filter((r) => r.rid > after).length) } }];
  };

  it("reads the table once in pages, keeps this report's rows, and finds the runs no other row interrupts", () => {
    const seen: string[] = [];
    const got = scanStoredPassages(fake(seen), "--local", "r", 4);
    expect(got.rows.map((r) => r.rowid)).toEqual([1, 2, 4, 5, 9]);
    expect(got.runs).toEqual([[1, 2], [4, 5], [9, 9]]);
    expect(seen).toHaveLength(3);
    expect(seen.every((c) => !/WHERE report =/.test(c))).toBe(true);
    expect(got.rows[0].page).toBe("7"); // a numeric page column comes back as text, as it is compared with
    expect(got.rows[1].page).toBeNull();
    expect(readStoredPassages(fake([]), "--local", "r", 2).map((r) => r.rowid)).toEqual([1, 2, 4, 5, 9]);
  });
});

describe("layouts", () => {
  it("parses only well-formed layouts", () => {
    expect(parseLayout('{"runs":[[1,5],[9,9]],"n":6,"at":3}')).toEqual({ runs: [[1, 5], [9, 9]], n: 6, at: 3 });
    for (const bad of [null, "", "nope", '{"runs":[[5,1]],"n":1}', '{"runs":[[1]],"n":1}', '{"runs":[],"n":"x"}']) expect(parseLayout(bad)).toBeNull();
  });

  it("keeps kept rows in their runs, shrinks them, and appends the inserted rows as one run", () => {
    const storedRows = [1, 2, 4, 5, 9].map((rowid) => ({ rowid }));
    const plan = { ...planReindex([], []), insert: [p("x"), p("y")], deleteRowids: [2, 9] };
    expect(layoutAfter(storedRows, [[1, 2], [4, 5], [9, 9]], plan, 20, 7)).toEqual({ runs: [[1, 1], [4, 5], [20, 21]], n: 5, at: 7 });
    // when this report's row is the table's highest, the new rows continue its run
    expect(layoutAfter(storedRows, [[1, 2], [4, 5], [9, 9]], { ...plan, deleteRowids: [] }, 10, 7).runs).toEqual([[1, 2], [4, 5], [9, 11]]);
    // rows from two different stored runs are never merged, even if their rowids are adjacent after deletes
    expect(layoutAfter([{ rowid: 2 }, { rowid: 3 }], [[1, 2], [3, 4]], { ...plan, insert: [], deleteRowids: [] }, 50, 1).runs).toEqual([[2, 2], [3, 3]]);
  });

  it("writes explicit rowids and the layout when placed", () => {
    const [sql] = insertStatements("r", [p("a"), p("b")], undefined, 41);
    expect(sql).toMatch(/^INSERT INTO passages \(rowid, report,/);
    expect(sql).toContain("(41, 'r',");
    expect(sql).toContain("(42, 'r',");
    expect(versionStatement("r", "v", 5, { runs: [[1, 2]], n: 2, at: 5 })).toContain("layout = excluded.layout");
    expect(versionStatement("r", "v", 5)).not.toContain("layout");
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

describe("the layout against a real FTS5 table and migration 0004 (node:sqlite)", () => {
  const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
  type DB = InstanceType<NonNullable<typeof sqlite>["DatabaseSync"]>;
  /** A Runner over node:sqlite, shaped like wrangler's --json output (no rows_read: SQLite does not count them). */
  const runner = (db: DB, log: string[] = []): Runner => (_t, sql) => {
    if (!("command" in sql)) throw new Error("files are applied with db.exec in these tests");
    log.push(sql.command);
    const stmt = db.prepare(sql.command);
    const results = /^\s*select/i.test(sql.command) ? (stmt.all() as Array<Record<string, unknown>>) : (stmt.run(), []);
    return [{ results, meta: {} } as Statement];
  };
  const open = () => {
    const db = new sqlite!.DatabaseSync(":memory:");
    db.exec(migration("0002_search.sql"));
    db.exec(migration("0004_search_layout.sql"));
    return db;
  };
  const text = (id: string, n: number, tag = "") => Array.from({ length: n }, (_, i) => p(`${id}-${i}`, `${id} paragraph ${i} ${tag}`));
  /** One reindex of `report` to `local`, the way scripts/reindex-search.mjs does it. */
  const reindex = (db: DB, report: string, local: Passage[], at: number, log: string[] = [], opts: { defer?: boolean } = {}) => {
    const run = runner(db, log);
    const version = readVersionRow(run, "--local", report);
    const read = readStored(run, "--local", report, version.layout);
    const plan = planReindex(local, read.rows);
    const first = (db.prepare("SELECT rowid AS rid FROM passages ORDER BY rowid DESC LIMIT 1").get() as { rid?: number } | undefined)?.rid ?? 0;
    const statements = incrementalStatements(report, plan, `v${at}`, at, { firstRowid: first + 1, layout: layoutAfter(read.rows, read.runs, plan, first + 1, at), expectIndexedAt: version.indexedAt });
    const apply = () => db.exec("BEGIN; " + statements.join("\n") + " COMMIT;");
    if (!opts.defer) apply();
    return { read, plan, apply };
  };
  const contents = (db: DB, report: string) => (db.prepare(`SELECT paragraph_id, body FROM passages WHERE report = '${report}' ORDER BY paragraph_id`).all() as Array<{ paragraph_id: string; body: string }>).map((r) => `${r.paragraph_id}|${r.body}`);
  const want = (rows: Passage[]) => rows.map((r) => `${r.paragraph_id}|${r.body}`).sort();

  it.skipIf(!sqlite)("scans once to learn the layout, then reads only the report's own rows, release after release", () => {
    const db = open();
    // three reports indexed the old way, interleaved by alternating batches (as releases leave them)
    for (const [id, n] of [["a", 5], ["b", 4], ["a2", 0], ["c", 6]] as const) if (n) for (const s of insertStatements(id, text(id, n))) db.exec(s);
    for (const s of insertStatements("a", text("a-late", 3))) db.exec(s);
    for (const s of insertStatements("b", text("b-late", 2))) db.exec(s);

    let a = [...text("a", 5), ...text("a-late", 3)];
    const first = reindex(db, "a", a, 1);
    expect(first.read.via).toBe("scan");
    expect(first.read.runs).toEqual([[1, 5], [16, 18]]);
    expect(first.plan).toMatchObject({ unchanged: 8, changed: 0 });

    // release 2: a rewords two paragraphs and gains one; b changes meanwhile (its rows go above a's)
    a = a.map((r, i) => (i === 1 || i === 6 ? { ...r, body: r.body + " reworded" } : r)).concat(p("a-new"));
    reindex(db, "b", [...text("b", 4, "v2"), ...text("b-late", 2)], 2);
    const log: string[] = [];
    const second = reindex(db, "a", a, 3, log);
    expect(second.read.via).toBe("layout");
    expect(log.filter((c) => /FROM passages WHERE report/.test(c))).toEqual([]);
    expect(second.plan).toMatchObject({ changed: 2, added: 1, unchanged: 6 });
    expect(contents(db, "a")).toEqual(want(a));
    expect(contents(db, "b")).toEqual(want([...text("b", 4, "v2"), ...text("b-late", 2)]));

    // and the recorded layout is exactly where a's rows are
    const third = reindex(db, "a", a, 4);
    expect(third.read.via).toBe("layout");
    expect(third.plan).toMatchObject({ changed: 0, added: 0, removed: 0, unchanged: 9 });
    const layout = parseLayout((db.prepare("SELECT layout FROM search_index_versions WHERE report = 'a'").get() as { layout: string }).layout)!;
    expect(layout.n).toBe(9);
    const inRuns = layout.runs.flatMap(([lo, hi]) => db.prepare(`SELECT report FROM passages WHERE rowid BETWEEN ${lo} AND ${hi}`).all() as Array<{ report: string }>);
    expect(inRuns.every((r) => r.report === "a")).toBe(true);
    expect(inRuns).toHaveLength(9);
  });

  it.skipIf(!sqlite)("forgets the layout when an older reindex rewrites the version row, and scans instead of trusting it", () => {
    const db = open();
    for (const s of insertStatements("a", text("a", 4))) db.exec(s);
    reindex(db, "a", text("a", 4), 1);
    expect(readVersionRow(runner(db), "--local", "a").layout).not.toBeNull();
    // an older checkout's incremental run: appends a row outside the runs, upserts the version without a layout
    for (const s of insertStatements("a", [p("a-extra")])) db.exec(s);
    db.exec(versionStatement("a", "old", 2));
    expect(readVersionRow(runner(db), "--local", "a").layout).toBeNull();
    const next = reindex(db, "a", [...text("a", 4), p("a-extra")], 3);
    expect(next.read.via).toBe("scan");
    expect(next.plan).toMatchObject({ unchanged: 5, added: 0 });
    expect(contents(db, "a")).toHaveLength(5);
  });

  it.skipIf(!sqlite)("a writer racing the reindex leaves no layout trusted, and the next run repairs by scanning", () => {
    const db = open();
    for (const s of insertStatements("a", text("a", 4))) db.exec(s);
    reindex(db, "a", text("a", 4), 1);
    // this run reads (through the layout) and plans a change (a removal: an insert would collide with the
    // racing row's rowid and fail the whole file, which is safe too)...
    const racing = reindex(db, "a", text("a", 3), 2, [], { defer: true });
    // ...an older checkout adds a row and stamps the version meanwhile...
    for (const s of insertStatements("a", [p("a-extra")])) db.exec(s);
    db.exec(versionStatement("a", "old", 5));
    // ...then this run's file lands: its rows go in, but not its layout over a row it did not read
    racing.apply();
    const row = db.prepare("SELECT indexed_at, layout FROM search_index_versions WHERE report = 'a'").get() as { indexed_at: number; layout: string | null };
    expect(row).toEqual({ indexed_at: 5, layout: null });
    const next = reindex(db, "a", text("a", 3), 6);
    expect(next.read.via).toBe("scan");
    expect(next.plan.removed).toBe(1); // a-extra, which a layout without it would have hidden forever
    expect(contents(db, "a")).toEqual(want(text("a", 3)));
    expect(reindex(db, "a", text("a", 3), 7).read.via).toBe("layout");
  });

  it.skipIf(!sqlite)("falls back to the scan when a run holds another report's row or the count is off", () => {
    const db = open();
    for (const s of insertStatements("a", text("a", 3))) db.exec(s);
    for (const s of insertStatements("b", text("b", 2))) db.exec(s);
    const run = runner(db);
    const bad = { runs: [[1, 4]] as Array<[number, number]>, n: 4, at: 1 };
    expect(readStored(run, "--local", "a", bad)).toMatchObject({ via: "scan", runs: [[1, 3]] });
    expect(readStored(run, "--local", "a", { runs: [[1, 3]], n: 5, at: 1 }).via).toBe("scan");
    expect(readStored(run, "--local", "a", { runs: [[1, 3]], n: 3, at: 1 }).via).toBe("layout");
  });
});

describe("D1Error", () => {
  it("recognises the daily quota error", () => {
    expect(new D1Error("D1_ERROR: exceeded free tier daily row write limit: SQLITE_ERROR [code: 7500]").quotaExhausted).toBe(true);
    expect(new D1Error("D1_ERROR: no such table: passages").quotaExhausted).toBe(false);
  });
});

describe("scanAllLayouts", () => {
  it("finds every report's runs in one pass", () => {
    const table = [
      [1, "a"], [2, "a"], [3, "b"], [5, "a"], [6, "c"], [7, "c"], [9, "b"], [10, "b"],
    ] as Array<[number, string]>;
    const run: Runner = (_t, sql) => {
      const command = (sql as { command: string }).command;
      const after = Number(command.match(/rowid > (\d+)/)![1]);
      const limit = Number(command.match(/LIMIT (\d+)/)![1]);
      return [{ results: table.filter(([rid]) => rid > after).slice(0, limit).map(([rid, report]) => ({ rid, report })), meta: {} }];
    };
    const layouts = scanAllLayouts(run, "--local", 3);
    expect(layouts.get("a")).toEqual({ runs: [[1, 2], [5, 5]], n: 3 });
    expect(layouts.get("b")).toEqual({ runs: [[3, 3], [9, 10]], n: 3 });
    expect(layouts.get("c")).toEqual({ runs: [[6, 7]], n: 2 });
  });
});
