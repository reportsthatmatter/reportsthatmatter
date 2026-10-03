/**
 * Verify one page of vision-model output against the PDF's own text layer (reportsthatmatter-kyj3).
 *
 * The vision model is trusted for STRUCTURE only (paragraph breaks, headings, list items, footnotes
 * apart from body, marker positions) and never for words. The model's words are aligned to the
 * layer's with the scorer's aligner; a block is accepted when its words agree with the layer's, and the
 * accepted block carries the LAYER's words. A block that disagrees is kept as plain layer text and
 * flagged; layer words the model never reached (it dropped a line) are kept and flagged too. The
 * page's status says which of the three happened.
 */
import { align } from "../score/align";
import { tokens, type Token } from "../score/tokens";
import { rejoinHyphenated, vocabulary } from "@rtm/ingest";
import { assignMarkers, type VisionBlock } from "./doctags";

export type VerifiedBlock = {
  type: VisionBlock["type"];
  level?: number;
  /** the layer's words for this block's span (original characters, whitespace collapsed) */
  text: string;
  /** the model's text for the block */
  visionText: string;
  /** accepted: the model's structure is used for this span */
  accepted: boolean;
  /** share of the model's words that are the layer's words (exact, in order) */
  agreement: number;
  /** longest run of the model's words with no counterpart in the layer */
  maxRun: number;
  label?: string;
  /** index into the model's non-furniture blocks (absent for a stretch the model dropped) */
  src?: number;
  /** share of the span's layer words set in the footnote size (when the layout was given) */
  noteShare?: number;
  /** a short block vouched for by its neighbours and the size of the gap between them, not by its own words (the layer garbled them) */
  anchored?: boolean;
  /** the model's tag was overruled by the layout: "paragraph>footnote" */
  retyped?: string;
  /** layer token range [lo, hi) */
  span: [number, number];
  /** markers, placed at the layer token (index into the layer's tokens) they sit on */
  markers: { label: string; token: number; garbled?: boolean }[];
  /** why a block was not accepted */
  reason?: string;
};

export type VerifiedPage = {
  status: "accepted" | "partial" | "flagged";
  layerWords: number;
  visionWords: number;
  /** layer words with an equal word in the model's output / all layer words (furniture at the page's ends excluded) */
  coverage: number;
  /** runs of 4+ layer words inside the page's span that the model's output lacks (a dropped line) */
  missing: { at: number; words: string; length: number }[];
  /** blocks of the model's output in layer order, accepted or not; layer stretches the model dropped appear as type "other", accepted false */
  blocks: VerifiedBlock[];
  flags: string[];
};

export type VerifyOptions = {
  /** a block is accepted at this share of its words matching (default 0.9) */
  minAgreement?: number;
  /** ... and no run of unmatched words longer than this (default 4) */
  maxRun?: number;
  /** runs of missing layer words this long or longer are a dropped line (default 4) */
  missingRun?: number;
  /** unmatched layer words at the very start or end of the page this short are page furniture (default 6) */
  furniture?: number;
  /** character ranges [start, end) of `layerText` that are footnote lines in the layout (size below 0.9 of the page's body) */
  noteRanges?: [number, number][];
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function verifyPage(vision: VisionBlock[], layerText: string, opts: VerifyOptions = {}): VerifiedPage {
  const minAgree = opts.minAgreement ?? 0.9;
  const maxRunOk = opts.maxRun ?? 4;
  const missingRun = opts.missingRun ?? 4;
  const furn = opts.furniture ?? 6;

  const lt: Token[] = tokens(layerText);
  const L = lt.map((t) => t.word);
  const content = vision.filter((b) => b.type !== "furniture");
  const V: string[] = [];
  const owner: number[] = [];
  const vtoks: Token[][] = content.map((b) => tokens(b.text));
  content.forEach((_, i) => {
    for (const t of vtoks[i]) {
      V.push(t.word);
      owner.push(i);
    }
  });
  const al = align(V, L);
  const isNoteTok = (k: number) => !!opts.noteRanges?.some(([a, b]) => lt[k].start >= a && lt[k].start < b);

  // per block
  const starts: number[] = [];
  let o = 0;
  for (const t of vtoks) {
    starts.push(o);
    o += t.length;
  }
  type Draft = { b: VisionBlock; i: number; lo: number; hi: number; agreement: number; maxRun: number; aligned: number; anchored?: boolean };
  const drafts: Draft[] = [];
  let prevHi = 0;
  content.forEach((b, i) => {
    const n = vtoks[i].length;
    let aligned = 0;
    let run = 0;
    let maxRun = 0;
    let first = -1;
    let last = -1;
    let leading = 0;
    let trailing = 0;
    for (let k = 0; k < n; k++) {
      const j = al.map[starts[i] + k];
      if (j >= 0) {
        aligned++;
        run = 0;
        if (first < 0) {
          first = j;
          leading = k;
        }
        last = j;
        trailing = n - 1 - k;
      } else {
        run++;
        if (run > maxRun) maxRun = run;
      }
    }
    if (first < 0) {
      drafts.push({ b, i, lo: prevHi, hi: prevHi, agreement: 0, maxRun: n, aligned: 0 });
      return;
    }
    const lo = Math.max(prevHi, first - leading);
    const hi = Math.min(L.length, Math.max(lo, last + 1 + trailing));
    prevHi = hi;
    drafts.push({ b, i, lo, hi, agreement: n ? aligned / n : 0, maxRun, aligned });
  });

  // A short block (a heading, "Ibid.", a one-line note) whose few words the layer garbled ("II." read "11.", "Ibid." read
  // "bid") cannot be vouched for by its own words, but it can by its neighbours: when the blocks either side agree and the
  // layer holds about as many words in the gap between them as the block (or run of such blocks) has, the gap is the block.
  // The gap's layer words are used, as ever; the block is marked `anchored`.
  const okDraft = (d: Draft) => d.aligned > 0 && d.agreement >= minAgree && d.maxRun <= maxRunOk;
  const SHORT = 8;
  for (let i = 0; i < drafts.length; ) {
    if (okDraft(drafts[i]) || vtoks[drafts[i].i].length > SHORT) {
      i++;
      continue;
    }
    let j = i;
    while (j < drafts.length && !okDraft(drafts[j]) && vtoks[drafts[j].i].length <= SHORT) j++;
    const prev = drafts[i - 1];
    const next = drafts[j];
    const run = drafts.slice(i, j);
    const sum = run.reduce((a, d) => a + vtoks[d.i].length, 0);
    if ((prev || next) && (!prev || okDraft(prev)) && (!next || okDraft(next))) {
      const lo = prev ? prev.hi : 0;
      const hi = next ? next.lo : L.length;
      const slack = 2 * run.length + 1;
      if (hi - lo >= Math.max(1, sum - slack) && hi - lo <= sum + slack + 1) {
        let c = 0;
        for (const d of run) {
          const a = lo + Math.round(((hi - lo) * c) / sum);
          c += vtoks[d.i].length;
          d.lo = a;
          d.hi = lo + Math.round(((hi - lo) * c) / sum);
          d.anchored = true;
        }
      }
    }
    i = j;
  }

  // layer words with no match, as runs; furniture at the page ends is not a drop
  const covered = new Uint8Array(L.length);
  for (let j = 0; j < L.length; j++) covered[j] = al.inv[j] >= 0 ? 1 : 0;
  const firstHit = covered.indexOf(1);
  const lastHit = covered.lastIndexOf(1);
  const missing: VerifiedPage["missing"] = [];
  let runStart = -1;
  const flush = (end: number) => {
    if (runStart < 0) return;
    const len = end - runStart;
    const atEdge = runStart <= firstHit || end > lastHit; // before the first or after the last match
    if (len >= (atEdge ? furn + 1 : missingRun)) missing.push({ at: runStart, words: L.slice(runStart, Math.min(end, runStart + 12)).join(" "), length: len });
    runStart = -1;
  };
  for (let j = 0; j < L.length; j++) {
    if (!covered[j]) {
      if (runStart < 0) runStart = j;
    } else flush(j);
  }
  flush(L.length);

  const anchoredSpans = drafts.filter((d) => d.anchored).map((d) => [d.lo, d.hi] as const);
  for (let k = missing.length - 1; k >= 0; k--) if (anchoredSpans.some(([a, b]) => missing[k].at >= a && missing[k].at < b)) missing.splice(k, 1);
  const textOf = (lo: number, hi: number) => (hi > lo ? norm(layerText.slice(lt[lo].start, lt[hi - 1].end)) : "");
  const missingIn = (lo: number, hi: number) => missing.filter((m) => m.at >= lo && m.at < hi);

  const blocks: VerifiedBlock[] = drafts.map((d) => {
    const reasons: string[] = [];
    if (d.anchored) {
      // vouched for by its neighbours, not by its own words
    } else if (d.agreement < minAgree) reasons.push(`only ${(d.agreement * 100).toFixed(0)}% of its words are in the text layer`);
    if (!d.anchored && d.maxRun > maxRunOk) reasons.push(`a run of ${d.maxRun} words not in the text layer`);
    const inner = d.anchored ? [] : missingIn(d.lo, d.hi);
    if (inner.length) reasons.push(`the text layer has ${inner.reduce((s, m) => s + m.length, 0)} words inside this block that the model lacks`);
    const accepted = reasons.length === 0 && d.hi > d.lo;
    const markers = d.b.markers
      .map((m) => {
        // the model's token at the marker's offset
        const k = vtoks[d.i].findIndex((t) => t.start >= m.offset);
        if (k < 0) return null;
        let j = al.map[starts[d.i] + k];
        const garbled = j < 0; // the model read the marker's digits, the layer printed something else ("g" for 9): the layer's token is the marker
        if (j < 0) {
          // nearest aligned neighbour, then step to the marker's place
          let back = k - 1;
          while (back >= 0 && al.map[starts[d.i] + back] < 0) back--;
          j = back >= 0 ? al.map[starts[d.i] + back] + (k - back) : d.lo;
        }
        return { label: m.label, token: Math.min(Math.max(j, d.lo), Math.max(d.lo, d.hi - 1)), ...(garbled ? { garbled: true } : {}) };
      })
      .filter((x): x is { label: string; token: number; garbled?: boolean } => x !== null);
    const vb: VerifiedBlock = {
      type: d.b.type,
      text: textOf(d.lo, d.hi),
      visionText: d.b.text,
      accepted,
      agreement: Number(d.agreement.toFixed(3)),
      maxRun: d.maxRun,
      span: [d.lo, d.hi],
      markers,
      src: d.i,
    };
    if (d.anchored) vb.anchored = true;
    if (opts.noteRanges && d.hi > d.lo) {
      let n = 0;
      for (let k = d.lo; k < d.hi; k++) if (isNoteTok(k)) n++;
      vb.noteShare = Number((n / (d.hi - d.lo)).toFixed(2));
    }
    if (d.b.level !== undefined) vb.level = d.b.level;
    if (d.b.label) vb.label = d.b.label;
    if (reasons.length) vb.reason = reasons.join("; ");
    return vb;
  });

  // layer stretches the model dropped: keep them, as flagged text, in place
  for (const m of missing) {
    const hiEnd = (() => {
      let e = m.at;
      while (e < L.length && !covered[e]) e++;
      return e;
    })();
    const atEdge = m.at <= firstHit || hiEnd > lastHit;
    if (atEdge) continue;
    const dropped: VerifiedBlock = { type: "other", text: textOf(m.at, hiEnd), visionText: "", accepted: false, agreement: 0, maxRun: m.length, span: [m.at, hiEnd], markers: [], reason: "layer words the model dropped" };
    if (opts.noteRanges) {
      let n = 0;
      for (let k = m.at; k < hiEnd; k++) if (isNoteTok(k)) n++;
      dropped.noteShare = Number((n / (hiEnd - m.at)).toFixed(2));
    }
    blocks.push(dropped);
  }
  blocks.sort((a, b) => a.span[0] - b.span[0] || a.span[1] - b.span[1]);

  const interior = L.length - Math.max(0, firstHit) - Math.max(0, L.length - 1 - lastHit);
  const hits = covered.reduce((s, x) => s + x, 0);
  const coverage = interior > 0 ? hits / interior : 0;
  const flags: string[] = [];
  const rejected = blocks.filter((b) => !b.accepted);
  for (const b of rejected) flags.push(`${b.type} "${(b.text || b.visionText).slice(0, 50)}": ${b.reason}`);
  const status: VerifiedPage["status"] = blocks.length === 0 ? "flagged" : rejected.length === 0 ? "accepted" : rejected.length === blocks.length ? "flagged" : "partial";
  return { status, layerWords: L.length, visionWords: V.length, coverage: Number(coverage.toFixed(4)), missing, blocks, flags };
}

/** Render a verified page as Markdown: accepted blocks with the model's structure, the rest as `??`-prefixed layer text. */
export function renderVerified(page: VerifiedPage, layerText: string): string {
  const lt = tokens(layerText);
  const withMarkers = (b: VerifiedBlock) => {
    if (!b.markers.length || b.span[1] <= b.span[0]) return b.text;
    // rebuild from layer tokens so markers can be written as [^n] at the token they sit on
    let out = "";
    let pos = lt[b.span[0]].start;
    const byTok = new Map<number, string[]>();
    for (const m of b.markers) byTok.set(m.token, [...(byTok.get(m.token) ?? []), m.label]);
    for (let j = b.span[0]; j < b.span[1]; j++) {
      const labels = byTok.get(j);
      if (labels) {
        const t = lt[j];
        const isDigits = (/^\d+$/.test(t.word) && labels.includes(t.word)) || b.markers.some((m) => m.token === j && m.garbled);
        out += layerText.slice(pos, t.start);
        out += isDigits ? labels.map((l) => `[^${l}]`).join("") : layerText.slice(t.start, t.end) + labels.map((l) => `[^${l}]`).join("");
        pos = t.end;
      }
    }
    out += layerText.slice(pos, lt[b.span[1] - 1].end);
    return norm(out);
  };
  return (
    page.blocks
      .map((b) => {
        const t = withMarkers(b);
        if (!b.accepted) return `?? ${t || b.visionText}`;
        if (b.type === "heading") return `${"#".repeat(Math.min(b.level ?? 2, 6))} ${t}`;
        if (b.type === "list_item") return `- ${t}`;
        if (b.type === "footnote") return `[^${b.label ?? "?"}]: ${t.replace(/^\s*\d{1,4}\s*/, "")}`;
        return t;
      })
      .join("\n\n") + "\n"
  );
}

/**
 * The layout as a second, independent witness for one structural claim the words cannot check: which
 * blocks are footnotes. The model tags notes inconsistently (on Jack Smith p13 it left four notes as
 * ordinary text), but the layout knows which lines are set in the note size. A block whose layer words
 * are 70% or more note-size lines becomes a footnote, a "footnote" under 30% becomes body text; the
 * markers are found again with the corrected labels and the page is verified once more.
 */
export function verifyWithLayout(visionIn: VisionBlock[], lines: { text: string; note?: boolean }[], opts: VerifyOptions = {}): VerifiedPage & { layerText: string } {
  const vision = visionIn.map((b) => ({ ...b, markers: [...b.markers] }));
  let layerText = "";
  const noteRanges: [number, number][] = [];
  for (const l of lines) {
    const start = layerText.length;
    layerText += l.text + "\n";
    if (l.note) noteRanges.push([start, layerText.length]);
  }
  const first = verifyPage(vision, layerText, { ...opts, noteRanges });
  const content = vision.filter((b) => b.type !== "furniture");
  let changed = 0;
  for (const vb of first.blocks) {
    if (vb.src === undefined || vb.noteShare === undefined || vb.span[1] - vb.span[0] < 3) continue;
    const b = content[vb.src];
    if ((b.type === "paragraph" || b.type === "list_item") && vb.noteShare >= 0.7) {
      b.type = "footnote";
      changed++;
    } else if (b.type === "footnote" && vb.noteShare <= 0.3) {
      b.type = "paragraph";
      changed++;
    }
  }
  if (!changed) return { ...first, layerText };
  assignMarkers(content);
  const second = verifyPage(vision, layerText, { ...opts, noteRanges });
  for (const vb of second.blocks) {
    if (vb.src === undefined) continue;
    const orig = first.blocks.find((x) => x.src === vb.src);
    if (orig && orig.type !== vb.type) vb.retyped = `${orig.type}>${vb.type}`;
  }
  return { ...second, layerText };
}

/**
 * Footnote lines of one page from the layout: the trailing run of lines (a printed page number below
 * them aside) set at 0.88 of the document's body size (`modal`: the size most characters are set in over the whole PDF; a page of mostly notes would otherwise make the notes its own modal) or less. Unlike `prepareLayout`'s rule this has no
 * "lower half of the page" condition: on a note-heavy page (Jack Smith p13) the notes start high.
 */
export function noteLines<T extends { text: string; size: number; top: number; left: number; pageHeight: number }>(page: T[], modal: number): (T & { note: boolean })[] {
  const out = page.map((l) => ({ ...l, note: false }));
  const tail = [...out].sort((a, b) => b.top - a.top || b.left - a.left);
  let n = 0;
  for (const l of tail) {
    if (l.size <= 0.88 * modal) {
      l.note = true;
      n++;
    } else if (l.text.trim().length < 6) continue; // a page number, or OCR noise the size of a stray mark
    else break;
  }
  if (n < 1) for (const l of out) l.note = false;
  return out;
}

/**
 * Words the typesetter broke across a line ("technologi-" / "cal") are whole again before the check, by
 * the pipeline's own rule (`rejoinHyphenated`, decided from the document's vocabulary), so a line-end
 * hyphen is not counted as a word the model got wrong. The joined word moves to the first line; the lines
 * keep their order and their note flags.
 */
export function rejoinLineHyphens<T extends { text: string }>(lines: T[], vocab: Set<string>): T[] {
  const out = lines.map((l) => ({ ...l }));
  for (let i = 0; i + 1 < out.length; i++) {
    const head = /([A-Za-zÀ-ÿ]{2,})[-­‐]\s*$/.exec(out[i].text);
    const tail = /^\s*([a-zà-ÿ][A-Za-zÀ-ÿ]*)/.exec(out[i + 1].text);
    if (!head || !tail) continue;
    const joined = rejoinHyphenated(`${head[1]}- ${tail[1]}`, vocab);
    if (joined !== `${head[1]}${tail[1]}`) continue; // kept hyphenated, or unknown either way: leave both lines alone
    out[i].text = out[i].text.slice(0, head.index) + joined;
    out[i + 1].text = out[i + 1].text.slice(tail[0].length);
  }
  return out;
}

export const layerVocabulary = (lines: { text: string }[]) => vocabulary(lines.map((l) => l.text).join("\n"));
