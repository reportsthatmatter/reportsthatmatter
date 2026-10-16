/**
 * /highlights for everyone (reportsthatmatter-bght.10.3): Recently highlighted from public_marks, Editor's picks
 * below, never empty, every field escaped, nothing a client sent printed. Real SQL (tests/support/sqlite-d1.ts).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { coarseTime, feedPassages, FEED_LIMIT, FEED_PER_REPORT, type PublicMarkRow } from "../src/lib/feed";
import { EDITOR_PICKS } from "../src/generated/picks";
import { AFFECTED_COMMUNITY_REPORTS } from "../src/lib/feed-policy";
import { selectorFor } from "../assets/anchor.js";
import { extractParagraph } from "../src/templates/report";
import { createSqliteD1 } from "./support/sqlite-d1";

const MIN = 60_000;
const HOUR = 60 * MIN;

type Row = Partial<PublicMarkRow> & { words: string };
function insert(db: ReturnType<typeof createSqliteD1>, row: Row) {
  db.db
    .prepare(
      `INSERT INTO public_marks (report, paragraph, slug, section_title, words, anchor, page, created_at, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
    )
    .run(
      row.report ?? "uk-leveson-inquiry",
      row.paragraph ?? "some-paragraph",
      row.slug ?? "part-a",
      row.section_title ?? "Part A",
      row.words,
      row.anchor ?? "|words|",
      row.page ?? 12,
      row.created_at ?? Date.now() - 2 * HOUR,
      row.status ?? "visible"
    );
}

async function page(env: Record<string, unknown> = {}) {
  const res = await app.request("http://localhost/highlights", {}, env);
  return { status: res.status, html: await res.text() };
}

const recent = (html: string) => html.split('id="recent-heading"')[1]?.split('id="picks-heading"')[0] ?? "";

describe("GET /highlights", () => {
  it("with no database shows the Editor's picks and returns 200", async () => {
    const { status, html } = await page();
    expect(status).toBe(200);
    expect(html).toContain("Editor’s picks");
    expect(EDITOR_PICKS.length).toBeGreaterThan(0);
    expect(html).toContain("What readers are highlighting");
  });

  it("(b) with no public_marks table shows the picks and returns 200", async () => {
    const DB = createSqliteD1({ only: (file) => !file.includes("public_marks") });
    const { status, html } = await page({ DB });
    expect(status).toBe(200);
    expect(html).toContain("Editor’s picks");
    expect(html).not.toContain("Recently highlighted");
  });

  it("with an empty feed says what will appear, then the picks", async () => {
    const { html } = await page({ DB: createSqliteD1() });
    expect(html).toContain("Recently highlighted");
    expect(html).toContain("appear here about half an hour later");
    expect(html.indexOf("Recently highlighted")).toBeLessThan(html.indexOf("Editor’s picks"));
  });

  it("shows a reader's passage with its report, section, page, coarse time and a link to the words", async () => {
    const DB = createSqliteD1();
    insert(DB, { words: "The Inquiry has found that the culture was reckless", anchor: "of%20a%20|The%20Inquiry|%20has", paragraph: "p-one", created_at: Math.floor(Date.now() / HOUR) * HOUR - 3 * HOUR }); // on the hour: "3 hours ago" whatever the minute
    const { html } = await page({ DB });
    const block = recent(html);
    expect(block).toContain("The Inquiry has found that the culture was reckless");
    expect(block).toContain("Leveson Report · Part A · p. 12");
    expect(block).toContain("3 hours ago");
    expect(block).toMatch(/<time datetime="\d{4}-\d\d-\d\dT\d\d:00:00\.000Z">/);
    expect(block).toContain('href="/reports/uk-leveson-inquiry?p=p-one&amp;h=of%20a%20|The%20Inquiry|%20has"');
    expect(block).not.toContain("highlighted 1 time");
  });

  it("counts a passage marked on two reader-days, and prints a count only from 2", async () => {
    const DB = createSqliteD1();
    insert(DB, { words: "a passage that two readers both chose to keep", created_at: Date.now() - 5 * HOUR });
    insert(DB, { words: "a passage that two readers both chose to keep", created_at: Date.now() - 2 * HOUR });
    const { html } = await page({ DB });
    expect(recent(html)).toContain("highlighted 2 times");
    expect(recent(html).match(/a passage that two readers/g)).toHaveLength(1);
  });

  it("(a) never shows a hidden or held row, one inside the delay, or one older than 30 days", async () => {
    const DB = createSqliteD1();
    insert(DB, { words: "HIDDEN words that a moderator removed from view", status: "hidden" });
    insert(DB, { words: "HELD words over the per-reader cap for the day", status: "held" });
    insert(DB, { words: "TOO-NEW words marked ten minutes ago by someone", created_at: Date.now() - 10 * MIN, paragraph: "p2" });
    insert(DB, { words: "TOO-OLD words marked forty days ago by someone", created_at: Date.now() - 40 * 24 * HOUR, paragraph: "p3" });
    const { html } = await page({ DB });
    for (const word of ["HIDDEN", "HELD", "TOO-NEW", "TOO-OLD"]) expect(html).not.toContain(word);
  });

  it("leaves out held-out reports, including ones added to FEED_EXCLUDE after their rows were written", async () => {
    const DB = createSqliteD1();
    insert(DB, { words: "AFFECTED words from an affected-community report", report: AFFECTED_COMMUNITY_REPORTS[0] });
    insert(DB, { words: "EXCLUDED words from a report excluded by variable", report: "us-jan6-committee", paragraph: "j" });
    const { html } = await page({ DB, FEED_EXCLUDE: "us-jan6-committee" });
    expect(html).not.toContain("AFFECTED");
    expect(html).not.toContain("EXCLUDED");
    for (const report of AFFECTED_COMMUNITY_REPORTS) expect(html).not.toContain(`/reports/${report}?`);
  });

  it("escapes every stored field: words with markup characters render as text", async () => {
    const DB = createSqliteD1();
    insert(DB, {
      words: 'Section 5 <script>alert("x")</script> & "quoted" words here',
      section_title: "Part <b>B</b> & C",
      paragraph: 'x" onmouseover="alert(1)',
    });
    const { html } = await page({ DB });
    const block = recent(html);
    expect(block).not.toContain("<script>alert");
    expect(block).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;quoted&quot;");
    expect(block).toContain("Part &lt;b&gt;B&lt;/b&gt; &amp; C");
    expect(block).not.toContain('onmouseover="');
  });

  it("(c) a mark's forged prefix, suffix and page never reach the page", async () => {
    const DB = createSqliteD1();
    const fragment = readFileSync("assets/generated/reports/jack-smith-vol1/fragments/the-law.html", "utf8");
    const [, paragraph, printed] = fragment.match(/<p id="([^"]+)" data-page="(\d+)"/)!;
    const text = extractParagraph(fragment, paragraph)!;
    const start = text.indexOf(" ", 30) + 1;
    let end = start;
    for (let i = 0; i < 6; i++) end = text.indexOf(" ", end + 1);
    const selector = selectorFor(text, start, end);
    const res = await app.request(
      "http://localhost/api/mark",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report: "jack-smith-vol1", section: "the-law", paragraph, exact: selector.exact, prefix: "FORGEDPREFIX ", suffix: " FORGEDSUFFIX", page: 4242, kind: "share" }),
      },
      { DB }
    );
    expect(res.status).toBe(204);
    const { html } = await page({ DB, FEED_DELAY_MINUTES: "0" });
    const block = recent(html);
    expect(block).toContain(selector.exact.replace(/"/g, "&quot;"));
    expect(block).toContain(`p. ${printed}`);
    expect(html).not.toContain("FORGED");
    expect(html).not.toContain("4242");
  });

  it("with FEED_ENABLED=false shows only the picks", async () => {
    const DB = createSqliteD1();
    insert(DB, { words: "VISIBLE words that would otherwise be in the feed" });
    const { status, html } = await page({ DB, FEED_ENABLED: "false" });
    expect(status).toBe(200);
    expect(html).not.toContain("VISIBLE");
    expect(html).not.toContain("Recently highlighted");
    expect(html).toContain("Editor’s picks");
  });

  it("labels the Editor's picks as the editor's, with no time and no count", async () => {
    const { html } = await page();
    const picks = html.split('id="picks-heading"')[1];
    expect(picks).toContain("Editor’s pick");
    expect(picks).not.toContain("<time");
    expect(picks).not.toMatch(/highlighted \d+ times/);
    for (const report of AFFECTED_COMMUNITY_REPORTS) expect(picks).not.toContain(`/reports/${report}?`);
  });

  it("has the tab row, landmarks and headings, and no polling or live region", async () => {
    const { html } = await page({ DB: createSqliteD1() });
    expect(html).toContain('<nav class="highlights-tabs mono" aria-label="Highlights"><span aria-current="page">Readers</span><a href="/highlights/yours">Yours</a></nav>');
    expect(html.match(/<main>/g)).toHaveLength(1);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<section class="highlights-block" aria-labelledby="recent-heading">');
    expect(html).not.toContain("aria-live");
    expect(html).toContain('<link rel="canonical" href="https://reportsthatmatter.org/highlights" />');
  });

  it("reads one bounded statement from D1 and nothing else", async () => {
    const DB = createSqliteD1();
    await page({ DB });
    expect(DB.statements).toHaveLength(1);
    expect(DB.statements[0]).toMatch(/FROM public_marks ORDER BY id DESC LIMIT \?/);
  });
});

describe("GET /highlights/yours", () => {
  it("is the reader's own list, kept out of search results", async () => {
    const res = await app.request("http://localhost/highlights/yours");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('id="highlights"');
    expect(html).toContain("/assets/highlights-page.js");
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toContain('<span aria-current="page">Yours</span>');
  });
});

describe("feedPassages", () => {
  const now = Date.UTC(2026, 9, 16, 12, 0);
  let id = 0;
  const row = (over: Partial<PublicMarkRow>): PublicMarkRow => ({
    id: ++id,
    report: "uk-leveson-inquiry",
    paragraph: `p${id}`,
    slug: "s",
    section_title: "S",
    words: `words ${id}`,
    anchor: "",
    page: null,
    created_at: now - 2 * HOUR,
    status: "visible",
    ...over,
  });

  it("keeps one passage per paragraph, the most recent", () => {
    const out = feedPassages([row({ paragraph: "same", words: "older", created_at: now - 5 * HOUR }), row({ paragraph: "same", words: "newer" })], {}, now);
    expect(out.map((p) => p.words)).toEqual(["newer"]);
  });

  it(`shows at most ${FEED_PER_REPORT} passages from one report and ${FEED_LIMIT} in all`, () => {
    const rows = [
      ...Array.from({ length: 10 }, () => row({ report: "uk-leveson-inquiry" })),
      ...["us-jan6-committee", "us-mueller-report", "uk-chilcot-inquiry", "us-lehman-examiner", "litvinenko-inquiry", "jack-smith-vol1"].flatMap((report) =>
        Array.from({ length: 5 }, () => row({ report }))
      ),
    ];
    const out = feedPassages(rows, {}, now);
    expect(out).toHaveLength(FEED_LIMIT);
    expect(out.filter((p) => p.report === "uk-leveson-inquiry")).toHaveLength(FEED_PER_REPORT);
  });

  it("rounds the time down to the hour", () => {
    const [p] = feedPassages([row({ created_at: Date.UTC(2026, 9, 16, 9, 47) })], {}, now);
    expect(p.lastSeenHour).toBe(Date.UTC(2026, 9, 16, 9, 0));
  });
});

describe("coarseTime", () => {
  const now = Date.UTC(2026, 9, 16, 12, 30);
  it.each([
    [Date.UTC(2026, 9, 16, 12), "within the hour"],
    [Date.UTC(2026, 9, 16, 11), "an hour ago"],
    [Date.UTC(2026, 9, 16, 9), "3 hours ago"],
    [Date.UTC(2026, 9, 15, 9), "yesterday"],
    [Date.UTC(2026, 9, 12, 9), "4 days ago"],
    [Date.UTC(2026, 9, 2, 9), "2 Oct"],
  ])("%s", (hour, words) => {
    expect(coarseTime(hour, now)).toBe(words);
  });
});
