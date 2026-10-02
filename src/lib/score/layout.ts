/**
 * PDF layout lines for the decision dataset's layout features. The parse, the
 * per-PDF cache (`<report-repo>/.cache/`, keyed by SHA-256) and the page
 * statistics live in `@rtm/ingest` (`openLayout`), shared with the layout
 * oracle (`pnpm ingest verify`) and any pass that gates on layout; this adapts
 * a `LayoutLine` to the flat record `decisions.ts` reads. Measure-only.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildLayout, openLayout, parseLayoutXml, type Layout, type LayoutLine } from "@rtm/ingest";

export type Line = {
  /** 1-based PDF page (physical, not printed) */
  page: number;
  pageHeight: number;
  pageWidth: number;
  top: number;
  left: number;
  width: number;
  height: number;
  /** font size of the line's dominant fragment */
  size: number;
  font: string;
  family: string;
  color: string;
  bold: boolean;
  italic: boolean;
  /** a small raised fragment (footnote-marker shape) inside the line */
  superscript: boolean;
  text: string;
};

const toLine = (l: LayoutLine, pageOffset: number): Line => ({
  page: l.page + pageOffset,
  pageHeight: l.pageHeight,
  pageWidth: l.pageWidth,
  top: l.top,
  left: l.left,
  width: l.width,
  height: l.height,
  size: l.size,
  font: l.font,
  family: l.family,
  color: l.color,
  bold: l.bold,
  italic: l.italic,
  superscript: l.raised.length > 0,
  text: l.text,
});

function lines(layout: Layout): Line[] {
  return layout.pages(1).flatMap((page) => layout.lines(1, page).map((l) => toLine(l, 0)));
}

export function parsePdfXml(xml: string): Line[] {
  return lines(buildLayout([parseLayoutXml(xml)]));
}

/** The report's source PDF in archive/ as layout lines (cached in the report repo). */
export function loadLayout(repo: string): Line[] | null {
  const archive = join(repo, "archive");
  if (!existsSync(archive)) return null;
  const pdfs = readdirSync(archive)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (pdfs.length !== 1) return null; // multi-volume: volume order lives in ingest.ts; not needed for the dev set
  try {
    return lines(openLayout([join(archive, pdfs[0])], join(repo, ".cache")));
  } catch {
    return null;
  }
}
