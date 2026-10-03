/**
 * `pnpm ingest run` on a `cleanEdition` report: what the build measured about the edition against the
 * PDF (IngestResult.edition), which nothing printed before reportsthatmatter-s24x. "Pages anchored"
 * comes from the same alignment that placed the markers, so it cannot fail; `pnpm ingest anchors <id>`
 * is the independent check, and this says so.
 */
import type { EditionReport } from "@rtm/ingest";

const n = (x: number) => x.toLocaleString("en-GB");
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(2)}%` : "-");

export function formatEditionReport(r: EditionReport): string {
  const files = r.sources.length === 1 ? r.sources[0].path : `${r.sources.length} files`;
  return [
    `Edition (cleanEdition, ${files})`,
    `  edition words aligned to the PDF: ${n(r.alignedWords)} of ${n(r.editionWords)} (${pct(r.alignedWords, r.editionWords)})`,
    `  edition words the PDF never prints (OOV): ${n(r.oov)}${r.oovExamples.length ? ` — e.g. ${r.oovExamples.slice(0, 8).join(", ")}` : ""}`,
    `  PDF words on the pages the edition covers aligned to it: ${n(r.pdfAligned)} of ${n(r.pdfWords)} (${pct(r.pdfAligned, r.pdfWords)})`,
    `  pages: ${n(r.pages.anchored)} anchored by their own words, ${n(r.pages.placedByNeighbour)} placed by a neighbour${r.pages.frontMatterSkipped ? `, ${n(r.pages.frontMatterSkipped)} front-matter pages skipped` : ""} (same alignment as the markers: check with pnpm ingest anchors)`,
    `  typography restored from the PDF: ${n(r.dashesRestored)} dashes, ${n(r.spacesRestored)} spaces, ${n(r.hyphensClosed)} line-end hyphens closed`,
    `  disagreements (in fidelity.md): ${n(r.disagreements.editionNotInPdf)} edition stretches not in the PDF, ${n(r.disagreements.pdfNotInEdition)} PDF stretches not in the edition`,
  ].join("\n");
}
