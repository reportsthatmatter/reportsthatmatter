/** The per-paragraph dataset (reportsthatmatter-9uog, decisions 0024 and 0029): row counts against the registry, honest licences. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { app } from "../src/index";
import { escapeHtml } from "../src/templates/layout";
import { LICENCE_LABELS, UNCONFIRMED_KINDS } from "../src/lib/dataset-licences";
import { allRows, csvLine, liveReports, officialUrl, reportRows, COLUMNS } from "../scripts/lib/dataset";
import { datasetCard } from "../scripts/lib/dataset-card";

const root = join(import.meta.dirname, "..");
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")).reports as any[];
const live = liveReports(root);

describe("the registry's text status", () => {
  it("every report has a known kind and a statement", () => {
    for (const r of registry) {
      expect(LICENCE_LABELS[r.text_status?.kind], r.id).toBeTruthy();
      expect(r.text_status.statement.length, r.id).toBeGreaterThan(40);
    }
  });

  it("Hillsborough and Lehman are never called public domain or openly licensed (decision 0024, 9kn4, hx7j)", () => {
    const kinds = Object.fromEntries(registry.map((r) => [r.id, r.text_status.kind]));
    expect(kinds["uk-hillsborough-panel"]).toBe("not-open");
    expect(kinds["us-lehman-examiner"]).toBe("not-established");
    for (const kind of UNCONFIRMED_KINDS) expect(LICENCE_LABELS[kind]).not.toMatch(/public domain|open government|open licence(?! we)/i);
    for (const id of ["uk-hillsborough-panel", "us-lehman-examiner"]) {
      const r = registry.find((x) => x.id === id);
      expect(r.license, id).toBeUndefined();
      expect(r.text_status.statement, id).not.toMatch(/is in the public domain|licensed under the Open Government/i);
    }
  });

  it("a report with an unconfirmed status carries no registry licence, and one with a licence is not unconfirmed", () => {
    for (const r of registry) expect(Boolean(r.license) && UNCONFIRMED_KINDS.includes(r.text_status.kind), r.id).toBe(false);
  });
});

describe("the rows", () => {
  const rows = allRows(root);

  it("cover exactly the live reports (the registry minus ingested: false)", () => {
    expect(new Set(rows.map((r) => r.report))).toEqual(new Set(live.map((r) => r.id)));
    expect(live.length).toBe(registry.filter((r) => r.ingested !== false).length);
  });

  it("have, per report, as many rows as the corpus baseline has paragraphs, numbered 1..n with unique ids", () => {
    for (const r of live) {
      const baseline = JSON.parse(readFileSync(join(root, `reports/corpus-baseline/${r.id}.json`), "utf8"));
      const own = rows.filter((x) => x.report === r.id);
      expect(own.length, r.id).toBe(baseline.paragraphs);
      expect(own.map((x) => x.paragraph_number), r.id).toEqual(own.map((_, i) => i + 1));
      expect(new Set(own.map((x) => x.paragraph_id)).size, r.id).toBe(own.length);
    }
  });

  it("fill every column except page, and carry the report's licence", () => {
    for (const row of rows) {
      for (const c of COLUMNS) if (c !== "page") expect(row[c], `${row.report} ${row.paragraph_id} ${c}`).toBeTruthy();
      expect(row.licence).toBe(LICENCE_LABELS[row.licence_status as string]);
      expect(row.text).not.toMatch(/Show full note/);
    }
  });

  it("skips a report marked ingested: false", () => {
    expect(() => reportRows(root, { id: "nope", title: "x", text_status: { kind: "ogl", statement: "x" } })).toThrow(/not pre-rendered/);
  });
});

describe("official urls and CSV", () => {
  it("adds #page= only to a PDF source with an arabic page", () => {
    expect(officialUrl("https://x.org/a.pdf", "12")).toBe("https://x.org/a.pdf#page=12");
    expect(officialUrl("https://x.org/a.pdf?v=2", "12")).toBe("https://x.org/a.pdf?v=2#page=12");
    expect(officialUrl("https://x.org/a.pdf", "xii")).toBe("https://x.org/a.pdf");
    expect(officialUrl("https://x.org/a.pdf", null)).toBe("https://x.org/a.pdf");
    expect(officialUrl("https://x.org/report", "12")).toBe("https://x.org/report");
    expect(officialUrl(undefined, "12")).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    const row: any = Object.fromEntries(COLUMNS.map((c) => [c, "a"]));
    row.text = 'said "no", then\nleft';
    expect(csvLine(row)).toContain('"said ""no"", then\nleft"');
  });
});

describe("/data", () => {
  it("lists every live report with its statement, and the unconfirmed ones first-hand", async () => {
    const html = await (await app.request("http://localhost/data")).text();
    for (const r of live) expect(html, r.id).toContain(escapeHtml(r.text_status!.statement));
    expect(html).toMatch(/Not every report here is under an open licence/);
    const li = (id: string) => html.match(new RegExp(`<li><strong><a href="/reports/${id}">[\\s\\S]*?</li>`))?.[0] ?? "";
    expect(li("uk-hillsborough-panel")).toMatch(/Not under an open licence we can find/);
    expect(li("us-lehman-examiner")).toMatch(/Copyright not established/);
    expect(li("us-lehman-examiner")).not.toMatch(/is in the public domain/);
  });

  it("serves only the listed files", async () => {
    expect((await app.request("http://localhost/data/anything.txt")).status).toBe(404);
    expect((await app.request("http://localhost/data/..%2Fregistry.yaml")).status).toBe(404);
  });

  it("is in the sitemap", async () => {
    expect(await (await app.request("http://localhost/sitemap.xml")).text()).toContain("/data</loc>");
  });
});

describe("the Hugging Face card", () => {
  const summaries = live.map((r) => ({ id: r.id, title: r.title, rows: 10, kind: r.text_status!.kind, statement: r.text_status!.statement, sourceUrl: r.source_url ?? "" }));
  const card = datasetCard(summaries, "2026-11-20");

  it("has the YAML header and says plainly what is not open", () => {
    expect(card).toMatch(/^---\nlicense: other\n/);
    expect(card).toMatch(/size_categories:\n  - /);
    expect(card).toMatch(/Not everything here is under an open licence/);
    expect(card).toContain("copyright not established");
    expect(card).toContain("not under an open licence we can find");
    expect(card).toContain("@misc{reportsthatmatter_paragraphs_2026");
    expect(card).toContain("https://reportsthatmatter.org");
  });

  it("names the reports left out of the upload, and does not list them as included", () => {
    const unsettled = summaries.filter((s) => UNCONFIRMED_KINDS.includes(s.kind));
    const settled = summaries.filter((s) => !UNCONFIRMED_KINDS.includes(s.kind));
    const upload = datasetCard(settled, "2026-11-20", unsettled);
    expect(unsettled.length).toBeGreaterThan(0);
    expect(upload).toMatch(/Not in this upload/);
    expect(upload).not.toMatch(/Not everything here is under an open licence/);
    for (const r of unsettled) expect(upload).not.toContain(`(\`${r.id}\`)`);
  });
});
