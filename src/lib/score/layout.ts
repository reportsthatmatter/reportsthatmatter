/**
 * PDF layout lines from poppler's `pdftohtml -xml` (the layout oracle's
 * source, quality-harness plan §3.3): one record per printed line with its
 * position and font, for the decision dataset's layout features. Cached per
 * report; measure-only.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

export function parsePdfXml(xml: string, pageOffset = 0): Line[] {
  const lines: Line[] = [];
  const fonts = new Map<string, { size: number; family: string; color: string }>();
  for (const page of xml.split(/<page /).slice(1)) {
    const num = Number(/number="(\d+)"/.exec(page)![1]) + pageOffset;
    const ph = Number(/height="(\d+)"/.exec(page)![1]);
    const pw = Number(/width="(\d+)"/.exec(page)![1]);
    for (const f of page.matchAll(/<fontspec id="(\d+)" size="(-?[\d.]+)" family="([^"]*)" color="([^"]*)"\/>/g)) {
      fonts.set(f[1], { size: Number(f[2]), family: f[3], color: f[4] });
    }
    type Frag = { top: number; left: number; width: number; height: number; font: string; inner: string; text: string };
    const frags: Frag[] = [];
    for (const t of page.matchAll(/<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">([\s\S]*?)<\/text>/g)) {
      const text = decode(t[6]);
      if (!text.trim()) continue;
      frags.push({ top: +t[1], left: +t[2], width: +t[3], height: +t[4], font: t[5], inner: t[6], text });
    }
    // merge fragments on the same baseline that touch (a superscript, a font change mid-line)
    const used = new Set<number>();
    for (let i = 0; i < frags.length; i++) {
      if (used.has(i)) continue;
      const parts = [frags[i]];
      used.add(i);
      let right = frags[i].left + frags[i].width;
      for (let j = i + 1; j < frags.length && j < i + 12; j++) {
        if (used.has(j)) continue;
        const f = frags[j];
        const base = parts[0];
        const sameLine = Math.abs(f.top - base.top) <= 3 || (f.top >= base.top - 4 && f.top + f.height <= base.top + base.height + 2 && f.height < base.height);
        if (sameLine && f.left >= right - 2 && f.left - right < 24) {
          parts.push(f);
          used.add(j);
          right = f.left + f.width;
        }
      }
      const main = parts.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      const font = fonts.get(main.font) ?? { size: main.height, family: "", color: "" };
      const sup = parts.some((p) => p !== main && p.height < main.height - 2 && /^\s*[\d*†‡]+\s*$/.test(p.text));
      lines.push({
        page: num,
        pageHeight: ph,
        pageWidth: pw,
        top: main.top,
        left: parts[0].left,
        width: right - parts[0].left,
        height: main.height,
        size: font.size,
        font: main.font,
        family: font.family,
        color: font.color,
        bold: /<b>/.test(main.inner) || /bold|black|heavy|semibold/i.test(font.family),
        italic: /<i>/.test(main.inner) || /italic|oblique/i.test(font.family),
        superscript: sup,
        text: parts.map((p) => p.text).join(parts.length > 1 ? "" : ""),
      });
    }
  }
  return lines;
}

/** The report's source PDFs in archive/, in name order, as layout lines (cached). */
export function loadLayout(repo: string, cacheDir: string): Line[] | null {
  const archive = join(repo, "archive");
  if (!existsSync(archive)) return null;
  const pdfs = readdirSync(archive)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (pdfs.length !== 1) return null; // multi-volume: volume order lives in ingest.ts; not needed for the dev set
  mkdirSync(cacheDir, { recursive: true });
  const pdf = join(archive, pdfs[0]);
  const xml = join(cacheDir, "layout.xml");
  if (!existsSync(xml) || statSync(xml).mtimeMs < statSync(pdf).mtimeMs) {
    try {
      execFileSync("pdftohtml", ["-xml", "-i", "-q", "-nodrm", "-enc", "UTF-8", pdf, join(cacheDir, "layout")], { stdio: "ignore" });
    } catch {
      return null;
    }
  }
  return parsePdfXml(readFileSync(xml, "utf8"));
}
