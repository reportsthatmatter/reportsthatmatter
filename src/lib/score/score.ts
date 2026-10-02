/**
 * The alignment scorer (reportsthatmatter-38s.2): aligns our blocks to a
 * reference edition's and measures, per report and per reference section,
 *
 * - paragraph boundaries: precision, recall, F1; spurious splits (a block
 *   start of ours inside a reference block) and missed splits (a reference
 *   block start we do not reproduce);
 * - headings: precision, recall, level accuracy;
 * - block types: a confusion matrix, reference type × our type;
 * - footnote markers: linking precision and recall (a marker at the right
 *   place whose note is the right note);
 * - text: missing and extra words, an approximate word error rate on aligned
 *   text, and the out-of-vocabulary rate (our words the reference never uses).
 *
 * Measure-only. Robust to reference flaws by construction: a reference block
 * counts only when at least half its words align, and unaligned stretches of
 * 200+ words are reported (as version differences where the manifest says the
 * editions differ, otherwise as coverage gaps) instead of being counted as
 * errors.
 */
import { endsSentence } from "../quality/blocks";
import { align, type Alignment } from "./align";
import type { OurBlock, Ours, BlockType } from "./ours";
import type { RefBlock } from "./reference";
import { hasLetter, tokens, tokensBefore } from "./tokens";

export const TOLERANCE = 2;
export const STRETCH = 200;
export const INCLUDE = 0.5;
/** Block types whose starts are paragraph boundaries (table rows and cells are not). */
export const BOUNDARY_TYPES = new Set(["heading", "paragraph", "quote", "list", "contents"]);

export type Example = {
  metric: string;
  cluster: string;
  page: number | null;
  pid: string | null;
  line: number | null;
  section: string;
  ours: string;
  ref: string;
};

export type Counts = { tp: number; fp: number; fn: number };
export const prf = (c: Counts) => {
  const p = c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0;
  const r = c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0;
  return { precision: p, recall: r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
};

export type SectionScore = {
  section: string;
  refWords: number;
  boundaries: Counts;
  headings: Counts;
  markers: Counts;
  wordErrors: number;
  oov: number;
  ourWords: number;
};

export type MarkerOutcome = "linked" | "wrong-note" | "bare" | "missing";

export type Stream = {
  words: string[];
  start: number[];
  end: number[];
  owner: Int32Array;
};

export type ScoreResult = {
  boundaries: Counts;
  headings: Counts;
  headingLevels: { accuracy: number; mapping: Record<string, number>; pairs: number };
  confusion: Record<string, Record<string, number>>;
  markers: Counts & { positionTp: number; outcomes: Record<MarkerOutcome, number>; refTotal: number; ourTotal: number };
  text: {
    refWords: number;
    refWordsIncluded: number;
    ourWords: number;
    missing: number;
    extra: number;
    wordErrorRate: number;
    oov: number;
    oovRate: number;
    alphaWords: number;
    stretches: { side: "ref" | "ours"; words: number; section: string; excerpt: string; page: number | null }[];
  };
  coverage: { refIncluded: number; refBlocks: number; ourAligned: number; ourBlocks: number; anchors: number };
  sections: SectionScore[];
  examples: Example[];
  oovTop: { word: string; count: number; page: number | null; pid: string | null; context: string }[];
  /** Internals for the decision dataset and signal evaluation. */
  detail: Detail;
};

export type Detail = {
  ours: Ours;
  refBody: RefBlock[];
  refNotes: RefBlock[];
  O: Stream;
  R: Stream;
  body: Alignment;
  refIncluded: boolean[];
  ourFrac: number[];
  ourStart: (number | null)[];
  /** our body block index → "tp" | "spurious" | "unmapped" */
  ourBoundary: ("tp" | "spurious" | "unmapped")[];
  refBoundaryHit: boolean[];
  ourHeadingOk: (boolean | null)[];
  refHeadingHit: boolean[];
  /** body block index → majority reference type of its words */
  ourRefType: (string | null)[];
  noteInBody: boolean[];
  refMarkers: { block: number; label: string; rpos: number; outcome: MarkerOutcome }[];
  ourMarkers: { block: number; label: string; opos: number; rpos: number | null; status: "linked" | "wrong-note" | "spurious" | "unmapped" }[];
};

function stream<T extends { text: string }>(blocks: T[]): Stream {
  const words: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  const own: number[] = [];
  blocks.forEach((b, k) => {
    start.push(words.length);
    for (const t of tokens(b.text)) {
      words.push(t.word);
      own.push(k);
    }
    end.push(words.length);
  });
  return { words, start, end, owner: Int32Array.from(own) };
}

const clip = (s: string, n = 140) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};
const head = (s: string, n = 70) => clip(s, n);
const tail = (s: string, n = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? "…" + t.slice(t.length - n + 1) : t;
};

/** Words of `s` around token range [a, b) of a stream, for excerpts. */
function span(st: Stream, a: number, b: number) {
  return st.words.slice(Math.max(0, a), Math.min(st.words.length, b)).join(" ");
}

function grams(ws: string[], n: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) s.add(ws.slice(i, i + n).join(" "));
  return s;
}

const ourTypeName = (b: OurBlock): string => b.type;

export function score(ours: Ours, ref: RefBlock[], opts: { versionDiffers?: boolean } = {}): ScoreResult {
  const refBody = ref.filter((b) => b.type !== "note");
  const refNotes = ref.filter((b) => b.type === "note");
  const O = stream(ours.body);
  const R = stream(refBody);
  const body = align(O.words, R.words);
  const ON = stream(ours.notes);
  const RN = stream(refNotes);
  const notesAl = align(ON.words, RN.words, { n: 5 });
  const examples: Example[] = [];

  // ---------------------------------------------------------------- inclusion
  const refFrac = refBody.map((_, k) => {
    const n = R.end[k] - R.start[k];
    if (!n) return 0;
    let m = 0;
    for (let j = R.start[k]; j < R.end[k]; j++) if (body.inv[j] >= 0) m++;
    return m / n;
  });
  const refIncluded = refFrac.map((f, k) => f >= INCLUDE && R.end[k] > R.start[k]);
  const ourFrac = ours.body.map((_, k) => {
    const n = O.end[k] - O.start[k];
    if (!n) return 0;
    let m = 0;
    for (let i = O.start[k]; i < O.end[k]; i++) if (body.map[i] >= 0) m++;
    return m / n;
  });
  const refSection = (j: number) => (j >= 0 && j < R.words.length ? refBody[R.owner[j]].section : "") || "(none)";
  const ourStart = ours.body.map((_, k): number | null => {
    for (let d = 0; d < 5 && O.start[k] + d < O.end[k]; d++) {
      const j = body.map[O.start[k] + d];
      if (j >= 0) return Math.max(0, j - d);
    }
    return null;
  });

  // per-section accumulators
  const sections = new Map<string, SectionScore>();
  const sec = (name: string) => {
    let s = sections.get(name);
    if (!s) {
      s = { section: name, refWords: 0, boundaries: { tp: 0, fp: 0, fn: 0 }, headings: { tp: 0, fp: 0, fn: 0 }, markers: { tp: 0, fp: 0, fn: 0 }, wordErrors: 0, oov: 0, ourWords: 0 };
      sections.set(name, s);
    }
    return s;
  };
  refBody.forEach((b, k) => {
    if (refIncluded[k]) sec(b.section || "(none)").refWords += R.end[k] - R.start[k];
  });

  const ex = (e: Omit<Example, "section"> & { section?: string }) => examples.push({ section: "", ...e } as Example);
  const ourEx = (k: number) => {
    const b = ours.body[k];
    return { page: b.page, pid: b.pid, line: b.line };
  };

  // ---------------------------------------------------------------- boundaries
  const refStarts: number[] = [];
  const refStartBlock: number[] = [];
  refBody.forEach((b, k) => {
    if (refIncluded[k] && BOUNDARY_TYPES.has(b.type)) {
      refStarts.push(R.start[k]);
      refStartBlock.push(k);
    }
  });
  const near = (sorted: number[], x: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x - TOLERANCE) lo = mid + 1;
      else hi = mid;
    }
    return lo < sorted.length && sorted[lo] <= x + TOLERANCE ? lo : -1;
  };
  /** One-to-one matching of two position lists within TOLERANCE, exact matches first. */
  const pair = (refs: number[], ourPos: number[]) => {
    const refMatch = new Int32Array(refs.length).fill(-1);
    const ourMatch = new Int32Array(ourPos.length).fill(-1);
    const byPos = new Map<number, number[]>();
    ourPos.forEach((p, x) => byPos.set(p, [...(byPos.get(p) ?? []), x]));
    for (let d = 0; d <= TOLERANCE; d++) {
      refs.forEach((r, x) => {
        if (refMatch[x] >= 0) return;
        for (const q of d === 0 ? [r] : [r - d, r + d]) {
          const cands = byPos.get(q);
          const y = cands?.find((c) => ourMatch[c] < 0);
          if (y !== undefined) {
            refMatch[x] = y;
            ourMatch[y] = x;
            return;
          }
        }
      });
    }
    return { refMatch, ourMatch };
  };
  const ourStarts: number[] = [];
  const ourStartBlock: number[] = [];
  ours.body.forEach((_, k) => {
    const s = ourStart[k];
    if (s === null || !refIncluded[R.owner[s]] || !BOUNDARY_TYPES.has(ours.body[k].type) || !BOUNDARY_TYPES.has(refBody[R.owner[s]].type)) return;
    ourStarts.push(s);
    ourStartBlock.push(k);
  });
  const order = ourStarts.map((_, x) => x).sort((p, q) => ourStarts[p] - ourStarts[q]);
  const ourSorted = order.map((x) => ourStarts[x]);
  const boundaries: Counts = { tp: 0, fp: 0, fn: 0 };
  const bm = pair(refStarts, ourStarts);
  const ourBoundary: Detail["ourBoundary"] = ours.body.map(() => "unmapped");
  ourStartBlock.forEach((k, x) => {
    const s = ourStarts[x];
    const hit = bm.ourMatch[x] >= 0;
    ourBoundary[k] = hit ? "tp" : "spurious";
    const sc = sec(refSection(s));
    if (hit) {
      boundaries.tp++;
      sc.boundaries.tp++;
    } else {
      boundaries.fp++;
      sc.boundaries.fp++;
      const b = ours.body[k];
      const prev = k > 0 ? ours.body[k - 1] : null;
      const prevEnds = prev ? endsSentence(prev.text) : true;
      const lower = /^[a-z(,;]/.test(b.text);
      const cluster = `${b.afterPageBreak ? "page break" : "mid-page"} · prev ${prevEnds ? "ends sentence" : "unfinished"} · next ${lower ? "lower-case" : "capital/other"} · ${prev ? ourTypeName(prev) : "-"}→${ourTypeName(b)}`;
      const rb = refBody[R.owner[s]];
      ex({ metric: "spurious-split", cluster, ...ourEx(k), section: refSection(s), ours: `${prev ? tail(prev.text) : ""} ⏎ ${head(b.text)}`, ref: `[${rb.type}] ${clip(span(R, s - 12, s + 12))}` });
    }
  });
  const refBoundaryHit = refBody.map(() => false);
  refStarts.forEach((s, x) => {
    const k = refStartBlock[x];
    const hit = bm.refMatch[x] >= 0;
    refBoundaryHit[k] = hit;
    if (hit) return;
    boundaries.fn++;
    const sc = sec(refSection(s));
    sc.boundaries.fn++;
    const rb = refBody[k];
    const prev = k > 0 ? refBody[k - 1] : null;
    // our block holding the reference block's first word
    let i = -1;
    for (let j = s; j < R.end[k] && i < 0; j++) i = body.inv[j];
    const ob = i >= 0 ? ours.body[O.owner[i]] : null;
    const cluster = `${prev ? prev.type : "-"}→${rb.type}${ob ? ` · inside our ${ob.type}` : ""}`;
    ex({
      metric: "missed-split",
      cluster,
      page: ob?.page ?? null,
      pid: ob?.pid ?? null,
      line: ob?.line ?? null,
      section: rb.section,
      ours: ob ? clip(i >= 0 ? span(O, i - 12, i + 12).replace(new RegExp(`^`), "") : ob.text) : "",
      ref: `${prev ? tail(prev.text, 60) : ""} ⏎ [${rb.type}] ${head(rb.text, 70)}`,
    });
  });

  // ---------------------------------------------------------------- headings
  const refHeadStarts: number[] = [];
  const refHeadBlock: number[] = [];
  refBody.forEach((b, k) => {
    if (b.type === "heading" && refIncluded[k]) {
      refHeadStarts.push(R.start[k]);
      refHeadBlock.push(k);
    }
  });
  const ourHeadStarts: number[] = [];
  const ourHeadBlock: number[] = [];
  ourStartBlock.forEach((k, x) => {
    if (ours.body[k].type === "heading") {
      ourHeadStarts.push(ourStarts[x]);
      ourHeadBlock.push(k);
    }
  });
  const headings: Counts = { tp: 0, fp: 0, fn: 0 };
  const ourHeadingOk: Detail["ourHeadingOk"] = ours.body.map(() => null);
  const levelPairs: [number, number][] = [];
  const hm = pair(refHeadStarts, ourHeadStarts);
  ourHeadBlock.forEach((k, x) => {
    const s = ourHeadStarts[x];
    const hx = hm.ourMatch[x];
    const sc = sec(refSection(s));
    if (hx >= 0) {
      headings.tp++;
      sc.headings.tp++;
      ourHeadingOk[k] = true;
      const rl = refBody[refHeadBlock[hx]].level;
      if (rl != null && ours.body[k].level != null) levelPairs.push([rl, ours.body[k].level!]);
    } else {
      headings.fp++;
      sc.headings.fp++;
      ourHeadingOk[k] = false;
      const rb = refBody[R.owner[s]];
      const atStart = near(refStarts, s) >= 0;
      ex({ metric: "spurious-heading", cluster: atStart ? `reference ${rb.type} start` : `inside reference ${rb.type}`, ...ourEx(k), section: rb.section, ours: `${"#".repeat(ours.body[k].level ?? 1)} ${head(ours.body[k].text, 90)}`, ref: `[${rb.type}] ${clip(span(R, s - 6, s + 16))}` });
    }
  });
  const refHeadingHit = refBody.map(() => false);
  refHeadBlock.forEach((k, x) => {
    const s = refHeadStarts[x];
    if (hm.refMatch[x] >= 0) {
      refHeadingHit[k] = true;
      return;
    }
    headings.fn++;
    sec(refSection(s)).headings.fn++;
    let i = -1;
    for (let j = s; j < R.end[k] && i < 0; j++) i = body.inv[j];
    const ob = i >= 0 ? ours.body[O.owner[i]] : null;
    const boundaryOk = near(ourSorted, s) >= 0;
    const cluster = !ob ? "missing text" : boundaryOk ? (ob.type === "paragraph" && R.end[k] - R.start[k] < O.end[O.owner[i]] - O.start[O.owner[i]] ? "fused into the start of our paragraph (run-in)" : `own block, typed ${ob.type}`) : `fused mid-block into our ${ob.type}`;
    ex({ metric: "missed-heading", cluster, page: ob?.page ?? null, pid: ob?.pid ?? null, line: ob?.line ?? null, section: refBody[k].section, ours: ob ? `[${ob.type}] ${clip(span(O, i - 6, i + 16))}` : "", ref: `h${refBody[k].level ?? "?"} ${head(refBody[k].text, 90)}` });
  });
  const byRef = new Map<number, Map<number, number>>();
  for (const [rl, ol] of levelPairs) {
    const m = byRef.get(rl) ?? new Map<number, number>();
    m.set(ol, (m.get(ol) ?? 0) + 1);
    byRef.set(rl, m);
  }
  const mapping: Record<string, number> = {};
  for (const [rl, m] of byRef) mapping[String(rl)] = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const levelOk = levelPairs.filter(([rl, ol]) => mapping[String(rl)] === ol).length;
  ourHeadBlock.forEach((k, x) => {
    if (!ourHeadingOk[k]) return;
    const rb = refBody[refHeadBlock[hm.ourMatch[x]]];
    const ol = ours.body[k].level;
    if (rb.level != null && ol != null && mapping[String(rb.level)] !== ol) {
      ex({ metric: "heading-level", cluster: `reference h${rb.level} (usually our h${mapping[String(rb.level)]}) as our h${ol}`, ...ourEx(k), section: rb.section, ours: `${"#".repeat(ol)} ${head(ours.body[k].text, 80)}`, ref: `h${rb.level} ${head(rb.text, 80)}` });
    }
  });

  // ---------------------------------------------------------------- block types
  const confusion: Record<string, Record<string, number>> = {};
  const bump = (r: string, o: string) => {
    confusion[r] ??= {};
    confusion[r][o] = (confusion[r][o] ?? 0) + 1;
  };
  refBody.forEach((b, k) => {
    if (!refIncluded[k]) {
      bump(b.type, "(unaligned)");
      return;
    }
    const votes = new Map<string, number>();
    const owners = new Map<number, number>();
    for (let j = R.start[k]; j < R.end[k]; j++) {
      const i = body.inv[j];
      if (i < 0) continue;
      const ob = O.owner[i];
      votes.set(ours.body[ob].type, (votes.get(ours.body[ob].type) ?? 0) + 1);
      owners.set(ob, (owners.get(ob) ?? 0) + 1);
    }
    const ot = [...votes.entries()].sort((a, c) => c[1] - a[1])[0][0];
    bump(b.type, ot);
    const equivalent = ot === b.type || (b.type === "list" && ot === "contents") || (b.type === "contents" && (ot === "list" || ot === "paragraph"));
    if (!equivalent) {
      const ob = [...owners.entries()].sort((a, c) => c[1] - a[1])[0][0];
      ex({ metric: "block-type", cluster: `reference ${b.type} → our ${ot}`, ...ourEx(ob), section: b.section, ours: `[${ot}] ${head(ours.body[ob].text, 90)}`, ref: `[${b.type}] ${head(b.text, 90)}` });
    }
  });
  // our blocks: majority reference type; text that is the reference's notes
  const noteGrams = grams(RN.words, 5);
  const ourRefType: Detail["ourRefType"] = ours.body.map(() => null);
  const noteInBody = ours.body.map(() => false);
  ours.body.forEach((b, k) => {
    const votes = new Map<string, number>();
    for (let i = O.start[k]; i < O.end[k]; i++) {
      const j = body.map[i];
      if (j >= 0) votes.set(refBody[R.owner[j]].type, (votes.get(refBody[R.owner[j]].type) ?? 0) + 1);
    }
    if (ourFrac[k] >= INCLUDE) {
      ourRefType[k] = [...votes.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] ?? null;
      return;
    }
    const ws = O.words.slice(O.start[k], O.end[k]);
    if (ws.length >= 5) {
      const g = grams(ws, 5);
      let hit = 0;
      for (const x of g) if (noteGrams.has(x)) hit++;
      if (g.size && hit / g.size >= 0.5) {
        noteInBody[k] = true;
        ourRefType[k] = "note";
        bump("note", b.type);
        ex({ metric: "note-in-body", cluster: `reference note as our ${b.type}`, ...ourEx(k), section: b.section, ours: `[${b.type}] ${head(b.text, 110)}`, ref: "[note]" });
        return;
      }
    }
    if (ws.length) bump("(none)", b.type);
  });
  // reference notes against our notes
  refNotes.forEach((n, k) => {
    const len = RN.end[k] - RN.start[k];
    if (!len) return;
    let m = 0;
    for (let j = RN.start[k]; j < RN.end[k]; j++) if (notesAl.inv[j] >= 0) m++;
    bump("note", m / len >= INCLUDE ? "note" : "(unaligned)");
  });

  // ---------------------------------------------------------------- footnote markers
  const refNoteIndex = new Map<string, number>();
  refNotes.forEach((n, k) => n.id && refNoteIndex.set(n.id, k));
  const refMarkers: Detail["refMarkers"] = [];
  refBody.forEach((b, k) => {
    if (!refIncluded[k]) return;
    for (const m of b.markers) refMarkers.push({ block: k, label: m.label, rpos: R.start[k] + tokensBefore(b.text, m.offset), outcome: "missing" });
  });
  const ourMarkers: Detail["ourMarkers"] = [];
  ours.body.forEach((b, k) => {
    for (const m of b.markers) {
      const opos = O.start[k] + tokensBefore(b.text, m.offset);
      let rpos: number | null = null;
      if (opos - 1 >= O.start[k] && body.map[opos - 1] >= 0) rpos = body.map[opos - 1] + 1;
      else if (opos < O.end[k] && body.map[opos] >= 0) rpos = body.map[opos];
      ourMarkers.push({ block: k, label: m.label, opos, rpos, status: rpos === null || !refIncluded[R.owner[Math.min(rpos, R.words.length - 1)]] ? "unmapped" : "spurious" });
    }
  });
  const markerNoteOf = (mk: (typeof ourMarkers)[number]) => ours.body[mk.block].markers.find((x, idx) => O.start[mk.block] + tokensBefore(ours.body[mk.block].text, x.offset) === mk.opos && x.label === mk.label)?.note ?? null;
  const notesMatch = (ourNote: number | null, refNoteId: string | null) => {
    if (ourNote === null || refNoteId === null) return ourNote === null && refNoteId === null;
    const rk = refNoteIndex.get(refNoteId);
    if (rk === undefined) return false;
    const [a0, a1] = [ON.start[ourNote], ON.end[ourNote]];
    const [b0, b1] = [RN.start[rk], RN.end[rk]];
    if (a1 === a0 || b1 === b0) return false;
    // short citations repeat ("Cameron Report, para 49."), so the notes alignment can place them
    // at another occurrence: compare the words directly first
    const wa = ON.words.slice(a0, Math.min(a1, a0 + 40));
    const wb = RN.words.slice(b0, Math.min(b1, b0 + 40));
    const setB = new Set(wb);
    const common = wa.filter((x) => setB.has(x)).length;
    if (common >= 0.8 * Math.max(wa.length, wb.length)) return true;
    let hit = 0;
    for (let i = a0; i < a1; i++) {
      const j = notesAl.map[i];
      if (j >= b0 && j < b1) hit++;
    }
    return hit >= 0.5 * Math.min(a1 - a0, b1 - b0);
  };
  const byPos = ourMarkers.map((m, x) => x).filter((x) => ourMarkers[x].status === "spurious").sort((p, q) => ourMarkers[p].rpos! - ourMarkers[q].rpos!);
  const used = new Set<number>();
  const markers = { tp: 0, fp: 0, fn: 0, positionTp: 0, outcomes: { linked: 0, "wrong-note": 0, bare: 0, missing: 0 } as Record<MarkerOutcome, number>, refTotal: refMarkers.length, ourTotal: 0 };
  for (const rm of refMarkers) {
    const refNote = refBody[rm.block].markers.find((x) => R.start[rm.block] + tokensBefore(refBody[rm.block].text, x.offset) === rm.rpos && x.label === rm.label)?.note ?? null;
    let best = -1;
    for (const x of byPos) {
      if (used.has(x)) continue;
      const d = Math.abs(ourMarkers[x].rpos! - rm.rpos);
      if (d <= TOLERANCE && (best < 0 || d < Math.abs(ourMarkers[best].rpos! - rm.rpos))) best = x;
    }
    const sc = sec(refSection(rm.rpos));
    if (best >= 0) {
      used.add(best);
      markers.positionTp++;
      const ok = notesMatch(markerNoteOf(ourMarkers[best]), refNote) || (refNote === null && true);
      if (ok) {
        rm.outcome = "linked";
        ourMarkers[best].status = "linked";
        markers.tp++;
        sc.markers.tp++;
      } else {
        rm.outcome = "wrong-note";
        ourMarkers[best].status = "wrong-note";
        markers.fn++;
        sc.markers.fn++;
        const ob = ours.body[ourMarkers[best].block];
        const on = markerNoteOf(ourMarkers[best]);
        const rk = refNote ? refNoteIndex.get(refNote) : undefined;
        ex({ metric: "marker", cluster: on === null ? "marker at the right place, no note definition" : "marker at the right place, wrong note", page: ob.page, pid: ob.pid, line: ob.line, section: refBody[rm.block].section, ours: `[^${rm.label}] → ${on === null ? "(none)" : head(ours.notes[on].text, 70)} · ${clip(span(O, ourMarkers[best].opos - 8, ourMarkers[best].opos + 4))}`, ref: `${rm.label} → ${rk !== undefined ? head(refNotes[rk].text, 70) : "?"}` });
      }
      continue;
    }
    markers.fn++;
    sc.markers.fn++;
    // bare: our text carries the label as a word, unlinked, next to where the marker belongs
    const i = rm.rpos - 1 >= 0 ? body.inv[rm.rpos - 1] : -1;
    let bare = false;
    // (the number may differ from the reference's: an amended edition renumbers its notes)
    let sameLabel = false;
    if (i >= 0)
      for (let d = 1; d <= 3 && !bare; d++) {
        bare = /^\d{1,3}$/.test(O.words[i + d] ?? "") && body.map[i + d] < 0 && O.owner[i + d] === O.owner[i];
        sameLabel = bare && O.words[i + d] === rm.label.toLowerCase();
      }
    rm.outcome = bare ? "bare" : "missing";
    const ob = i >= 0 ? ours.body[O.owner[i]] : null;
    ex({ metric: "marker", cluster: bare ? (sameLabel ? "bare number in the text (unlinked)" : "bare number in the text (unlinked, number differs)") : `no marker${ob ? ` (our ${ob.type})` : ""}`, page: ob?.page ?? null, pid: ob?.pid ?? null, line: ob?.line ?? null, section: refBody[rm.block].section, ours: i >= 0 ? clip(span(O, i - 8, i + 5)) : "", ref: `…${clip(span(R, rm.rpos - 8, rm.rpos))} ^${rm.label} ${clip(span(R, rm.rpos, rm.rpos + 4))}` });
  }
  for (const rm of refMarkers) markers.outcomes[rm.outcome]++;
  for (const om of ourMarkers) {
    if (om.status === "unmapped") continue;
    markers.ourTotal++;
    if (om.status !== "spurious") continue;
    markers.fp++;
    sec(refSection(om.rpos!)).markers.fp++;
    const ob = ours.body[om.block];
    ex({ metric: "marker", cluster: `spurious marker in our ${ob.type}`, page: ob.page, pid: ob.pid, line: ob.line, section: refSection(om.rpos!), ours: `…${clip(span(O, om.opos - 8, om.opos))} [^${om.label}] ${clip(span(O, om.opos, om.opos + 4))}`, ref: clip(span(R, om.rpos! - 8, om.rpos! + 4)) });
  }

  // ---------------------------------------------------------------- text: missing, extra, WER, OOV
  const stretches: ScoreResult["text"]["stretches"] = [];
  const runs = (st: Stream, mp: Int32Array, side: "ref" | "ours") => {
    let short = 0;
    let i = 0;
    while (i < st.words.length) {
      if (mp[i] >= 0) {
        i++;
        continue;
      }
      let j = i;
      while (j < st.words.length && mp[j] < 0) j++;
      const len = j - i;
      if (len >= STRETCH) {
        const blk = side === "ref" ? refBody[st.owner[i]] : ours.body[st.owner[i]];
        stretches.push({ side, words: len, section: side === "ref" ? (blk as RefBlock).section : (blk as OurBlock).section, excerpt: clip(span(st, i, i + 25)), page: side === "ours" ? (blk as OurBlock).page : null });
      } else {
        short += len;
        if (len >= 4) {
          const k = st.owner[i];
          if (side === "ref" && refIncluded[k]) {
            const pi = i > 0 ? body.inv[i - 1] : -1;
            const ob = pi >= 0 ? ours.body[O.owner[pi]] : null;
            ex({ metric: "missing-text", cluster: len >= 20 ? "20+ words" : "4-19 words", page: ob?.page ?? null, pid: ob?.pid ?? null, line: ob?.line ?? null, section: refBody[k].section, ours: pi >= 0 ? clip(span(O, pi - 6, pi + 6)) : "", ref: `${clip(span(R, i - 4, i))} «${clip(span(R, i, j), 200)}» ${clip(span(R, j, j + 4))}` });
          } else if (side === "ours" && ourFrac[k] >= INCLUDE) {
            ex({ metric: "extra-text", cluster: len >= 20 ? "20+ words" : "4-19 words", ...ourEx(k), section: ours.body[k].section, ours: `${clip(span(O, i - 4, i))} «${clip(span(O, i, j), 200)}» ${clip(span(O, j, j + 4))}`, ref: "" });
          }
        }
      }
      i = j;
    }
    return short;
  };
  const missing = runs(R, body.inv, "ref");
  const extra = runs(O, body.map, "ours");
  let refWordsIncluded = 0;
  let refErr = 0;
  refBody.forEach((b, k) => {
    if (!refIncluded[k]) return;
    refWordsIncluded += R.end[k] - R.start[k];
    for (let j = R.start[k]; j < R.end[k]; j++) {
      if (body.inv[j] < 0) {
        refErr++;
        sec(b.section || "(none)").wordErrors++;
      }
    }
  });
  let ourErr = 0;
  ours.body.forEach((b, k) => {
    if (ourFrac[k] < INCLUDE) return;
    for (let i = O.start[k]; i < O.end[k]; i++) {
      if (body.map[i] < 0) {
        ourErr++;
        const s = ourStart[k];
        if (s !== null) sec(refSection(s)).wordErrors++;
      }
    }
  });
  // OOV: our words in aligned blocks (and aligned notes) the reference never uses
  const vocab = new Set<string>();
  for (const st of [R, RN]) {
    for (let i = 0; i < st.words.length; i++) {
      vocab.add(st.words[i]);
      if (i + 1 < st.words.length) vocab.add(st.words[i] + st.words[i + 1]);
    }
  }
  const oovCount = new Map<string, { count: number; k: number; i: number }>();
  let alpha = 0;
  let oov = 0;
  ours.body.forEach((b, k) => {
    if (ourFrac[k] < INCLUDE) return;
    const s = ourStart[k];
    const sc = s !== null ? sec(refSection(s)) : null;
    for (let i = O.start[k]; i < O.end[k]; i++) {
      const w = O.words[i];
      if (!hasLetter(w)) continue;
      alpha++;
      if (sc) sc.ourWords++;
      if (vocab.has(w)) continue;
      oov++;
      if (sc) sc.oov++;
      const e = oovCount.get(w);
      if (e) e.count++;
      else oovCount.set(w, { count: 1, k, i });
    }
  });
  const oovTop = [...oovCount.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 60)
    .map(([word, e]) => ({ word, count: e.count, page: ours.body[e.k].page, pid: ours.body[e.k].pid, context: clip(span(O, e.i - 6, e.i + 6)) }));
  for (const [word, e] of [...oovCount.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 400)) {
    const b = ours.body[e.k];
    const cluster = /^[a-z]{1,3}$/.test(word) ? "fragment (1-3 letters)" : /\d/.test(word) && /\p{L}/u.test(word) ? "letters and digits fused" : "word";
    ex({ metric: "oov", cluster, page: b.page, pid: b.pid, line: b.line, section: b.section, ours: `${word} (×${e.count}): ${clip(span(O, e.i - 6, e.i + 6))}`, ref: "" });
  }

  const refWords = R.words.length;
  const result: ScoreResult = {
    boundaries,
    headings,
    headingLevels: { accuracy: levelPairs.length ? levelOk / levelPairs.length : 0, mapping, pairs: levelPairs.length },
    confusion,
    markers,
    text: {
      refWords,
      refWordsIncluded,
      ourWords: O.words.length,
      missing,
      extra,
      wordErrorRate: refWordsIncluded ? (refErr + ourErr) / refWordsIncluded : 0,
      oov,
      oovRate: alpha ? oov / alpha : 0,
      alphaWords: alpha,
      stretches: stretches.sort((a, b) => b.words - a.words),
    },
    coverage: {
      refIncluded: refIncluded.filter(Boolean).length,
      refBlocks: refBody.length,
      ourAligned: ourFrac.filter((f) => f >= INCLUDE).length,
      ourBlocks: ours.body.length,
      anchors: body.anchors,
    },
    sections: [...sections.values()],
    examples,
    oovTop,
    detail: { ours, refBody, refNotes, O, R, body, refIncluded, ourFrac, ourStart, ourBoundary, refBoundaryHit, ourHeadingOk, refHeadingHit, ourRefType, noteInBody, refMarkers, ourMarkers },
  };
  void opts;
  return result;
}

export type { BlockType };
