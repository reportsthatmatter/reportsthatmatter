/**
 * The public highlights feed's write side (reportsthatmatter-bght.10.1): a mark becomes a public_marks row only
 * when its words are in the published report, and every stored field comes from the report. Real SQL
 * (tests/support/sqlite-d1.ts, the repo's own migrations) and the real pre-rendered fragments in assets/generated.
 * Lettered as in the bead's acceptance list.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { decodeAnchor, encodeAnchor, selectorFor } from "../assets/anchor.js";
import { contentFor } from "../src/lib/content";
import { publishMark, verifyMark, fragmentTitle } from "../src/lib/feed";
import { AFFECTED_COMMUNITY_REPORTS, PER_ACTOR_REPORT_CAP } from "../src/lib/feed-policy";
import { parseMarkPayload, recordMarkCounted, type MarkEvent } from "../src/lib/marks";
import { extractParagraph } from "../src/templates/report";
import { createSqliteD1 } from "./support/sqlite-d1";

const REPORT = "jack-smith-vol1";
const SECTION = "the-law";
const fragment = readFileSync(`assets/generated/reports/${REPORT}/fragments/${SECTION}.html`, "utf8");
const PARAGRAPH = [...fragment.matchAll(/<p id="([^"]+)" data-page="(\d+)"/g)][0][1];
const PAGE = Number([...fragment.matchAll(/<p id="([^"]+)" data-page="(\d+)"/g)][0][2]);
const TEXT = extractParagraph(fragment, PARAGRAPH)!;
// Six words from inside the paragraph, with the page's own context either side.
const START = TEXT.indexOf(" ", 30) + 1;
const END = nthSpace(TEXT, START, 6);
const SELECTOR = selectorFor(TEXT, START, END);
const WORDS = TEXT.slice(START, END);

function nthSpace(text: string, from: number, n: number): number {
  let at = from;
  for (let i = 0; i < n; i++) at = text.indexOf(" ", at + 1);
  return at;
}

const event = (over: Partial<MarkEvent> = {}): MarkEvent => ({
  report: REPORT,
  section: SECTION,
  paragraph: PARAGRAPH,
  exact: SELECTOR.exact,
  prefix: SELECTOR.prefix,
  suffix: SELECTOR.suffix,
  page: PAGE,
  kind: "save",
  ...over,
});

const READER = "a".repeat(64);
const NOW = Date.UTC(2026, 9, 16, 12, 0);

/** Record a mark the way POST /api/mark does, then publish it. */
async function mark(db: ReturnType<typeof createSqliteD1>, e: MarkEvent, actor = READER, now = NOW, env = {}) {
  const { before } = await recordMarkCounted(db, e, actor, now);
  return publishMark(env, db, e, actor, before, now);
}

const published = (db: ReturnType<typeof createSqliteD1>) => db.rows("SELECT * FROM public_marks ORDER BY id");

describe("publishMark", () => {
  it("stores the report's own words, anchor, page and section title for a real mark", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event())).toBe("published");
    const [row] = published(db);
    expect(row).toMatchObject({
      report: REPORT,
      paragraph: PARAGRAPH,
      slug: SECTION,
      section_title: "THE LAW",
      words: WORDS,
      anchor: encodeAnchor(SELECTOR),
      page: PAGE,
      created_at: NOW,
      status: "visible",
      reason: "",
    });
  });

  it("(a) words that are not in the paragraph give no row", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event({ exact: "Visit our sponsor at example dot com for cheap pills", prefix: "", suffix: "" }))).toBe("unverified");
    expect(published(db)).toEqual([]);
    // ...and the marks row is still there: the feed never costs a mark.
    expect(db.rows("SELECT COUNT(*) AS n FROM marks")[0].n).toBe(1);
  });

  it("(a) a paragraph id the report does not have gives no row", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event({ paragraph: "made-up-paragraph-id", section: "" }))).toBe("unverified");
    expect(published(db)).toEqual([]);
  });

  it("(a) a real paragraph id with the next attribute appended is refused, not stored verbatim", async () => {
    // `<p id="X" data-page="33"` contains `<p id="X" data-page="33`, so a substring check alone would accept it.
    const db = createSqliteD1();
    const forged = `${PARAGRAPH}" data-page="${PAGE}`;
    expect(fragment.includes(`<p id="${forged}"`)).toBe(true);
    expect(await mark(db, event({ paragraph: forged }))).toBe("unverified");
    expect(published(db)).toEqual([]);
  });

  it("(b) forged prefix, suffix and page are replaced by the report's own", async () => {
    const db = createSqliteD1();
    const forged = { prefix: "<script>alert(1)</script> ", suffix: " FORGED-SUFFIX", page: 9999 };
    expect(await mark(db, event(forged))).toBe("published");
    const [row] = published(db);
    expect(row.page).toBe(PAGE);
    expect(row.anchor).toBe(encodeAnchor(SELECTOR));
    const stored = JSON.stringify(row);
    expect(stored).not.toContain("script");
    expect(stored).not.toContain("FORGED");
    expect(stored).not.toContain("9999");
    expect(decodeAnchor(String(row.anchor))).toEqual(SELECTOR);
  });

  it("(c) a passage named by its ends (head⋯tail) stores the whole located slice", async () => {
    const db = createSqliteD1();
    const long = TEXT.slice(0, Math.min(TEXT.length, 400));
    const gap = `${long.slice(0, 40)}⋯${long.slice(-40)}`;
    expect(await mark(db, event({ exact: gap, prefix: "", suffix: "" }))).toBe("published");
    const [row] = published(db);
    expect(row.words).toBe(long);
    expect(String(row.words)).not.toContain("⋯");
  });

  it("(d) a mark from /full (section \"\") is verified through the report's meta", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event({ section: "" }))).toBe("published");
    expect(published(db)[0]).toMatchObject({ slug: SECTION, paragraph: PARAGRAPH, words: WORDS });
  });

  it("(d) a mark made under a moved paragraph id is stored under the id that holds the text now", async () => {
    const meta = JSON.parse(readFileSync(`assets/generated/reports/${REPORT}/meta.json`, "utf8"));
    const [oldId, newId] = Object.entries(meta.paragraphAliases as Record<string, string>).find(
      ([, to]) => meta.paragraphToSection[to]
    )!;
    const slug = meta.paragraphToSection[newId];
    const html = readFileSync(`assets/generated/reports/${REPORT}/fragments/${slug}.html`, "utf8");
    const text = extractParagraph(html, newId)!;
    const words = text.split(" ").slice(0, 8).join(" ");
    const db = createSqliteD1();
    expect(await mark(db, event({ paragraph: oldId, section: SECTION, exact: words, prefix: "", suffix: "" }))).toBe("published");
    expect(published(db)[0]).toMatchObject({ paragraph: newId, slug });
  });

  it("(e) the editor's actor, an excluded report and FEED_ENABLED=false give no row", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event(), "editorial:rufus-pollock")).toBe("editor");
    expect(await mark(db, event({ report: AFFECTED_COMMUNITY_REPORTS[0] }))).toBe("excluded");
    expect(await mark(db, event(), READER, NOW, { FEED_EXCLUDE: `other, ${REPORT}` })).toBe("excluded");
    expect(await mark(db, event(), "b".repeat(64), NOW, { FEED_ENABLED: "false" })).toBe("off");
    expect(published(db)).toEqual([]);
  });

  it("(e) every affected-community report is held out", async () => {
    const db = createSqliteD1();
    for (const report of AFFECTED_COMMUNITY_REPORTS) {
      expect(await publishMark({}, db, event({ report }), READER, 0, NOW)).toBe("excluded");
    }
  });

  it("(e) a report that is not in the registry gives no row and reads no content", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event({ report: "../../etc" }))).toBe("unknown-report");
  });

  it("(f) a selection under 4 words or 20 characters gives no row", async () => {
    const db = createSqliteD1();
    const three = TEXT.slice(START, nthSpace(TEXT, START, 3));
    expect(await mark(db, event({ exact: three, prefix: "", suffix: "" }))).toBe("short");
    expect(published(db)).toEqual([]);
  });

  it("(f) a blocklisted word holds the passage instead of showing it", async () => {
    const { verdictFor } = await import("../src/lib/feed-policy");
    expect(verdictFor("the inquiry heard a witness called a wog in the canteen", 0)).toEqual({ status: "held", reason: "blocklist" });
    expect(verdictFor("the inquiry heard evidence from the canteen staff", 0)).toEqual({ status: "visible", reason: "" });
  });

  it("(g) the same reader marking the same words twice in a day gives one row", async () => {
    const db = createSqliteD1();
    expect(await mark(db, event({ kind: "save" }), READER, NOW)).toBe("published");
    expect(await mark(db, event({ kind: "share" }), READER, NOW + 1000)).toBe("duplicate");
    expect(await mark(db, event(), "b".repeat(64), NOW + 2000)).toBe("published");
    expect(published(db)).toHaveLength(2);
    expect(db.rows("SELECT COUNT(*) AS n FROM marks")[0].n).toBe(3);
  });

  it(`(g) a reader's mark after ${PER_ACTOR_REPORT_CAP} in one report today is held, not shown`, async () => {
    const db = createSqliteD1();
    const words = TEXT.split(" ");
    const outcomes = [];
    for (let i = 0; i <= PER_ACTOR_REPORT_CAP; i++) {
      outcomes.push(await mark(db, event({ exact: words.slice(i, i + 6).join(" "), prefix: "", suffix: "" }), READER, NOW + i));
    }
    expect(outcomes).toEqual([...Array(PER_ACTOR_REPORT_CAP).fill("published"), "held"]);
    expect(published(db).at(-1)).toMatchObject({ status: "held", reason: "cap" });
  });

  it("(h) with no public_marks table the mark is still recorded and /api/mark answers 204", async () => {
    const db = createSqliteD1({ only: (file) => !file.includes("public_marks") });
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify(event()), headers: { "content-type": "application/json" } },
      { DB: db }
    );
    expect(res.status).toBe(204);
    expect(db.rows("SELECT COUNT(*) AS n FROM marks")[0].n).toBe(1);
    expect(() => db.rows("SELECT * FROM public_marks")).toThrow(/no such table/);
  });

  it("is wired into POST /api/mark", async () => {
    const db = createSqliteD1();
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify(event()), headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.9.9" } },
      { DB: db }
    );
    expect(res.status).toBe(204);
    expect(published(db)).toHaveLength(1);
  });

  it("finishes after the response when the runtime gives it a waitUntil", async () => {
    const db = createSqliteD1();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify(event()), headers: { "content-type": "application/json" } },
      { DB: db },
      ctx as any
    );
    expect(res.status).toBe(204);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(published(db)).toHaveLength(1);
  });
});

describe("verifyMark", () => {
  it("reads one fragment and no meta on the common path", async () => {
    const content = await contentFor(undefined, REPORT);
    const read: string[] = [];
    const counting = { version: content.version, text: (path: string) => (read.push(path), content.text(path)) };
    expect(await verifyMark(counting, event())).not.toBeNull();
    expect(read).toEqual([`fragments/${SECTION}.html`]);
  });

  it("never reads outside the report for a slug that is not a slug", async () => {
    const content = await contentFor(undefined, REPORT);
    const read: string[] = [];
    const counting = { version: content.version, text: (path: string) => (read.push(path), content.text(path)) };
    await verifyMark(counting, event({ section: "../../../package.json" }));
    expect(read.every((path) => !path.includes(".."))).toBe(true);
  });
});

describe("fragmentTitle", () => {
  it("is the fragment's first heading as text", () => {
    expect(fragmentTitle('<h2 id="x">Part <em>One</em> &amp; Two</h2><p>…</p>')).toBe("Part One & Two");
    expect(fragmentTitle("<p>no heading</p>")).toBeNull();
  });
});

describe("parseMarkPayload length caps", () => {
  const valid = { report: REPORT, section: SECTION, paragraph: PARAGRAPH, exact: "words", kind: "save" };

  it("refuses a selection over 1,000 characters and context over 64", () => {
    expect(parseMarkPayload({ ...valid, exact: "x".repeat(1000) })).not.toBeNull();
    expect(parseMarkPayload({ ...valid, exact: "x".repeat(1001) })).toBeNull();
    expect(parseMarkPayload({ ...valid, prefix: "x".repeat(65) })).toBeNull();
    expect(parseMarkPayload({ ...valid, suffix: "x".repeat(65) })).toBeNull();
    expect(parseMarkPayload({ ...valid, paragraph: "x".repeat(201) })).toBeNull();
  });

  it("makes /api/mark answer 400 without touching the database", async () => {
    const db = createSqliteD1();
    const res = await app.request(
      "http://localhost/api/mark",
      { method: "POST", body: JSON.stringify({ ...valid, exact: "x".repeat(1001) }), headers: { "content-type": "application/json" } },
      { DB: db }
    );
    expect(res.status).toBe(400);
    expect(db.statements).toEqual([]);
  });
});
