/**
 * Page-level reference texts: how well does our served text match a checked transcription of one
 * printed page (reportsthatmatter-7d4y)?
 *
 * A page reference is the words of one PDF page's body as a human checked them, with footnote markers
 * at positions: a proofread Wikisource page (reference/wikisource/, mapped to PDF pages by
 * pagemap.json) or a checked transcription kept as reference/page-text/<pdf>.txt (a golden page that
 * carries its full text, named by the page's %%page N%% label in full.md; markers written `[^12]` as in full.md). Notes are not scored here: our
 * notes are endnotes, not placed on pages.
 *
 * Per page: our body words for that PDF page plus a margin either side (a paragraph that runs over a
 * page break sits wholly on one page in full.md) are aligned to the reference words, free at both ends
 * of our window, so the page's own words are scored and the margin is not. Errors are substitutions,
 * deletions (a reference word we lack) and insertions (a word of ours between the first and last
 * aligned word that the reference lacks); WER = errors / reference words. Markers: a reference marker
 * and one of ours match when they sit at the same word boundary (one word of tolerance) and carry the
 * same label when the reference has one.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Ours } from "./ours";
import { inlineText } from "./ours";
import { tokens, tokensBefore } from "./tokens";
import { cleanWikitext } from "./wikisource";

export type PageRef = {
  /** PDF page */
  pdf: number;
  /** our %%page N%% label for the same page (the PDF page unless the report labels pages by printed number) */
  page: number;
  /** where the reference comes from: "wikisource:<n>@<revid>" or "checked:<file>" */
  source: string;
  /** proofread level for Wikisource (3 proofread, 4 validated); 5 for a checked transcription */
  quality: number;
  /** how the page was mapped: "text", "inferred (...)" or "given" */
  mapping: string;
  text: string;
  markers: { label: string | null; offset: number }[];
};

export type PageScore = {
  pdf: number;
  page: number;
  source: string;
  quality: number;
  mapping: string;
  refWords: number;
  ourWords: number;
  sub: number;
  del: number;
  ins: number;
  /** insertions that are bare numbers: footnote markers left as plain digits, page numbers */
  insNum: number;
  wer: number;
  refMarkers: number;
  ourMarkers: number;
  matched: number;
  /** reference markers matched in place but with a different label */
  wrongLabel: number;
  firstWords: string;
  /** the first errors in reading order: `ref>ours` substitution, `-ref` a reference word we lack, `+ours` a word of ours the reference lacks */
  diff: string[];
  /** line of full.md where our page begins (for the reader) */
  line: number | null;
};

export type PageTotals = {
  pages: number;
  refWords: number;
  errors: number;
  wer: number;
  /** WER leaving out inserted bare numbers */
  werNoNumbers: number;
  insNum: number;
  refMarkers: number;
  ourMarkers: number;
  matched: number;
  markerP: number;
  markerR: number;
};

const MARGIN = 400;

export function loadPageRefs(repo: string): PageRef[] {
  const refs: PageRef[] = [];
  const dir = join(repo, "reference", "wikisource");
  if (existsSync(join(dir, "manifest.json")) && existsSync(join(dir, "pagemap.json"))) {
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { pages: { n: number; file: string; revid: number; quality: number | null }[] };
    const map = JSON.parse(readFileSync(join(dir, "pagemap.json"), "utf8")) as { pages: { n: number; pdf: number | null; ours: number | null; method: string }[] };
    const byN = new Map(map.pages.map((p) => [p.n, p]));
    for (const p of manifest.pages) {
      if (p.quality !== 3 && p.quality !== 4) continue; // proofread or validated only
      const m = byN.get(p.n);
      if (!m?.pdf || !m.ours) continue;
      const page = cleanWikitext(readFileSync(join(dir, p.file), "utf8"));
      refs.push({ pdf: m.pdf, page: m.ours, source: `wikisource:${p.n}@${p.revid}`, quality: p.quality, mapping: m.method, text: page.text, markers: page.markers.map((k) => ({ label: k.label, offset: k.offset })) });
    }
  }
  const ptDir = join(repo, "reference", "page-text");
  if (existsSync(ptDir)) {
    for (const f of readdirSync(ptDir).filter((x) => /^\d+\.txt$/.test(x))) {
      const { text, markers } = inlineText(readFileSync(join(ptDir, f), "utf8"));
      refs.push({ pdf: Number(f.replace(".txt", "")), page: Number(f.replace(".txt", "")), source: `checked:${f}`, quality: 5, mapping: "given", text, markers });
    }
  }
  return refs.sort((a, b) => a.pdf - b.pdf);
}

type Aligned = { ops: string[]; sub: number; del: number; ins: number; insNum: number; start: number; end: number; bmap: Int32Array };

/** Semi-global edit alignment: all of `ref`, any stretch of `ours`. bmap[b] = our boundary matching reference boundary b. */
export function alignPage(ref: string[], ours: string[]): Aligned {
  const m = ref.length;
  const n = ours.length;
  const W = n + 1;
  const D = new Int32Array((m + 1) * W);
  const T = new Uint8Array((m + 1) * W); // 0 diag, 1 up (ref word deleted), 2 left (our word inserted)
  for (let i = 1; i <= m; i++) {
    D[i * W] = i;
    T[i * W] = 1;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const diag = D[(i - 1) * W + j - 1] + (ref[i - 1] === ours[j - 1] ? 0 : 1);
      const up = D[(i - 1) * W + j] + 1;
      const left = D[i * W + j - 1] + 1;
      let best = diag;
      let t = 0;
      if (up < best) (best = up), (t = 1);
      if (left < best) (best = left), (t = 2);
      D[i * W + j] = best;
      T[i * W + j] = t;
    }
  }
  let j = 0;
  for (let k = 1; k <= n; k++) if (D[m * W + k] < D[m * W + j]) j = k;
  const end = j;
  let i = m;
  let sub = 0;
  let del = 0;
  let ins = 0;
  let insNum = 0;
  const bmap = new Int32Array(m + 1);
  const ops: string[] = [];
  bmap[m] = j;
  while (i > 0) {
    const t = T[i * W + j];
    if (t === 0) {
      if (ref[i - 1] !== ours[j - 1]) (sub++, ops.push(`${ref[i - 1]}>${ours[j - 1]}`));
      i--;
      j--;
      bmap[i] = j;
    } else if (t === 1) {
      del++;
      ops.push(`-${ref[i - 1]}`);
      i--;
      bmap[i] = j;
    } else {
      ins++;
      ops.push(`+${ours[j - 1]}`);
      if (/^\d+$/.test(ours[j - 1])) insNum++;
      j--;
    }
  }
  return { ops: ops.reverse(), sub, del, ins, insNum, start: j, end, bmap };
}

export function scorePages(ours: Ours, refs: PageRef[]): { pages: PageScore[]; totals: PageTotals } {
  const words: string[] = [];
  const range = new Map<number, [number, number]>();
  const placed: { page: number | null; start: number; block: (typeof ours.body)[number] }[] = [];
  for (const b of ours.body) {
    const start = words.length;
    for (const t of tokens(b.text)) words.push(t.word);
    placed.push({ page: b.page, start, block: b });
    if (b.page !== null) {
      const r = range.get(b.page);
      if (r) r[1] = words.length;
      else range.set(b.page, [start, words.length]);
    }
  }
  const markersAt: { at: number; label: string }[] = [];
  for (const { start, block } of placed) for (const m of block.markers) markersAt.push({ at: start + tokensBefore(block.text, m.offset), label: m.label });
  const pageKeys = [...range.keys()].sort((a, b) => a - b);
  const startOf = (p: number) => range.get(p)?.[0] ?? range.get(pageKeys.find((k) => k > p) ?? -1)?.[0] ?? words.length;
  const endOf = (p: number) => range.get(p)?.[1] ?? startOf(p);

  const pages: PageScore[] = [];
  for (const ref of refs) {
    const rw = tokens(ref.text).map((t) => t.word);
    // a page before our first or after our last page label cannot be located in our text
    if (!rw.length || !pageKeys.length || ref.page < pageKeys[0] || ref.page > pageKeys[pageKeys.length - 1]) continue;
    const lo = Math.max(0, startOf(ref.page) - MARGIN);
    const hi = Math.min(words.length, endOf(ref.page) + MARGIN);
    const win = words.slice(lo, hi);
    const a = alignPage(rw, win);
    const first = placed.find((p) => p.page === ref.page);
    // markers
    const refMk = ref.markers.map((k) => ({ label: k.label, at: tokensBefore(ref.text, k.offset) }));
    const ourMk = markersAt.filter((k) => k.at > lo + a.start && k.at <= lo + a.end);
    const used = new Set<number>();
    let matched = 0;
    let wrongLabel = 0;
    for (const k of refMk) {
      const want = lo + a.bmap[Math.min(k.at, rw.length)];
      let hit = -1;
      for (let x = 0; x < ourMk.length; x++) {
        if (used.has(x) || Math.abs(ourMk[x].at - want) > 1) continue;
        if (k.label !== null && ourMk[x].label !== k.label) {
          wrongLabel++;
          continue;
        }
        hit = x;
        break;
      }
      if (hit >= 0) (used.add(hit), matched++);
    }
    pages.push({
      pdf: ref.pdf,
      page: ref.page,
      source: ref.source,
      quality: ref.quality,
      mapping: ref.mapping,
      refWords: rw.length,
      ourWords: a.end - a.start,
      sub: a.sub,
      del: a.del,
      ins: a.ins,
      insNum: a.insNum,
      wer: (a.sub + a.del + a.ins) / rw.length,
      refMarkers: refMk.length,
      ourMarkers: ourMk.length,
      matched,
      wrongLabel,
      firstWords: rw.slice(0, 8).join(" "),
      diff: a.ops.slice(0, 40),
      line: first?.block.line ?? null,
    });
  }
  return { pages, totals: totalsOf(pages) };
}

export function totalsOf(pages: PageScore[]): PageTotals {
  const sum = (f: (p: PageScore) => number) => pages.reduce((s, p) => s + f(p), 0);
  const refWords = sum((p) => p.refWords);
  const errors = sum((p) => p.sub + p.del + p.ins);
  const refMarkers = sum((p) => p.refMarkers);
  const ourMarkers = sum((p) => p.ourMarkers);
  const matched = sum((p) => p.matched);
  const insNum = sum((p) => p.insNum);
  return { pages: pages.length, refWords, errors, wer: refWords ? errors / refWords : 0, werNoNumbers: refWords ? (errors - insNum) / refWords : 0, insNum, refMarkers, ourMarkers, matched, markerP: ourMarkers ? matched / ourMarkers : 1, markerR: refMarkers ? matched / refMarkers : 1 };
}

/** The worst pages by WER (pages with at least `minWords` reference words) and by error count. */
export function worstPages(pages: PageScore[], k = 15, minWords = 50) {
  return {
    byRate: pages.filter((p) => p.refWords >= minWords).sort((a, b) => b.wer - a.wer).slice(0, k),
    byCount: [...pages].sort((a, b) => b.sub + b.del + b.ins - (a.sub + a.del + a.ins)).slice(0, k),
    byMarkers: pages.filter((p) => p.refMarkers >= 3).sort((a, b) => a.matched / a.refMarkers - b.matched / b.refMarkers).slice(0, k),
  };
}

export function pagesMarkdown(id: string, pages: PageScore[], totals: PageTotals): string {
  const pc = (x: number) => (x * 100).toFixed(1) + "%";
  const row = (p: PageScore) => `| ${p.page}${p.page !== p.pdf ? ` (pdf ${p.pdf})` : ""} | ${p.quality === 4 ? "validated" : p.quality === 3 ? "proofread" : "checked"} | ${p.refWords} | ${p.sub}/${p.del}/${p.ins} | ${pc(p.wer)} | ${p.matched}/${p.refMarkers} of ${p.ourMarkers} | ${p.line ?? ""} | ${p.firstWords} |`;
  const head = "| page | reference | words | sub/del/ins | WER | markers matched/reference of ours | full.md line | page begins |\n|---:|---|---:|---|---:|---|---:|---|";
  const w = worstPages(pages);
  const lines = [
    `# ${id}: page-level word and marker accuracy`,
    "",
    `Our served text against ${totals.pages} human-checked pages (${pages.filter((p) => p.quality === 4).length} validated, ${pages.filter((p) => p.quality === 3).length} proofread, ${pages.filter((p) => p.quality === 5).length} checked transcriptions). Method: docs/scoring.md, "Page-level references".`,
    "",
    `- Word error rate (all pages together): **${pc(totals.wer)}** (${totals.errors} errors over ${totals.refWords} reference words); **${pc(totals.werNoNumbers)}** leaving out the ${totals.insNum} inserted bare numbers (footnote markers left as digits in the text, stray page numbers).`,
    `- Footnote markers: reference ${totals.refMarkers}, ours on these pages ${totals.ourMarkers}, matched ${totals.matched}: precision **${pc(totals.markerP)}**, recall **${pc(totals.markerR)}**.`,
    "",
    "## Worst pages by word error rate (at least 50 reference words)",
    "",
    head,
    ...w.byRate.map(row),
    "",
    "## Worst pages by number of word errors",
    "",
    head,
    ...w.byCount.map(row),
    "",
    "## Worst pages by footnote-marker recall (at least 3 reference markers)",
    "",
    head,
    ...w.byMarkers.map(row),
    "",
    "## Every page",
    "",
    head,
    ...pages.map(row),
    "",
  ];
  return lines.join("\n");
}
