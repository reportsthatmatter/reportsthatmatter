/**
 * `pnpm feed` (reportsthatmatter-bght.10.5): naming passages to hide, the SQL for hide/show and the kill switch
 * (run against real SQLite), and rebuilding public_marks from marks with the same policy as publishMark.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { encodeAnchor, selectorFor } from "../assets/anchor.js";
import { contentFor } from "../src/lib/content";
import { parseTarget, planRebuild, rebuildSql, statusSql, type StoredMark } from "../src/lib/feed-admin";
import { publishMark } from "../src/lib/feed";
import { recordMarkCounted } from "../src/lib/marks";
import { extractParagraph } from "../src/templates/report";
import { createSqliteD1 } from "./support/sqlite-d1";

const ANCHOR = "of%20a%20|The%20Inquiry%2C%20it|%20has";

describe("parseTarget", () => {
  it("reads a row id", () => {
    expect(parseTarget("42")).toEqual({ kind: "id", id: 42 });
  });

  it("reads a Read in place link as /highlights prints it, with or without the origin", () => {
    const expected = { kind: "passage", report: "uk-leveson-inquiry", paragraph: "p-one", anchor: ANCHOR };
    expect(parseTarget(`/reports/uk-leveson-inquiry?p=p-one&h=${ANCHOR}`)).toEqual(expected);
    expect(parseTarget(`https://reportsthatmatter.org/reports/uk-leveson-inquiry?p=p-one&h=${ANCHOR}`)).toEqual(expected);
  });

  it("reads the link the report route redirects to (a section slug, the anchor encoded again, a fragment)", () => {
    const link = `https://reportsthatmatter.org/reports/uk-leveson-inquiry/part-a?p=p-one&h=${encodeURIComponent(ANCHOR)}#p-one`;
    expect(parseTarget(link)).toEqual({ kind: "passage", report: "uk-leveson-inquiry", paragraph: "p-one", anchor: ANCHOR });
  });

  it("reads a paragraph link with no words as the whole paragraph", () => {
    expect(parseTarget("/reports/uk-leveson-inquiry?p=p-one")).toEqual({ kind: "passage", report: "uk-leveson-inquiry", paragraph: "p-one", anchor: null });
  });

  it("refuses what it cannot read", () => {
    for (const bad of ["", "abc", "/reports/x", "/reports/UPPER?p=x", "/reports/r?p=x&h=%E0%A4%A"]) expect(parseTarget(bad)).toBeNull();
  });
});

describe("hide and show", () => {
  function seeded() {
    const db = createSqliteD1();
    const add = (report: string, paragraph: string, anchor: string, status = "visible", reason = "") =>
      db.db
        .prepare("INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason) VALUES (?, ?, 's', 'S', 'w', ?, NULL, 1, ?, ?)")
        .run(report, paragraph, anchor, status, reason);
    add("uk-leveson-inquiry", "p-one", ANCHOR);
    add("uk-leveson-inquiry", "p-one", ANCHOR);
    add("uk-leveson-inquiry", "p-one", "other|words|");
    add("us-jan6-committee", "j", "x|y|z");
    add("us-jan6-committee", "k", "x|y|z", "held", "cap");
    return db;
  }
  const statuses = (db: ReturnType<typeof createSqliteD1>) =>
    db.rows("SELECT status || CASE reason WHEN '' THEN '' ELSE '/' || reason END AS s FROM public_marks ORDER BY id").map((r) => r.s);

  it("hides every row of the passage a link names, and nothing else", () => {
    const db = seeded();
    db.db.exec(statusSql(parseTarget(`/reports/uk-leveson-inquiry?p=p-one&h=${ANCHOR}`)!, "hide"));
    expect(statuses(db)).toEqual(["hidden/manual", "hidden/manual", "visible", "visible", "held/cap"]);
  });

  it("show undoes a manual hide but leaves held rows held", () => {
    const db = seeded();
    db.db.exec(statusSql({ kind: "report", report: "us-jan6-committee" }, "hide"));
    expect(statuses(db).slice(3)).toEqual(["hidden/manual", "held/cap"]);
    db.db.exec(statusSql({ kind: "report", report: "us-jan6-committee" }, "show"));
    expect(statuses(db).slice(3)).toEqual(["visible", "held/cap"]);
  });

  it("hide --all is one statement that hides every visible row", () => {
    const db = seeded();
    const sql = statusSql({ kind: "all" }, "hide");
    expect(sql.split(";").filter((s) => s.trim())).toHaveLength(1);
    db.db.exec(sql);
    expect(statuses(db)).toEqual(["hidden/manual", "hidden/manual", "hidden/manual", "hidden/manual", "held/cap"]);
  });

  it("quotes what it is given", () => {
    const sql = statusSql({ kind: "passage", report: "r", paragraph: "it's", anchor: null }, "hide");
    expect(sql).toContain("paragraph = 'it''s'");
  });
});

describe("planRebuild", () => {
  const REPORT = "jack-smith-vol1";
  const fragment = readFileSync(`assets/generated/reports/${REPORT}/fragments/the-law.html`, "utf8");
  const PARAGRAPH = fragment.match(/<p id="([^"]+)"/)![1];
  const TEXT = extractParagraph(fragment, PARAGRAPH)!;
  const words = (from: number, n: number) => TEXT.split(" ").slice(from, from + n).join(" ");
  const DAY = Date.UTC(2026, 9, 16, 9);
  let id = 0;
  const mark = (over: Partial<StoredMark>): StoredMark => ({
    id: ++id, report: REPORT, section: "the-law", paragraph: PARAGRAPH, exact: words(2, 6), prefix: "", suffix: "",
    page: null, kind: "save", actor: "a".repeat(64), created_at: DAY + id * 1000, ...over,
  });
  const options = { env: {}, knownReports: new Set([REPORT, "challenger-accident"]), contentOf: (r: string) => contentFor(undefined, r) };

  it("writes what publishMark writes, mark for mark", async () => {
    const marks = [
      mark({}),
      mark({ kind: "share" }), // the same reader and words the same day: one row
      mark({ actor: "b".repeat(64) }),
      mark({ exact: "words that are not in the report at all, honestly" }),
      mark({ report: "challenger-accident" }),
      mark({ actor: "editorial:rufus-pollock" }),
      ...Array.from({ length: 6 }, (_, i) => mark({ actor: "c".repeat(64), exact: words(i, 6) })),
    ];
    const live = createSqliteD1();
    for (const m of marks) {
      const { before } = await recordMarkCounted(live, m, m.actor, m.created_at);
      await publishMark({}, live, m, m.actor, before, m.created_at, options.knownReports);
    }
    const expected = live.rows("SELECT report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason FROM public_marks ORDER BY id");

    const { rows, skipped } = await planRebuild(marks, options);
    expect(rows).toEqual(expected);
    expect(skipped).toEqual({ duplicate: 1, unverified: 1, excluded: 1, editor: 1 });
    expect(rows.at(-1)).toMatchObject({ status: "held", reason: "cap" });
  });

  it("keeps a manual hide across a rebuild", async () => {
    const m = mark({});
    const { rows } = await planRebuild([m], { ...options, hidden: [{ report: REPORT, paragraph: PARAGRAPH, words: m.exact }] });
    expect(rows[0]).toMatchObject({ status: "hidden", reason: "manual" });
  });

  it("produces SQL that rewrites the table", async () => {
    const db = createSqliteD1();
    db.db.exec("INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, created_at) VALUES ('old','p','s','t','w','a',1)");
    const { rows } = await planRebuild([mark({ exact: words(1, 7) })], options);
    db.db.exec(rebuildSql(rows));
    const after = db.rows("SELECT report, words, anchor FROM public_marks");
    expect(after).toEqual([{ report: REPORT, words: words(1, 7), anchor: rows[0].anchor }]);
    const start = TEXT.indexOf(words(1, 7));
    expect(rows[0].anchor).toBe(encodeAnchor(selectorFor(TEXT, start, start + words(1, 7).length)));
  });
});

describe("pnpm feed --remote without --yes (jp6i)", () => {
  // The real script, with a fake `pnpm` first on PATH that records any call: wrangler is reached only through it.
  const { mkdtempSync, writeFileSync: write, chmodSync, existsSync } = require("node:fs") as typeof import("node:fs");
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const { join } = require("node:path") as typeof import("node:path");
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const tsx = join(process.cwd(), "node_modules/.bin/tsx");

  const commands = [
    ["status"],
    ["list", "--held"],
    ["hide", "42"],
    ["show", "42"],
    ["hide", "--report", "uk-leveson-inquiry"],
    ["hide", "--all"],
    ["rebuild"],
    ["rebuild", "--dry-run"],
  ];

  for (const command of commands) {
    it(`${command.join(" ")} --remote exits before any remote call`, () => {
      const bin = mkdtempSync(join(tmpdir(), "feed-gate-"));
      const called = join(bin, "called");
      write(join(bin, "pnpm"), `#!/bin/sh\necho "$@" >> "${called}"\nexit 1\n`);
      chmodSync(join(bin, "pnpm"), 0o755);
      const result = spawnSync(tsx, ["scripts/feed.mjs", ...command, "--remote"], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/--yes/);
      expect(existsSync(called)).toBe(false);
    }, 20_000);
  }
});
