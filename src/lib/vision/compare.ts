/**
 * Compare page texts from different sources against a hand-checked page (reportsthatmatter-kyj3).
 *
 * Every source becomes a PageDoc: blocks in reading order (headings, paragraphs, list items, then the
 * page's notes), footnote markers kept apart from the words at the position they sit. Metrics against the
 * checked page: word error rate (semi-global: the source's stretch may be longer at either end, so a
 * paragraph running over the page edge is not an error), block-start precision and recall (a start
 * counts when it maps to the reference's within two words), heading and note-block starts the same
 * way, and marker precision and recall (same label, within one word).
 */
import { tokens } from "../score/tokens";

export type DocBlock = { kind: "heading" | "paragraph" | "list" | "note"; text: string; markers: { label: string; offset: number }[]; label?: string };
export type PageDoc = { blocks: DocBlock[] };

/** Text with `[^n]` markers cut out, and where they were (character offsets into the cut text). */
export function splitMarkers(raw: string): { text: string; markers: { label: string; offset: number }[] } {
  const markers: { label: string; offset: number }[] = [];
  let text = "";
  let last = 0;
  for (const m of raw.matchAll(/\[\^([^\]\s]+)\]/g)) {
    text += raw.slice(last, m.index!);
    markers.push({ label: m[1], offset: text.length });
    last = m.index! + m[0].length;
  }
  text += raw.slice(last);
  return { text, markers };
}

/** A reference page as kept in reference/page-text/: `<label>.txt` blocks apart by blank lines, `# ` headings, `- ` list items, `[^n]` markers; `<label>.notes.txt` one `[^n]: text` per line. */
export function parsePageText(body: string, notes = ""): PageDoc {
  const blocks: DocBlock[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const t = chunk.trim();
    if (!t) continue;
    const h = /^(#{1,6})\s+([\s\S]*)$/.exec(t);
    const li = /^-\s+([\s\S]*)$/.exec(t);
    const kind = h ? "heading" : li ? "list" : "paragraph";
    const { text, markers } = splitMarkers((h ? h[2] : li ? li[1] : t).replace(/\s+/g, " "));
    blocks.push({ kind, text, markers });
  }
  for (const line of notes.split("\n")) {
    const m = /^\[\^([^\]\s]+)\]:\s*([\s\S]*)$/.exec(line.trim());
    if (m) blocks.push({ kind: "note", text: m[2].replace(/\s+/g, " "), markers: [], label: m[1] });
  }
  return { blocks };
}

export type Flat = { words: string[]; starts: { idx: number; kind: DocBlock["kind"] }[]; markers: { label: string; idx: number }[] };

export function flatten(doc: PageDoc): Flat {
  const words: string[] = [];
  const starts: Flat["starts"] = [];
  const markers: Flat["markers"] = [];
  for (const b of doc.blocks) {
    const toks = tokens(b.text);
    if (!toks.length) continue;
    starts.push({ idx: words.length, kind: b.kind });
    for (const m of b.markers) markers.push({ label: m.label, idx: words.length + toks.filter((t) => t.start < m.offset).length });
    for (const t of toks) words.push(t.word);
  }
  return { words, starts, markers };
}

type Edit = { sub: number; del: number; ins: number; insNum: number; map: Int32Array; start: number; end: number };

/** Semi-global alignment: all of `ref`, any stretch of `hyp`. map[h] = reference index of hyp word h (diagonal moves), or -1. */
export function editAlign(ref: string[], hyp: string[]): Edit {
  const m = ref.length;
  const n = hyp.length;
  const W = n + 1;
  const D = new Int32Array((m + 1) * W);
  const T = new Uint8Array((m + 1) * W);
  for (let i = 1; i <= m; i++) {
    D[i * W] = i;
    T[i * W] = 1;
  }
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const diag = D[(i - 1) * W + j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      const up = D[(i - 1) * W + j] + 1;
      const left = D[i * W + j - 1] + 1;
      let best = diag;
      let t = 0;
      if (up < best) (best = up), (t = 1);
      if (left < best) (best = left), (t = 2);
      D[i * W + j] = best;
      T[i * W + j] = t;
    }
  let j = 0;
  for (let k = 0; k <= n; k++) if (D[m * W + k] < D[m * W + j]) j = k;
  const end = j;
  let i = m;
  const map = new Int32Array(n).fill(-1);
  let sub = 0, del = 0, ins = 0, insNum = 0;
  while (i > 0) {
    const t = j === 0 ? 1 : T[i * W + j];
    if (t === 0) {
      map[j - 1] = i - 1;
      if (ref[i - 1] !== hyp[j - 1]) sub++;
      i--;
      j--;
    } else if (t === 1) {
      del++;
      i--;
    } else {
      ins++;
      if (/^\d+$/.test(hyp[j - 1])) insNum++;
      j--;
    }
  }
  return { sub, del, ins, insNum, map, start: j, end };
}

export type PageMetrics = {
  refWords: number;
  hypWords: number;
  errors: number;
  errorsNoNum: number;
  boundaries: [number, number, number]; // tp, hyp, ref
  headings: [number, number, number];
  notes: [number, number, number];
  markers: [number, number, number];
};

function matchCount(refIdx: number[], hypIdx: number[], tol: number): number {
  const used = new Set<number>();
  let tp = 0;
  for (const h of hypIdx) {
    let best = -1;
    let bd = tol + 1;
    refIdx.forEach((r, k) => {
      if (used.has(k)) return;
      const d = Math.abs(r - h);
      if (d < bd) (bd = d), (best = k);
    });
    if (best >= 0) (used.add(best), tp++);
  }
  return tp;
}

/** One stream (the body, or the notes) against its reference. `skipFirst`: the first block's start is not a decision (the page may open mid-paragraph). */
function stream(R: Flat, H: Flat, skipFirst: boolean, structure: boolean) {
  const empty = R.words.length === 0;
  const e = empty ? { sub: 0, del: 0, ins: H.words.length, insNum: 0, map: new Int32Array(H.words.length).fill(-1), start: 0, end: H.words.length } : editAlign(R.words, H.words);
  const toRef = (h: number) => {
    for (let k = h; k < Math.min(H.words.length, h + 3); k++) if (e.map[k] >= 0) return e.map[k] - (k - h);
    for (let k = h - 1; k >= Math.max(0, h - 3); k--) if (e.map[k] >= 0) return e.map[k] + (h - k);
    return null;
  };
  const refStarts = skipFirst ? R.starts.slice(1) : R.starts;
  const hypStarts = H.starts.map((s) => ({ ...s, r: toRef(s.idx) })).filter((s) => (skipFirst ? s.idx > e.start : s.idx >= e.start) && s.r !== null);
  const one = (sel: (k: DocBlock["kind"]) => boolean, tol = 2): [number, number, number] => {
    if (!structure) return [0, 0, 0];
    const rs = refStarts.filter((s) => sel(s.kind)).map((s) => s.idx);
    const hs = hypStarts.filter((s) => sel(s.kind)).map((s) => s.r as number);
    return [matchCount(rs, hs, tol), hs.length, rs.length];
  };
  const mk = ((): [number, number, number] => {
    if (!structure) return [0, 0, 0];
    const used = new Set<number>();
    let tp = 0;
    let hn = 0;
    for (const m of H.markers) {
      const r = toRef(m.idx);
      if (r === null || m.idx < e.start || m.idx > e.end) continue;
      hn++;
      const k = R.markers.findIndex((x, i) => !used.has(i) && x.label === m.label && Math.abs(x.idx - r) <= 1);
      if (k >= 0) (used.add(k), tp++);
    }
    return [tp, hn, R.markers.length];
  })();
  return { refWords: R.words.length, hypWords: H.words.length, errors: e.sub + e.del + e.ins, insNum: e.insNum, boundaries: one(() => true), headings: one((k) => k === "heading", 3), notes: one((k) => k === "note"), markers: mk };
}

/** Body and notes are scored as two streams, each free at both ends: a note that began on the page before (or runs on to the next) is printed whole by some sources and in part by others. */
export function comparePage(ref: PageDoc, hyp: PageDoc, opts: { structure?: boolean; combined?: boolean } = {}): PageMetrics {
  const structure = opts.structure !== false;
  if (opts.combined) {
    // one stream: for a source that has no notion of notes (the text layer)
    const one = (d: PageDoc) => flatten({ blocks: d.blocks.map((b) => ({ ...b, kind: b.kind === "note" ? "paragraph" : b.kind })) });
    const r = stream(one(ref), one(hyp), true, false);
    return { refWords: r.refWords, hypWords: r.hypWords, errors: r.errors, errorsNoNum: r.errors - r.insNum, boundaries: [0, 0, 0], headings: [0, 0, 0], notes: [0, 0, 0], markers: [0, 0, 0] };
  }
  const split = (d: PageDoc) => [flatten({ blocks: d.blocks.filter((b) => b.kind !== "note") }), flatten({ blocks: d.blocks.filter((b) => b.kind === "note") })] as const;
  const [rb, rn] = split(ref);
  const [hb, hn] = split(hyp);
  const a = stream(rb, hb, true, structure);
  const b = stream(rn, hn, false, structure);
  const add = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
  const errors = a.errors + b.errors;
  return {
    refWords: a.refWords + b.refWords,
    hypWords: a.hypWords + b.hypWords,
    errors,
    errorsNoNum: errors - a.insNum - b.insNum,
    boundaries: add(a.boundaries, b.boundaries),
    headings: a.headings,
    notes: b.notes,
    markers: a.markers,
  };
}

export const prf = ([tp, h, r]: [number, number, number]) => {
  const p = h ? tp / h : NaN;
  const rc = r ? tp / r : NaN;
  return { p, r: rc, f1: p + rc ? (2 * p * rc) / (p + rc) : NaN };
};

// — Sources as PageDocs —

import { align } from "../score/align";
import type { VisionBlock } from "./doctags";
import type { VerifiedPage } from "./verify";

const cut = (text: string, markers: { label: string; offset: number }[]) => {
  // lift the marker's own digits out of the text where the model left them in
  let out = text;
  for (const m of [...markers].sort((a, b) => b.offset - a.offset)) if (out.startsWith(m.label, m.offset)) out = out.slice(0, m.offset) + out.slice(m.offset + m.label.length);
  let shift = 0;
  const fixed = [...markers]
    .sort((a, b) => a.offset - b.offset)
    .map((m) => {
      const o = m.offset - shift;
      shift += m.label.length;
      return { label: m.label, offset: o };
    });
  return { text: out.replace(/\s+/g, " ").trim(), markers: fixed };
};

/** The model's output as it stands (no layer check): types as tagged, marker digits lifted out. */
export function visionDoc(blocks: VisionBlock[]): PageDoc {
  const out: DocBlock[] = [];
  for (const b of blocks) {
    if (b.type === "furniture" || b.type === "other" || !b.text) continue;
    if (b.type === "footnote") out.push({ kind: "note", text: b.text.replace(/^\s*\d{1,4}\s*/, ""), markers: [], label: b.label });
    else {
      const c = cut(b.text, b.markers);
      out.push({ kind: b.type === "heading" ? "heading" : b.type === "list_item" ? "list" : "paragraph", text: c.text, markers: c.markers });
    }
  }
  return { blocks: out.sort((a, b) => Number(a.kind === "note") - Number(b.kind === "note")) };
}

/** A verified page as a PageDoc: accepted blocks with the layer's words and the model's types; a rejected block's words run on into the block before it (no structure claimed). */
export function verifiedDoc(page: VerifiedPage, layerText: string): PageDoc {
  const lt = tokens(layerText);
  const out: DocBlock[] = [];
  for (const b of page.blocks) {
    let text = "";
    const markers: { label: string; offset: number }[] = [];
    if (b.span[1] > b.span[0]) {
      let pos = lt[b.span[0]].start;
      const at = new Map<number, string[]>();
      const garbled = new Set<number>();
      for (const m of b.markers) {
        at.set(m.token, [...(at.get(m.token) ?? []), m.label]);
        if (m.garbled) garbled.add(m.token);
      }
      for (let j = b.span[0]; j < b.span[1]; j++) {
        const labels = at.get(j);
        text += layerText.slice(pos, lt[j].start).replace(/\s+/g, " ");
        const isMarker = (labels?.includes(lt[j].word) ?? false) || garbled.has(j);
        if (labels) for (const l of labels) markers.push({ label: l, offset: text.length + (isMarker ? 0 : lt[j].end - lt[j].start) });
        if (!isMarker) text += layerText.slice(lt[j].start, lt[j].end);
        pos = lt[j].end;
      }
    }
    text = text.replace(/\s+/g, " ");
    const lead = text.length - text.trimStart().length;
    text = text.trim();
    for (const m of markers) m.offset = Math.max(0, m.offset - lead);
    if (!text) continue;
    if (!b.accepted) {
      // no structure is claimed for a rejected block: its layer words run on into the block before it, of the same class (note or body, by the layout's note size, else the model's tag)
      const isNote = b.noteShare !== undefined ? b.noteShare >= 0.5 : b.type === "footnote";
      const prev = [...out].reverse().find((x) => (x.kind === "note") === isNote);
      if (prev) {
        const base = prev.text.length + 1;
        prev.text += " " + text;
        for (const m of markers) prev.markers.push({ label: m.label, offset: base + m.offset });
      } else out.push({ kind: isNote ? "note" : "paragraph", text, markers });
      continue;
    }
    const kind: DocBlock["kind"] = b.type === "heading" ? "heading" : b.type === "list_item" ? "list" : b.type === "footnote" ? "note" : "paragraph";
    out.push({ kind, text: kind === "note" ? text.replace(/^\s*\d{1,4}\s+/, "") : text, markers, label: b.label });
  }
  return { blocks: out.sort((a, b) => Number(a.kind === "note") - Number(b.kind === "note")) };
}

/** The text layer alone: one block, no structure. */
export const layerDoc = (text: string): PageDoc => ({ blocks: [{ kind: "paragraph", text: text.replace(/\s+/g, " ").trim(), markers: [] }] });

/** Our served text (full.md) for the stretch a checked page covers, found by aligning the page's words to the report's. */
export function oursDoc(fullMd: string, ref: PageDoc, label?: string): PageDoc {
  const notes = new Map<string, string>();
  const body: DocBlock[] = [];
  const chunks = fullMd.split(/\n\s*\n/);
  // Text that recurs in a report (Challenger prints its conclusions twice) defeats a global alignment, so when the
  // page's %%page label is known only the stretch from the marker before it to the marker after it is searched.
  let from = 0;
  let to = chunks.length;
  if (label !== undefined) {
    const marks = chunks.map((c, i) => [c.trim(), i] as const).filter(([c]) => /^%%page [^%\s]+%%$/.test(c));
    const k = marks.findIndex(([c]) => c === `%%page ${label}%%`);
    if (k >= 0) {
      from = k > 0 ? marks[k - 1][1] : 0;
      // a page that starts inside a block is marked after it, so the page's own text lies between the marker before its label and the one after
      to = k + 1 < marks.length ? marks[k + 1][1] : chunks.length;
    }
  }
  for (const [ci, chunk] of chunks.entries()) {
    const t = chunk.trim();
    const def0 = /^\[\^([^\]\s]+)\]:/.test(t);
    if (!def0 && (ci < from || ci >= to)) continue;
    if (!t || /^%%page /.test(t) || /^## Notes\s*$/.test(t)) continue;
    const def = /^\[\^([^\]\s]+)\]:\s*([\s\S]*)$/.exec(t);
    if (def) {
      // a report with several note sets (Jack Smith's addendum restarts at 1) keeps the first: the main text's
      if (!notes.has(def[1])) notes.set(def[1], def[2].replace(/\s+/g, " "));
      continue;
    }
    const h = /^(#{1,6})\s+([\s\S]*)$/.exec(t);
    const li = /^[-*]\s+([\s\S]*)$/.exec(t);
    const q = /^>\s?([\s\S]*)$/.exec(t);
    const raw = (h ? h[2] : li ? li[1] : q ? q[1].replace(/\n>\s?/g, " ") : t).replace(/\s+/g, " ");
    const { text, markers } = splitMarkers(raw);
    body.push({ kind: h ? "heading" : li ? "list" : "paragraph", text, markers });
  }
  // word stream of ours with block ownership
  const O: string[] = [];
  const own: { b: number; t: number }[] = [];
  const toks = body.map((b) => tokens(b.text));
  toks.forEach((ts, bi) => ts.forEach((t, ti) => (O.push(t.word), own.push({ b: bi, t: ti }))));
  const G = flatten({ blocks: ref.blocks.filter((b) => b.kind !== "note") }).words;
  const al = align(G, O);
  let first = -1, last = -1;
  for (let i = 0; i < G.length; i++) if (al.map[i] >= 0) (first < 0 && (first = i), (last = i));
  if (first < 0) return { blocks: [] };
  let lo = Math.max(0, al.map[first] - first);
  let hi = Math.min(O.length - 1, al.map[last] + (G.length - 1 - last));
  const out: DocBlock[] = [];
  const labels = new Set<string>();
  for (let bi = 0; bi < body.length; bi++) {
    const ts = toks[bi];
    if (!ts.length) continue;
    const base = own.findIndex((o) => o.b === bi);
    const a = Math.max(lo, base);
    const z = Math.min(hi, base + ts.length - 1);
    if (z < a) continue;
    const startChar = ts[a - base].start;
    const endChar = ts[z - base].end;
    const text = body[bi].text.slice(startChar, endChar);
    const markers = body[bi].markers.filter((m) => m.offset >= startChar && m.offset <= endChar).map((m) => ({ label: m.label, offset: m.offset - startChar }));
    for (const m of markers) labels.add(m.label);
    out.push({ kind: body[bi].kind, text, markers });
  }
  for (const b of ref.blocks) if (b.kind === "note" && b.label) labels.add(b.label);
  const nl = [...labels].filter((l) => notes.has(l)).sort((a, b) => Number(a) - Number(b));
  for (const l of nl) {
    let text = notes.get(l)!;
    // a note that began on the page before, or runs on to the next, is whole in full.md: keep the stretch the page holds
    const r = ref.blocks.find((b) => b.kind === "note" && b.label === l);
    if (r) {
      const rw = tokens(r.text).map((t) => t.word);
      const ot = tokens(text);
      if (rw.length >= 3 && ot.length > rw.length) {
        const e = editAlign(rw, ot.map((t) => t.word));
        if (e.end > e.start) text = text.slice(ot[e.start].start, ot[e.end - 1].end);
      }
    }
    out.push({ kind: "note", text, markers: [], label: l });
  }
  return { blocks: out };
}

/** Which reference words does a source read right? (equal at the aligned position; a word the source lacks is wrong) */
export function rightWords(ref: PageDoc, hyp: PageDoc): boolean[] {
  const one = (d: PageDoc) => flatten({ blocks: d.blocks.map((b) => ({ ...b, kind: b.kind === "note" ? "paragraph" : b.kind })) });
  const R = one(ref);
  const H = one(hyp);
  const e = editAlign(R.words, H.words);
  const right = new Array<boolean>(R.words.length).fill(false);
  e.map.forEach((r, h) => {
    if (r >= 0 && R.words[r] === H.words[h]) right[r] = true;
  });
  return right;
}

/** Where the text layer and the model disagree about a word, who matches the checked page? */
export function tally(ref: PageDoc, layer: PageDoc, model: PageDoc) {
  const a = rightWords(ref, layer);
  const b = rightWords(ref, model);
  const t = { bothRight: 0, layerOnly: 0, modelOnly: 0, bothWrong: 0 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) t.bothRight++;
    else if (a[i]) t.layerOnly++;
    else if (b[i]) t.modelOnly++;
    else t.bothWrong++;
  }
  return t;
}
