/**
 * The per-paragraph dataset (reportsthatmatter-9uog, decision 0029): one row per citable paragraph across every live
 * report, built from the pre-rendered section fragments, which are what the reader's page and the search index carry.
 *
 * "Live" is the registry minus `ingested: false`. A row is a citable unit as `pnpm corpus` counts it (a paragraph or a
 * top-level list with an id and some text), so a report's row count equals its `reports/corpus-baseline/<id>.json`
 * `paragraphs`; tests/dataset.test.ts checks that.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { extractPassages } from "@rtm/ingest";
import { LICENCE_LABELS } from "../../src/lib/dataset-licences";

export const SITE = "https://reportsthatmatter.org";

export const COLUMNS = [
  "report",
  "report_title",
  "section",
  "section_slug",
  "paragraph_number",
  "page",
  "paragraph_id",
  "text",
  "official_pdf_url",
  "site_url",
  "licence",
  "licence_status",
] as const;

export type Row = Record<(typeof COLUMNS)[number], string | number | null>;

type RegistryReport = {
  id: string;
  title: string;
  source_url?: string;
  ingested?: boolean;
  text_status?: { kind: string; statement: string };
  license?: { name: string; url: string };
};

export function liveReports(root: string): RegistryReport[] {
  const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")) as { reports: RegistryReport[] };
  return registry.reports.filter((r) => r.ingested !== false);
}

/**
 * The official document's URL for a paragraph. The `#page=` fragment is added only where the source is a PDF file and
 * the page is an arabic number. It is the PRINTED page label, which is not always the PDF's own page index (the 9/11
 * report's printed page is the PDF's minus 17; decision 0001, b78.10), so a viewer may open a few pages off. A source
 * that is a web page, not a PDF, is returned as it is.
 */
export function officialUrl(sourceUrl: string | undefined, page: string | null): string {
  if (!sourceUrl) return "";
  const isPdf = /\.pdf$/i.test(sourceUrl.split(/[?#]/)[0]);
  return isPdf && page && /^\d+$/.test(page) ? `${sourceUrl.split("#")[0]}#page=${page}` : sourceUrl;
}

/** What a paragraph's text looks like: the long (collapsed) sidenotes go too, which the shared cleaner leaves in. */
const stripLongNotes = (html: string) => html.replace(/<span class="sidenote long">[\s\S]*?<\/span>/g, "");

export function reportRows(root: string, report: RegistryReport): Row[] {
  const dir = join(root, "assets/generated/reports", report.id);
  if (!existsSync(join(dir, "meta.json"))) throw new Error(`${report.id}: not pre-rendered; run pnpm prerender`);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as {
    sections: Array<{ slug: string; title: string }>;
  };
  const kind = report.text_status?.kind;
  if (!kind || !LICENCE_LABELS[kind]) throw new Error(`${report.id}: registry text_status.kind missing or unknown`);

  const rows: Row[] = [];
  let n = 0;
  for (const section of meta.sections) {
    const html = stripLongNotes(readFileSync(join(dir, `fragments/${section.slug}.html`), "utf8"));
    for (const p of extractPassages(html)) {
      n += 1;
      rows.push({
        report: report.id,
        report_title: report.title,
        section: section.title,
        section_slug: section.slug,
        paragraph_number: n,
        page: p.page,
        paragraph_id: p.paragraphId,
        text: p.text,
        official_pdf_url: officialUrl(report.source_url, p.page),
        site_url: `${SITE}/reports/${report.id}/${section.slug}?p=${encodeURIComponent(p.paragraphId)}#${p.paragraphId}`,
        licence: LICENCE_LABELS[kind],
        licence_status: kind,
      });
    }
  }
  return rows;
}

export function allRows(root: string): Row[] {
  return liveReports(root).flatMap((r) => reportRows(root, r));
}

/** RFC 4180: quote a field containing a comma, quote or line break; double its quotes. */
const csvField = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvHeader = () => COLUMNS.join(",") + "\n";
export const csvLine = (row: Row) => COLUMNS.map((c) => csvField(row[c])).join(",") + "\n";
export const jsonlLine = (row: Row) => JSON.stringify(row) + "\n";
