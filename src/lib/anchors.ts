/**
 * An independent check of a report's printed-page anchors (reportsthatmatter-s24x).
 *
 * The pipeline decides two things about every `%%page N%%` marker: which PDF
 * page carries printed number N (its furniture reading), and where in the text
 * that page begins (the PDF build splits blocks at the page break; a
 * `cleanEdition` build aligns the edition to the PDF with `align` and marks a
 * page that starts inside a block after that block). Its own counts
 * ("pages anchored") come from the same decisions, so they cannot fail.
 *
 * This shares neither. From the PDF text layer alone (`pdftotext`, page by
 * page) it
 *
 *  1. reads each page's printed number off its first or last three lines (a
 *     number alone, "(3)", "- 12 -", beside a running head after two spaces,
 *     "Page N"), kept only where a page within four either side runs in step
 *     with it; a page with none between two that agree is inferred;
 *  2. attributes served words to PDF pages: a 6-word shingle that occurs once
 *     in the served body (inside one block) and on one PDF page belongs to
 *     that page. A page's start is its first such shingle in page order,
 *     taken from a cluster of hits (so a running head that is also a heading
 *     cannot place the page) and extended backwards while both sides agree;
 *  3. resolves each marker to the page carrying its label whose start is
 *     nearest, under the label scheme that fits the report best (the printed
 *     number, the PDF page within its volume, or the PDF page across volumes).
 *
 * Verdicts per marker: `exact` (between the previous page's last attributed
 * word and this page's first), `block` (the page starts inside a block and the
 * marker sits at that block's start, or after its end and any blocks after it
 * printed on earlier pages: the only places a marker between blocks can go),
 * `wrong` (anywhere else: the word distance is reported), `unlocated` (no page
 * with that label, or the page's text was not found in the served body).
 * Per block of 8+ words: the page its first run of attributed words is
 * printed on, against the marker it sits under.
 */

export type PageText = { volume: number; pdfIndex: number; layout: string; words: string };

export type PrintedReading = { number: string | null; inferred: boolean };

export type Marker = { label: string; occurrence?: number; pos: number; line: number };

/** `boundaries[i]` is block i's first word; `contents[i]` marks a contents entry ("- Chapter 1 — 45"), which repeats a heading printed elsewhere. */
export type Served = { words: string[]; markers: Marker[]; boundaries: number[]; contents: boolean[]; lineOf: number[] };

export type PageStart = { start: number | null; lead: number };

export type Scheme = "printed" | "pdf-volume" | "pdf-global";

export type MarkerVerdict = {
  label: string;
  line: number;
  verdict: "exact" | "block" | "wrong" | "unlocated";
  page?: { volume: number; pdfIndex: number };
  delta?: number;
  /** For `wrong`: the printed label of the page whose start is nearest the marker. */
  nearest?: string | null;
  context?: string;
};

export type BlockVerdict = { line: number; marker: string; printedOn: string; text: string; unmarkedPage: boolean };

export type AnchorReport = {
  scheme: Scheme;
  /**
   * Every block of 8+ words: the page its first located words are printed on, against the marker it
   * sits under. `wrong` lists the blocks a reader would be told are on another page.
   */
  blocks: { checked: number; right: number; wrong: number; onUnmarked: number; unlocated: number; wrongBlocks: BlockVerdict[] };
  markers: number;
  exact: number;
  block: number;
  wrong: number;
  unlocated: number;
  /**
   * `block` markers stacked at the end of one block with the marker before them: a block that runs over
   * more than one page break (a long table, a quotation), so every page after its first is marked after
   * it and its text is cited with the first (reportsthatmatter-8x9n, hmqk).
   */
  stacked: number;
  /** PDF pages within the marked range whose printed number was read and whose text was found, but no marker names them. */
  unmarked: Array<{ volume: number; pdfIndex: number; label: string }>;
  pagesRead: number;
  pagesInferred: number;
  pagesLocated: number;
  pages: number;
  verdicts: MarkerVerdict[];
  schemes: Record<Scheme, number>;
};

const SHINGLE = 6;
const CLUSTER = 300;

/** Lower-case letters and digits, diacritics and ligatures folded, apostrophes dropped; numbers of 1-3 digits (note markers, page numbers) left out on both sides. */
export function wordsOf(text: string): string[] {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘]/g, "");
  return (folded.match(/[a-z0-9]+/g) ?? []).filter((w) => !/^\d{1,3}$/.test(w));
}

const ROMAN = /^(?=[ivxlc])(c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

function romanValue(s: string): number | null {
  const m = ROMAN.exec(s.toLowerCase());
  if (!m) return null;
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const v = map[t[i]];
    const next = map[t[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** Page-number candidates on one page: from its first and last three non-blank lines. */
export function numberCandidates(layout: string): string[] {
  const lines = layout.split("\n").filter((l) => l.trim());
  const edge = lines.length <= 6 ? lines : [...lines.slice(0, 3), ...lines.slice(-3)];
  const out = new Set<string>();
  const N = "(\\d{1,4}|[ivxlcIVXLC]{1,7})";
  const patterns = [
    new RegExp(`^\\s*[-–—]?\\s*${N}\\s*[-–—]?\\s*$`),
    new RegExp(`^\\s*\\(${N}\\)\\s*$`),
    new RegExp(`^\\s*${N}(?:\\s{2,}|\\s*\\|\\s*)\\S`),
    new RegExp(`\\S(?:\\s{2,}|\\s*\\|\\s*)${N}\\s*$`),
    new RegExp(`^\\s*(?:page|p\\.)\\s*${N}\\b`, "i"),
    new RegExp(`\\bpage\\s+${N}(?:\\s+of\\s+\\d+)?\\s*$`, "i"),
  ];
  for (const line of edge) {
    for (const re of patterns) {
      const m = re.exec(line);
      if (!m) continue;
      const v = m[1];
      if (/^\d+$/.test(v)) out.add(String(Number.parseInt(v, 10)));
      else if (romanValue(v) !== null && v === v.toLowerCase()) out.add(v.toLowerCase());
    }
  }
  return [...out];
}

/**
 * Each page's printed number (pages of one volume, in order): a candidate is
 * kept when a page within four either side has the candidate that keeps the
 * same offset from the PDF page; a page with none, between kept pages (at most
 * six apart) whose offsets agree, is inferred.
 */
export function readPrinted(layouts: string[]): PrintedReading[] {
  const cands = layouts.map((l) =>
    numberCandidates(l).map((c) => ({ c, roman: !/^\d+$/.test(c), v: /^\d+$/.test(c) ? Number(c) : romanValue(c)! }))
  );
  const read: Array<{ v: number; roman: boolean } | null> = cands.map((list, p) => {
    let best: { v: number; roman: boolean } | null = null;
    let bestSupport = 0;
    let tie = false;
    for (const x of list) {
      let support = 0;
      for (let q = Math.max(0, p - 4); q <= Math.min(layouts.length - 1, p + 4); q++) {
        if (q === p) continue;
        if (cands[q].some((y) => y.roman === x.roman && y.v - x.v === q - p)) support++;
      }
      if (support > bestSupport) {
        best = { v: x.v, roman: x.roman };
        bestSupport = support;
        tie = false;
      } else if (support === bestSupport && support > 0) tie = true;
    }
    return bestSupport > 0 && !tie ? best : null;
  });
  const roman = (v: number) => {
    const table: Array<[number, string]> = [[100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "";
    for (const [n, r] of table) while (v >= n) (s += r), (v -= n);
    return s;
  };
  return read.map((r, p) => {
    if (r) return { number: r.roman ? roman(r.v) : String(r.v), inferred: false };
    let a = p - 1;
    while (a >= 0 && !read[a]) a--;
    let b = p + 1;
    while (b < read.length && !read[b]) b++;
    if (a < 0 || b >= read.length || b - a > 6) return { number: null, inferred: false };
    const ra = read[a]!;
    const rb = read[b]!;
    if (ra.roman !== rb.roman || ra.v - a !== rb.v - b) return { number: null, inferred: false };
    const v = ra.v + (p - a);
    return { number: ra.roman ? roman(v) : String(v), inferred: true };
  });
}

/** The served body (before `## Notes`) as words, with each marker's word position and each block's first word. */
export function parseServed(markdown: string): Served {
  const lines = markdown.split("\n");
  let i = 0;
  if (lines[0] === "---") {
    i = 1;
    while (i < lines.length && lines[i] !== "---") i++;
    i++;
  }
  const words: string[] = [];
  const markers: Marker[] = [];
  const boundaries: number[] = [];
  const contents: boolean[] = [];
  const lineOf: number[] = [];
  const take = (block: string[], at: number) => {
    const trimmed = block.join("\n").trim();
    if (!trimmed) return;
    const m = /^%%page ([^%#]+)(?:#(\d+))?%%$/.exec(trimmed);
    if (m) {
      markers.push({ label: m[1].toLowerCase(), occurrence: m[2] ? Number(m[2]) : undefined, pos: words.length, line: at });
      return;
    }
    boundaries.push(words.length);
    const entry = /^(?:- .* \u2014 [0-9ivxlcIVXLC.\-\u2013]+\s*)+$/.test(trimmed);
    contents.push(entry);
    const clean = trimmed.replace(/\[\^[^\]]*\]/g, " ").replace(/\{#[^}]*\}/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
    for (const w of wordsOf(clean)) {
      words.push(w);
      lineOf.push(at);
    }
  };
  let block: string[] = [];
  let at = i + 1;
  for (; i < lines.length; i++) {
    if (/^## Notes\s*$/.test(lines[i])) break;
    if (!lines[i].trim()) {
      take(block, at);
      block = [];
      at = i + 2;
      continue;
    }
    if (!block.length) at = i + 1;
    block.push(lines[i]);
  }
  take(block, at);
  boundaries.push(words.length);
  return { words, markers, boundaries, contents, lineOf };
}

/** Where each PDF page's text begins in the served words, or null where none of its shingles is unique to it. */
export function locatePages(served: string[], pages: string[][], boundaries: number[] = []): { starts: PageStart[]; attr: Int32Array } {
  const key = (ws: string[], i: number) => ws.slice(i, i + SHINGLE).join(" ");
  // a served shingle stays inside one block: "airports | The following" is not the PDF's "airports. The intelligence"
  const starts_ = new Uint8Array(served.length + 1);
  for (const b of boundaries) starts_[b] = 1;
  const inServed = new Map<string, number>();
  let crossing = 0;
  for (let i = 1; i < SHINGLE && i <= served.length; i++) crossing += starts_[i];
  for (let i = 0; i + SHINGLE <= served.length; i++) {
    if (i > 0) crossing += starts_[i + SHINGLE - 1] - starts_[i];
    if (crossing) continue;
    const k = key(served, i);
    inServed.set(k, inServed.has(k) ? -1 : i);
  }
  const onPages = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (let i = 0; i + SHINGLE <= page.length; i++) {
      const k = key(page, i);
      if (seen.has(k) || !inServed.has(k)) continue;
      seen.add(k);
      onPages.set(k, (onPages.get(k) ?? 0) + 1);
    }
  }
  // every served word inside a shingle unique to one page (and to the served body) belongs to that page
  const attr = new Int32Array(served.length).fill(-1);
  const starts = pages.map((page, p) => {
    const hits: Array<{ i: number; at: number }> = [];
    for (let i = 0; i + SHINGLE <= page.length; i++) {
      const k = key(page, i);
      const at = inServed.get(k);
      if (at === undefined || at < 0 || onPages.get(k) !== 1) continue;
      hits.push({ i, at });
      for (let d = 0; d < SHINGLE; d++) attr[at + d] = p;
    }
    if (!hits.length) return { start: null, lead: page.length } as PageStart;
    // A stray match (a running head that is also a heading, a caption printed twice) is not where
    // the page is: only runs of matches count, clusters of hits within CLUSTER words of each other.
    const byAt = [...hits].sort((a, b) => a.at - b.at);
    const clusters: Array<typeof hits> = [];
    for (const h of byAt) {
      const last = clusters[clusters.length - 1];
      if (last && h.at - last[last.length - 1].at <= CLUSTER) last.push(h);
      else clusters.push([h]);
    }
    const need = Math.min(3, hits.length, Math.max(1, Math.ceil(hits.length * 0.1)));
    const first = clusters
      .filter((c) => c.length >= need)
      .map((c) => c.reduce((a, b) => (b.i < a.i ? b : a)))
      .reduce((a, b) => (b.i < a.i ? b : a));
    let s = first.at;
    let j = first.i;
    while (j > 0 && s > 0 && page[j - 1] === served[s - 1]) (j--, s--);
    for (let d = s; d < first.at; d++) attr[d] = p;
    return { start: s, lead: j } as PageStart;
  });
  return { starts, attr };
}

function boundaryAfter(boundaries: number[], w: number): number {
  let lo = 0;
  let hi = boundaries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (boundaries[mid] > w) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function labelOf(scheme: Scheme, pages: PageText[], printed: PrintedReading[], p: number): string | null {
  if (scheme === "printed") return printed[p].number;
  if (scheme === "pdf-volume") return String(pages[p].pdfIndex);
  return String(p + 1);
}

function judge(served: Served, pages: PageText[], starts: PageStart[], attr: Int32Array, printed: PrintedReading[], scheme: Scheme): MarkerVerdict[] {
  const byLabel = new Map<string, number[]>();
  pages.forEach((_, p) => {
    const label = labelOf(scheme, pages, printed, p);
    if (label === null || starts[p].start === null) return;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)!.push(p);
  });
  const located = pages.map((_, p) => p).filter((p) => starts[p].start !== null);
  const B = served.boundaries;
  return served.markers.map((marker) => {
    const candidates = byLabel.get(marker.label) ?? [];
    const base = { label: marker.label + (marker.occurrence ? `#${marker.occurrence}` : ""), line: marker.line };
    if (!candidates.length) return { ...base, verdict: "unlocated" as const };
    const m = marker.pos;
    const p = candidates.reduce((a, b) => (Math.abs(starts[b].start! - m) < Math.abs(starts[a].start! - m) ? b : a));
    const w = starts[p].start!;
    const delta = m - w;
    const page = { volume: pages[p].volume, pdfIndex: pages[p].pdfIndex };
    // the last served word before the page's first that the PDF prints on another page
    let prevEnd = w - 1;
    while (prevEnd >= 0 && (attr[prevEnd] < 0 || attr[prevEnd] === p)) prevEnd--;
    // exact: in the gap between the previous page's last word and this page's first
    if (m > prevEnd && m <= w) return { ...base, verdict: "exact" as const, page, delta };
    // block: the page begins inside a block, and the marker sits at that block's start, or after
    // its end and any blocks after it the PDF prints on earlier pages
    const after = boundaryAfter(B, w);
    const blockStart = B[after - 1] ?? 0;
    // (or cannot tell: the block's words before the page's first are on no page we could find, as in a
    // table the text layer reads column by column)
    let unknown = blockStart < w;
    for (let k = blockStart; k < w && unknown; k++) if (attr[k] >= 0) unknown = false;
    const spans = blockStart <= prevEnd || unknown;
    if (spans && m === blockStart) return { ...base, verdict: "block" as const, page, delta };
    if (spans && m > w && B.includes(m) && m >= B[after]) {
      let earlier = true;
      for (let k = B[after]; k < m && earlier; k++) if (attr[k] >= p) earlier = false;
      if (earlier) return { ...base, verdict: "block" as const, page, delta };
    }
    const near = located.reduce((a, b) => (Math.abs(starts[b].start! - m) < Math.abs(starts[a].start! - m) ? b : a), located[0]);
    const at = Math.min(Math.max(m, 0), served.words.length - 1);
    return {
      ...base,
      verdict: "wrong" as const,
      page,
      delta,
      nearest: near === undefined ? null : labelOf(scheme, pages, printed, near),
      context: served.words.slice(at, at + 8).join(" "),
    };
  });
}

function judgeBlocks(served: Served, pages: PageText[], attr: Int32Array, printed: PrintedReading[], scheme: Scheme, unmarked: Set<number>): AnchorReport["blocks"] {
  const out: AnchorReport["blocks"] = { checked: 0, right: 0, wrong: 0, onUnmarked: 0, unlocated: 0, wrongBlocks: [] };
  const B = served.boundaries;
  let mi = 0;
  let current: Marker | undefined;
  for (let b = 0; b + 1 < B.length; b++) {
    const start = B[b];
    const end = B[b + 1];
    while (mi < served.markers.length && served.markers[mi].pos <= start) current = served.markers[mi++];
    if (end - start < 8 || !current || served.contents[b]) continue;
    out.checked++;
    // the first run of 8 words (or the whole block) the PDF prints on one page
    const limit = Math.min(end, start + 30);
    const need = Math.min(8, end - start);
    let k = start;
    let found = -1;
    while (k < limit && found < 0) {
      if (attr[k] < 0) {
        k++;
        continue;
      }
      let r = k;
      while (r < end && attr[r] === attr[k]) r++;
      if (r - k >= need) found = k;
      k = r;
    }
    if (found < 0) {
      out.unlocated++;
      continue;
    }
    k = found;
    const label = labelOf(scheme, pages, printed, attr[k]);
    if (label === null) {
      out.unlocated++;
      continue;
    }
    // a block opening in the last line of a page: its first words, too few for the run, are on the marker's page
    let lead = false;
    for (let j = start; j < found && !lead; j++) if (attr[j] >= 0 && labelOf(scheme, pages, printed, attr[j]) === current.label) lead = true;
    if (label === current.label || lead) {
      out.right++;
      continue;
    }
    out.wrong++;
    const unmarkedPage = unmarked.has(attr[k]);
    if (unmarkedPage) out.onUnmarked++;
    out.wrongBlocks.push({ line: served.lineOf[start], marker: current.label, printedOn: label, text: served.words.slice(start, start + 8).join(" "), unmarkedPage });
  }
  return out;
}

/** The whole check: pages of every volume in reading order, the served markdown. */
export function checkAnchors(markdown: string, pages: PageText[]): AnchorReport {
  const served = parseServed(markdown);
  const printed: PrintedReading[] = [];
  const volumes = [...new Set(pages.map((p) => p.volume))];
  for (const v of volumes) printed.push(...readPrinted(pages.filter((p) => p.volume === v).map((p) => p.layout)));
  const { starts, attr } = locatePages(served.words, pages.map((p) => wordsOf(p.words)), served.boundaries);
  const schemes = {} as Record<Scheme, number>;
  let best: { scheme: Scheme; verdicts: MarkerVerdict[]; ok: number } | null = null;
  for (const scheme of ["printed", "pdf-volume", "pdf-global"] as Scheme[]) {
    if (scheme === "pdf-global" && volumes.length === 1) continue;
    const verdicts = judge(served, pages, starts, attr, printed, scheme);
    const ok = verdicts.filter((v) => v.verdict === "exact" || v.verdict === "block").length;
    schemes[scheme] = ok;
    if (!best || ok > best.ok) best = { scheme, verdicts, ok };
  }
  const { scheme, verdicts } = best!;
  const named = new Set(verdicts.filter((v) => v.page).map((v) => `${v.page!.volume}:${v.page!.pdfIndex}`));
  const positions = served.markers.map((m) => m.pos);
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  const unmarkedPages = pages
    .map((page, p) => ({ page, p, label: labelOf(scheme, pages, printed, p) }))
    .filter(({ page, p, label }) => {
      const s = starts[p].start;
      return label !== null && s !== null && s > lo && s < hi && starts[p].lead <= 40 && !named.has(`${page.volume}:${page.pdfIndex}`);
    });
  const unmarked = unmarkedPages.map(({ page, label }) => ({ volume: page.volume, pdfIndex: page.pdfIndex, label: label! }));
  const blocks = judgeBlocks(served, pages, attr, printed, scheme, new Set(unmarkedPages.map((u) => u.p)));
  const after = (i: number) => verdicts[i].verdict === "block" && (verdicts[i].delta ?? 0) > 0;
  const stacked = verdicts.filter((_, i) => i > 0 && after(i) && after(i - 1) && served.markers[i].pos === served.markers[i - 1].pos).length;
  const count = (k: MarkerVerdict["verdict"]) => verdicts.filter((v) => v.verdict === k).length;
  return {
    scheme,
    blocks,
    markers: verdicts.length,
    exact: count("exact"),
    block: count("block"),
    wrong: count("wrong"),
    unlocated: count("unlocated"),
    stacked,
    unmarked,
    pagesRead: printed.filter((r) => r.number !== null && !r.inferred).length,
    pagesInferred: printed.filter((r) => r.inferred).length,
    pagesLocated: starts.filter((s) => s.start !== null).length,
    pages: pages.length,
    verdicts,
    schemes,
  };
}
