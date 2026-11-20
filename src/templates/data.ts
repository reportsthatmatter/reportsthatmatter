import { SITE_ORIGIN, CONTACT_EMAIL, TEXT_DEFECT_ISSUE_URL } from "./site";
import { renderLayout, escapeHtml } from "./layout";
import type { ReportRegistry } from "../lib/registry";
import { LICENCE_LABELS, OUR_ADDITIONS_LICENCE, UNCONFIRMED_KINDS } from "../lib/dataset-licences";

/** What `pnpm dataset` records in `assets/generated/data/manifest.json`. */
export type DatasetManifest = {
  rows: number;
  reports: Array<{ id: string; rows: number }>;
  files: Record<string, { bytes: number; uncompressed_bytes?: number }>;
};

/** The files the page offers, in order, with what each is for. */
export const DATASET_FILES: Array<{ name: string; what: string }> = [
  { name: "reportsthatmatter-paragraphs.csv.gz", what: "CSV, gzipped: one row per paragraph, all reports" },
  { name: "reportsthatmatter-paragraphs.jsonl.gz", what: "JSON Lines, gzipped: the same rows, one object per line" },
  { name: "licences.json", what: "the licence statement for each report, as data" },
];

export const DATASET_COLUMNS: Array<[string, string]> = [
  ["report, report_title", "the report's id (its address on this site) and title"],
  ["section, section_slug", "the heading of the section the paragraph is in, and its slug"],
  ["paragraph_number", "the paragraph's position in the report, from 1, in document order. Our count, not the report's own paragraph numbers"],
  ["page", "the printed page the paragraph starts on (a number, or a roman numeral in front matter); empty where none was recorded"],
  ["paragraph_id", "our stable id for the paragraph: the target of its permalink"],
  ["text", "the paragraph's words, with footnotes removed"],
  ["official_pdf_url", "the official document. Where it is a PDF and the page is a number, the link ends #page=N; otherwise it is the plain source address"],
  ["site_url", "the paragraph on this site"],
  ["licence, licence_status", "the status of the report's text, as a label and as a machine-readable kind"],
];

const mb = (bytes: number) => (bytes < 100_000 ? `${Math.ceil(bytes / 1e3)} KB` : `${(bytes / 1e6).toFixed(1)} MB`);

/**
 * /data: the one stable place to download the per-paragraph dataset (decision 0029, reportsthatmatter-9uog), with the
 * licence statement for every report. Statements come from the registry's `text_status` (decision 0024), the same
 * words as the dataset's licence column and its Hugging Face card, and never say more than each report repo's LICENSE.
 */
export function renderData(registry: ReportRegistry, manifest: DatasetManifest | null): string {
  const rows = new Map((manifest?.reports ?? []).map((r) => [r.id, r.rows]));
  const reports = registry.reports.filter((r: any) => r.ingested !== false);
  const unconfirmed = reports.filter((r) => UNCONFIRMED_KINDS.includes(r.text_status?.kind ?? ""));

  const files = DATASET_FILES.map((f) => {
    const info = manifest?.files[f.name];
    return `<li><a href="/data/${f.name}" download>${f.name}</a>${info ? ` (${mb(info.bytes)})` : ""}: ${f.what}.</li>`;
  }).join("\n");

  const licences = reports
    .map((r) => {
      const status = r.text_status;
      const count = rows.get(r.id);
      return `<li><strong><a href="/reports/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a></strong>${count !== undefined ? ` (${count.toLocaleString("en-GB")} paragraphs)` : ""}<br />
      <span class="mono">${escapeHtml(status ? LICENCE_LABELS[status.kind] ?? status.kind : "Status not recorded")}</span><br />
      ${escapeHtml(status?.statement ?? "")}${r.source_url ? ` <a href="${escapeHtml(r.source_url)}" rel="nofollow">Official document ↗</a>` : ""}</li>`;
    })
    .join("\n");

  const caution = unconfirmed.length
    ? `<p><strong>Not every report here is under an open licence.</strong> ${unconfirmed
        .map((r) => `${escapeHtml(r.title)} (${escapeHtml((LICENCE_LABELS[r.text_status!.kind] ?? "").toLowerCase())})`)
        .join(" and ")}. We include them as public-interest documents, with their sources named, and we do not call them public domain or openly licensed. If you need rows that are clean to reuse, filter on <code>licence_status</code> and leave those out.</p>`
    : "";

  const body = `
<main>
  <section class="report-header wrap">
    <p class="kicker mono">Data</p>
    <h1>Every paragraph, as a dataset.</h1>
  </section>

  <div class="prose wrap measure">
    <p>${manifest ? `${manifest.rows.toLocaleString("en-GB")} paragraphs from ${manifest.reports.length} reports` : "One row per paragraph of every report on this site"}, each with its section, printed page, stable paragraph id, a link to the official document and a link to the paragraph here. The text is the text the site serves, so every row can be cited and checked against the source.</p>
    <p>This page is the stable address: the files below are rebuilt from the live reports, and the links do not change.</p>
  </div>

  <section class="section wrap" id="files" aria-labelledby="files-heading">
    <p class="section-label mono" id="files-heading">Download</p>
    <div class="prose measure">
      <ul>
${files}
      </ul>
      <p>The licence of each report's text is below and in the <code>licence</code> column of every row. Read it before reusing a report.</p>
    </div>
  </section>

  <section class="section wrap" id="licences" aria-labelledby="licences-heading">
    <p class="section-label mono" id="licences-heading">Licence, report by report</p>
    <div class="prose measure">
      <p>The licence is per report, not for the dataset as a whole. Each report's text keeps the status it has at its source, which is not ours to change; this is a statement of what we know, not legal advice. What we add (the structure, paragraph ids and numbers, and the licence and link columns) is <a href="${OUR_ADDITIONS_LICENCE.url}">${OUR_ADDITIONS_LICENCE.name}</a>: attribute it to Reports that Matter. Third-party material a report reproduces is not covered.</p>
      ${caution}
      <ul>
${licences}
      </ul>
    </div>
  </section>

  <section class="section wrap" id="columns" aria-labelledby="columns-heading">
    <p class="section-label mono" id="columns-heading">Columns</p>
    <div class="prose measure">
      <ul>
${DATASET_COLUMNS.map(([name, what]) => `        <li><code>${escapeHtml(name)}</code>: ${escapeHtml(what)}.</li>`).join("\n")}
      </ul>
    </div>
  </section>

  <section class="section wrap" id="limits" aria-labelledby="limits-heading">
    <p class="section-label mono" id="limits-heading">Limits</p>
    <div class="prose measure">
      <ul>
        <li>The <code>#page=</code> in a link is the <em>printed</em> page, not the PDF's own page number. Most PDFs have front matter, so the link can open a few pages from the paragraph (in the 9/11 report the printed page is the PDF's minus 17). Use it as a pointer to look near.</li>
        <li>Where the dataset and the official document differ, the official document is right. <a href="${TEXT_DEFECT_ISSUE_URL}">Report a problem</a> or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
        <li>A row is a paragraph or a whole list, as this site addresses it. Headings and footnotes are not rows. Text only: no figures or images.</li>
        <li>If you hold rights in a report here and want it out of the dataset, write to the same address; we will remove it within a day.</li>
      </ul>
    </div>
  </section>

  <section class="section wrap">
    <div class="hero" style="padding-block: 0; text-align: left">
      <div class="actions" style="justify-content: flex-start; margin-top: 0">
        <a class="btn btn-filled mono" href="/reports">Read the reports</a>
      </div>
    </div>
  </section>
</main>`;

  return renderLayout("Data: every paragraph of every report — Reports that Matter", body, {
    description:
      "Download one row per paragraph across every report on Reports that Matter, with page, paragraph id, a link to the official document and the licence of each report's text.",
    url: `${SITE_ORIGIN}/data`,
    follow: true,
  });
}
