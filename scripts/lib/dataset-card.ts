/**
 * The Hugging Face dataset card (README.md with a YAML header) for the per-paragraph dataset, generated from the real
 * row counts so the numbers cannot drift (reportsthatmatter-9uog). Nothing here uploads anything: `pnpm dataset` writes
 * the folder, and Rufus uploads it (docs/dataset.md).
 */
import { LICENCE_LABELS, OUR_ADDITIONS_LICENCE, UNCONFIRMED_KINDS } from "../../src/lib/dataset-licences";

export type ReportSummary = {
  id: string;
  title: string;
  rows: number;
  kind: string;
  statement: string;
  sourceUrl: string;
};

export const HF_REPO = "reportsthatmatter/paragraphs";

const sizeCategory = (n: number) =>
  n < 1000 ? "n<1K" : n < 10_000 ? "1K<n<10K" : n < 100_000 ? "10K<n<100K" : n < 1_000_000 ? "100K<n<1M" : "1M<n<10M";

const esc = (s: string) => s.replace(/\|/g, "\\|");

export function datasetCard(reports: ReportSummary[], date: string): string {
  const total = reports.reduce((n, r) => n + r.rows, 0);
  const year = date.slice(0, 4);
  const unconfirmed = reports.filter((r) => UNCONFIRMED_KINDS.includes(r.kind));
  const table = reports
    .map((r) => `| [${esc(r.title)}](https://reportsthatmatter.org/reports/${r.id}) | ${r.rows.toLocaleString("en-GB")} | ${LICENCE_LABELS[r.kind]} |`)
    .join("\n");
  const statements = reports.map((r) => `- **${esc(r.title)}** (\`${r.id}\`): ${r.statement}`).join("\n");

  return `---
license: other
license_name: per-report
license_link: https://reportsthatmatter.org/data#licences
pretty_name: Reports that Matter, per-paragraph dataset
language:
  - en
task_categories:
  - text-retrieval
  - question-answering
  - text-classification
tags:
  - public-inquiries
  - government-reports
  - official-reports
  - legal
  - paragraph-level
size_categories:
  - ${sizeCategory(total)}
annotations_creators:
  - no-annotation
language_creators:
  - found
source_datasets:
  - original
configs:
  - config_name: default
    data_files:
      - split: train
        path: data/train.jsonl
---

# Reports that Matter: one row per paragraph

${total.toLocaleString("en-GB")} paragraphs from ${reports.length} official public reports (inquiries, commissions, investigations and one court examiner's report), each with its section, printed page, a stable paragraph id, a link to the official document and a link to the paragraph on [reportsthatmatter.org](https://reportsthatmatter.org). Built from the same text the site serves, so every row can be cited and checked.

Home page and latest files: <https://reportsthatmatter.org/data>. The site: <https://reportsthatmatter.org>.

## The licence is per report, and not all of it is settled

The \`license: other\` in the header is deliberate: the text of each report keeps the status it has at its source, which is not ours to change, and the reports differ. Read the \`licence\` and \`licence_status\` columns, or this table, before reusing any one of them.

${
  unconfirmed.length
    ? `**Not everything here is under an open licence.** ${unconfirmed
        .map((r) => `*${r.title}* (${LICENCE_LABELS[r.kind].toLowerCase()})`)
        .join(" and ")}. We include them as public-interest documents with their sources named, we do not call them public domain or openly licensed, and rights holders can ask us to remove them (contact@reportsthatmatter.org). If you need a dataset that is clean to reuse, filter on \`licence_status\` and leave those out.\n`
    : ""
}
| Report | Paragraphs | Licence of the report's text |
| --- | ---: | --- |
${table}

The statements, report by report:

${statements}

What we add (the structure, paragraph ids, paragraph numbers and the \`licence\` and link columns) is under [${OUR_ADDITIONS_LICENCE.name}](${OUR_ADDITIONS_LICENCE.url}); attribute it to "Reports that Matter". This is a statement of status, not legal advice. Third-party material a report reproduces is not covered by any of the above.

## Columns

| Column | Meaning |
| --- | --- |
| \`report\` | Our report id (the URL slug on the site) |
| \`report_title\` | The report's title |
| \`section\` | The heading of the section the paragraph sits in, and \`section_slug\` its slug |
| \`paragraph_number\` | 1-based position of the paragraph in the report, in document order. It is our count, not the report's own paragraph numbers |
| \`page\` | The printed page the paragraph starts on (a number, or a roman numeral in front matter); empty where the pipeline recorded none |
| \`paragraph_id\` | Our stable id for the paragraph, the target of the site's permalinks (\`/reports/<report>/<section>?p=<paragraph_id>\`) |
| \`text\` | The paragraph's words, with footnotes removed |
| \`official_pdf_url\` | The official document. Where the source is a PDF and the page is a number it ends \`#page=<page>\`; otherwise it is the plain source URL. See the limits below |
| \`site_url\` | The paragraph on reportsthatmatter.org |
| \`licence\`, \`licence_status\` | The report's text status as a label, and the machine-readable kind it comes from |

## Limits you should know

- **\`#page=\` uses the printed page, not the PDF's page index.** Most PDFs have front matter, so the link can open a few pages from the paragraph (in the 9/11 report the printed page is the PDF's minus 17). It is a pointer to look near, not an exact deep link.
- **The official document is the authority.** The text is taken from the published document by deterministic software and checked against it, with no language model writing any of it, but where this dataset and the official document differ, the official document is right. [Report a problem](https://github.com/reportsthatmatter/reportsthatmatter/issues/new?template=text-defect.yml).
- **A row is a citable unit**: a paragraph or a whole list, as the site addresses it. Headings and footnotes are not rows (the footnotes are not in \`text\` either).
- **Text only**: no figures, images or tables as images.
- Reports are added over time; the row counts above are for this version. The report list and licence statements are in the table above.

## Citation

\`\`\`bibtex
@misc{reportsthatmatter_paragraphs_${year},
  author       = {Pollock, Rufus and contributors},
  title        = {Reports that Matter: a per-paragraph dataset of official public reports},
  year         = {${year}},
  howpublished = {\\url{https://reportsthatmatter.org/data}},
  note         = {Hugging Face dataset ${HF_REPO}; version of ${date}. The text of each report remains subject to its own licence}
}
\`\`\`

Cite the report itself (title, issuing body, page or paragraph) as well; each row has what you need.

## Source and code

Built by \`pnpm dataset\` in [reportsthatmatter/reportsthatmatter](https://github.com/reportsthatmatter/reportsthatmatter) (MIT), from the text of each report's own repository under <https://github.com/reportsthatmatter>.
`;
}
