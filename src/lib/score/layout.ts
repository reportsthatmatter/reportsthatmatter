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
  /** set by `prepareLayout`: a footnote line (the note size, in the run of small lines at the foot of the page) */
  note?: boolean;
  /** set by `prepareLayout`: 0 or 1 on a page laid out in two columns */
  column?: number | null;
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

/**
 * Reading order and footnote lines, for the decision dataset (38s.12).
 *
 * - Two-column pages: pdftohtml emits fragments in content-stream order, and a page whose lines
 *   interleave the columns would pair the last line of one column with the first of the other. A page
 *   is two-column when it has eight or more narrow substantive lines whose centre is left of the
 *   page's middle and eight or more right of it, and fewer than a fifth of its substantive lines span
 *   the middle. Its lines are reordered column-major, a full-width line (a heading, a figure caption,
 *   a table) closing the band above it.
 * - Footnote lines: the run of lines at the foot of the page, all set below 0.9x the page's modal size
 *   (the lines under the notes rule), is marked `note` so it is never taken for the page's last body line.
 */
const LABEL_ONLY = /^(?:\d{1,3}(?:\.\d{1,4})*\.?|[a-zA-Z]\.|\([a-z0-9]{1,4}\)|[•·▪–-])[\s\uFFFD\uF0B7\uF0A7]*$/;

/** A hanging paragraph label or bullet set apart from its text (Saville's "2.5", Chilcot's bullets) joins the line beside it. */
function mergeLabels(page: Line[]): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < page.length; i++) {
    const l = page[i];
    const n = page[i + 1];
    if (n && LABEL_ONLY.test(l.text.trim()) && Math.abs(n.top - l.top) <= 4 && n.left > l.left && n.left - (l.left + l.width) < 80) {
      out.push({ ...n, left: l.left, width: n.left + n.width - l.left, text: l.text.trimEnd() + " " + n.text, column: n.column });
      i++;
    } else out.push(l);
  }
  return out;
}

export function prepareLayout(lines: Line[]): Line[] {
  const byPage = new Map<number, Line[]>();
  for (const l of lines) {
    const ls = byPage.get(l.page);
    if (ls) ls.push(l);
    else byPage.set(l.page, [l]);
  }
  const out: Line[] = [];
  for (const [, ls] of byPage) {
    let page = ls;
    // modal size by characters
    const sizes = new Map<number, number>();
    for (const l of ls) sizes.set(l.size, (sizes.get(l.size) ?? 0) + l.text.length);
    const modal = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const W = ls[0].pageWidth;
    const mid = W / 2;
    const subst = ls.filter((l) => l.text.length >= 25);
    const spans = (l: Line) => l.left < mid - 0.04 * W && l.left + l.width > mid + 0.04 * W;
    const narrow = subst.filter((l) => !spans(l) && l.width < 0.55 * W);
    const nl = narrow.filter((l) => l.left + l.width / 2 < mid).length;
    const nr = narrow.length - nl;
    const two = nl >= 8 && nr >= 8 && subst.filter(spans).length < 0.2 * subst.length;
    if (two) {
      const sorted: Line[] = [];
      let band: Line[] = [];
      const flush = () => {
        const left = band.filter((l) => l.left + l.width / 2 < mid).sort((a, b) => a.top - b.top || a.left - b.left);
        const right = band.filter((l) => l.left + l.width / 2 >= mid).sort((a, b) => a.top - b.top || a.left - b.left);
        for (const l of left) l.column = 0;
        for (const l of right) l.column = 1;
        sorted.push(...left, ...right);
        band = [];
      };
      for (const l of [...ls].sort((a, b) => a.top - b.top || a.left - b.left)) {
        if (spans(l)) {
          flush();
          l.column = null;
          sorted.push(l);
        } else band.push(l);
      }
      flush();
      page = sorted;
    } else {
      for (const l of ls) l.column = null;
      // pdftohtml may emit a hanging paragraph label ("2.5") after the lines below it: reading order is top, then left
      page = [...ls].sort((a, b) => (Math.abs(a.top - b.top) <= 3 ? a.left - b.left : a.top - b.top));
    }
    page = mergeLabels(page);
    // the foot of the page: trailing run of small lines (per column on a two-column page: the last line of the page is enough)
    const tail = [...page].sort((a, b) => b.top - a.top || b.left - a.left);
    for (const l of tail) {
      if (l.size < 0.9 * modal && l.top > 0.5 * l.pageHeight) l.note = true;
      else if (l.text.length < 6 && l.top > 0.9 * l.pageHeight) continue; // a printed page number below the notes
      else break;
    }
    out.push(...page);
  }
  return out;
}
