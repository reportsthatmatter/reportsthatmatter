/**
 * The decision-level labelled dataset (input to reportsthatmatter-38s.8): one
 * row per point where the pipeline decides something, with text-shape and
 * PDF-layout features and the reference edition's answer.
 *
 * - `boundary`: every break between two printed lines of body text (from
 *   `pdftohtml -xml`). Label: does the reference start a block there; did we?
 *   Without layout, one row per our block start and per reference start we
 *   missed (the observable decisions only).
 * - `block`: every block of ours: our type against the reference type of its
 *   words.
 * - `heading`: every block of ours that is a heading or short enough to be
 *   one (25 words or fewer): heading or not, and level, both sides.
 * - `marker`: every reference footnote marker, with what became of it.
 *
 * Rows with `ref_*` null are unlabelled (the reference does not cover them).
 */
import { align } from "./align";
import type { Line } from "./layout";
import { prepareLayout } from "./layout";
import type { ScoreResult } from "./score";
import { BOUNDARY_TYPES, TOLERANCE } from "./score";
import { tokens } from "./tokens";
import { endsSentence } from "../quality/blocks";

export type Row = Record<string, string | number | boolean | null>;

const charClass = (c: string | undefined) =>
  c === undefined ? "none" : /\p{Ll}/u.test(c) ? "lower" : /\p{Lu}/u.test(c) ? "upper" : /\d/.test(c) ? "digit" : /["“‘'«]/.test(c) ? "quote" : /[(\[]/.test(c) ? "open" : "other";
const LABEL = /^(?:\d{1,4}(?:\.\d{1,4})*\.?|[a-z]\.|[A-Z]\.|[ivxlc]{1,5}\.|\([a-z0-9]{1,4}\)|[•·▪–-])\s/;
const capsRatio = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters ? letters.replace(/[^\p{Lu}]/gu, "").length / letters.length : 0;
};

function textShape(prefix: string, text: string): Row {
  const t = text.trim();
  return {
    [`${prefix}_chars`]: t.length,
    [`${prefix}_words`]: t ? t.split(/\s+/).length : 0,
    [`${prefix}_first`]: charClass(t[0]),
    [`${prefix}_last`]: t.slice(-1) || null,
    [`${prefix}_ends_sentence`]: endsSentence(t),
    [`${prefix}_ends_hyphen`]: /[A-Za-z]-$/.test(t),
    [`${prefix}_starts_label`]: LABEL.test(t),
    [`${prefix}_caps_ratio`]: Math.round(capsRatio(t) * 100) / 100,
    [`${prefix}_opens_quote`]: /^["“‘]/.test(t),
    [`${prefix}_closes_quote`]: /["”’][\s\d]*$/.test(t),
  };
}

type PageStats = { left: number; right: number };

function pageStats(lines: Line[]): Map<number, PageStats> {
  const by = new Map<number, Line[]>();
  for (const l of lines) by.set(l.page, [...(by.get(l.page) ?? []), l]);
  const out = new Map<number, PageStats>();
  for (const [p, ls] of by) {
    const long = ls.filter((l) => l.text.length >= 40);
    const pool = long.length ? long : ls;
    const lefts = new Map<number, number>();
    for (const l of pool) lefts.set(Math.round(l.left / 3) * 3, (lefts.get(Math.round(l.left / 3) * 3) ?? 0) + 1);
    const left = [...lefts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const rights = pool.map((l) => l.left + l.width).sort((a, b) => a - b);
    out.set(p, { left, right: rights[Math.floor(rights.length * 0.9)] ?? 0 });
  }
  return out;
}

function lineFeatures(prefix: string, l: Line | undefined, stats: Map<number, PageStats>, modalSize: number): Row {
  if (!l) return { [`${prefix}_layout`]: false };
  const s = stats.get(l.page)!;
  return {
    [`${prefix}_page`]: l.page,
    [`${prefix}_top_rel`]: Math.round((l.top / l.pageHeight) * 1000) / 1000,
    [`${prefix}_left`]: l.left,
    [`${prefix}_indent`]: l.left - s.left,
    [`${prefix}_right_gap`]: s.right - (l.left + l.width),
    [`${prefix}_width_rel`]: s.right - s.left > 0 ? Math.round(((l.width) / (s.right - s.left)) * 100) / 100 : null,
    [`${prefix}_size`]: l.size,
    [`${prefix}_size_rel`]: modalSize ? Math.round((l.size / modalSize) * 100) / 100 : null,
    [`${prefix}_bold`]: l.bold,
    [`${prefix}_italic`]: l.italic,
    [`${prefix}_font`]: l.family,
    [`${prefix}_color`]: l.color,
    [`${prefix}_superscript`]: l.superscript,
  };
}

const lowerBound = (xs: number[], x: number) => {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (xs[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
};
/** Any value in sorted `xs` with a < v <= b? */
const anyIn = (xs: number[], a: number, b: number) => {
  const k = lowerBound(xs, a + 1);
  return k < xs.length && xs[k] <= b;
};

/**
 * How far to trust a boundary row's reference label (38s.12): the reference is itself a pipeline output
 * (tags, scraped HTML) with known quirks, and adjudicating held-out page breaks against the PDF found it wrong
 * on 10%. `low` when the row has a shape the quirks produce; `adjudicated` rows are overwritten by
 * `applyAdjudication` from the report's `reference/adjudicated.yaml`.
 */
export function labelFlags(r: Row): string[] {
  const flags: string[] = [];
  if (r.ref_boundary === null || r.ref_boundary === undefined) return flags;
  const unfinished = r.prev_ends_sentence === false && r.prev_ends_hyphen !== true ? true : r.prev_ends_hyphen === true;
  if (r.ref_boundary === true && unfinished && r.next_first === "lower") flags.push("ref-splits-lowercase-after-unfinished");
  else if (r.ref_boundary === true && unfinished && r.crosses_page === true && !r.next_starts_label && ["paragraph", "quote", "list"].includes(String(r.ref_next_type))) flags.push("ref-splits-unfinished-at-page-break");
  if (r.ref_boundary === false && r.next_starts_label === true) flags.push("ref-joins-labelled-line");
  if (r.ref_next_type === "note" || r.ref_next_type === "table" || r.ref_prev_type === "note" || r.ref_prev_type === "table") flags.push("ref-note-or-table");
  return flags;
}

export function decisionRows(report: string, result: ScoreResult, rawLayout: Line[] | null): Row[] {
  const layout = rawLayout ? prepareLayout(rawLayout) : null;
  const d = result.detail;
  const { ours, refBody, O, R, body } = d;
  const rows: Row[] = [];
  const refStarts = refBody.flatMap((b, k) => (d.refIncluded[k] && BOUNDARY_TYPES.has(b.type) ? [R.start[k]] : [])).sort((a, b) => a - b);
  const ourStarts = ours.body.map((_, k) => O.start[k]).filter((s, k) => O.end[k] > s);

  // our-token → layout line, for block rows
  let lineOfOur: Int32Array | null = null;
  let lines: Line[] = [];
  let stats = new Map<number, PageStats>();
  let modalSize = 0;
  if (layout && layout.length) {
    lines = layout;
    stats = pageStats(lines);
    const sizes = new Map<number, number>();
    for (const l of lines) sizes.set(l.size, (sizes.get(l.size) ?? 0) + l.text.length);
    modalSize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const P: string[] = [];
    const pLine: number[] = [];
    lines.forEach((l, li) => {
      for (const t of tokens(l.text)) {
        P.push(t.word);
        pLine.push(li);
      }
    });
    const toR = align(P, R.words);
    const toO = align(P, O.words);
    lineOfOur = new Int32Array(O.words.length).fill(-1);
    for (let i = 0; i < O.words.length; i++) if (toO.inv[i] >= 0) lineOfOur[i] = pLine[toO.inv[i]];
    // line → [first P, last P]
    const first = new Int32Array(lines.length).fill(-1);
    const last = new Int32Array(lines.length).fill(-1);
    pLine.forEach((li, p) => {
      if (first[li] < 0) first[li] = p;
      last[li] = p;
    });
    // The line's first / last word's position in the other stream. A line none of whose words aligned (Chilcot's
    // names are missing from the tags, so some whole lines are) borrows the nearest aligned word on a neighbouring
    // line, within about six lines of words, and says so with `near`.
    const SPAN = 60;
    const firstMapped = (li: number, m: Int32Array) => {
      for (let p = first[li]; p >= 0 && p < m.length && p <= last[li] + SPAN; p++) if (m[p] >= 0) return { p, v: m[p] - (p - first[li]), near: p > last[li] };
      return null;
    };
    const lastMapped = (li: number, m: Int32Array) => {
      // the last aligned word itself: trailing unaligned words are usually a footnote number
      for (let p = last[li]; p >= Math.max(0, first[li] - SPAN); p--) if (m[p] >= 0) return { p, v: m[p], near: p < first[li] };
      return null;
    };
    const share = (li: number, m: Int32Array) => {
      let n = 0;
      for (let p = first[li]; p <= last[li]; p++) if (m[p] >= 0) n++;
      return n / (last[li] - first[li] + 1);
    };
    // A body line is one whose words are in the reference, or in ours (the reference may lack words: names
    // marked up as links) and that is not a footnote line; running heads and page numbers are in neither.
    const bodyLine = (li: number) => {
      const L = lines[li];
      if (first[li] < 0 || L.note) return false;
      if (share(li, toR.map) >= 0.5) return true;
      // running heads and page numbers sit in the margins and may match words elsewhere in ours (its contents list)
      const margin = L.top < 0.08 * L.pageHeight || L.top > 0.92 * L.pageHeight;
      return !margin && share(li, toO.map) >= 0.5;
    };
    let prev = -1;
    for (let li = 0; li < lines.length; li++) {
      if (!bodyLine(li)) continue;
      if (prev >= 0) {
        const a = lastMapped(prev, toR.map);
        const b = firstMapped(li, toR.map);
        const ao = lastMapped(prev, toO.map);
        const bo = firstMapped(li, toO.map);
        if (a && b && b.v <= a.v) b.v = a.v + 1;
        if (a && b && b.v - a.v <= 3 + (b.p - a.p)) {
          const rk = R.owner[Math.min(b.v, R.words.length - 1)];
          // a line none of whose words are in the reference (its tags dropped the paragraph) has no reference answer
          const included = d.refIncluded[rk] && !a.near && !b.near;
          const refBoundary = anyIn(refStarts, a.v, b.v);
          if (ao && bo && bo.v <= ao.v) bo.v = ao.v + 1;
          const ourBoundary = ao && bo ? anyIn(ourStarts, ao.v, bo.v) : null;
          const ok = ourBoundary === null ? null : ourBoundary === refBoundary;
          const L1 = lines[prev];
          const L2 = lines[li];
          const ob = bo ? ours.body[O.owner[Math.min(bo.v, O.words.length - 1)]] : null;
          const row: Row = {
            report,
            decision: "boundary",
            source: "layout",
            page: L2.page,
            printed_page: ob?.page ?? null,
            pid: ob?.pid ?? null,
            ref_boundary: included ? refBoundary : null,
            ref_next_type: included ? refBody[rk].type : null,
            ref_prev_type: d.refIncluded[R.owner[Math.min(a.v, R.words.length - 1)]] ? refBody[R.owner[Math.min(a.v, R.words.length - 1)]].type : null,
            ours_boundary: ourBoundary,
            ours_next_type: ob?.type ?? null,
            correct: included ? ok : null,
            crosses_page: L1.page !== L2.page,
            column: L2.column ?? null,
            skipped_lines: li - prev - 1,
            prev_ref_unaligned: a.near,
            next_ref_unaligned: b.near,
            ref_covered: included,
            gap_after: L1.page === L2.page ? L2.top - (L1.top + L1.height) : null,
            line_spacing: L1.page === L2.page ? L2.top - L1.top : null,
            font_change: L1.font !== L2.font,
            size_change: Math.round((L2.size - L1.size) * 10) / 10,
            ...textShape("prev", L1.text),
            ...textShape("next", L2.text),
            ...lineFeatures("prev", L1, stats, modalSize),
            ...lineFeatures("next", L2, stats, modalSize),
            prev_text: L1.text.slice(-60),
            next_text: L2.text.slice(0, 60),
          };
          const flags = labelFlags(row);
          row.label_confidence = included ? (flags.length ? "low" : "high") : null;
          row.label_flags = included ? (flags.length ? flags.join(",") : null) : a.near || b.near ? "line-not-in-reference" : null;
          rows.push(row);
        }
      }
      prev = li;
    }
  } else {
    // observable decisions only: our block starts, and reference starts we did not reproduce
    ours.body.forEach((b, k) => {
      if (d.ourBoundary[k] === "unmapped") return;
      const prevB = k > 0 ? ours.body[k - 1] : null;
      rows.push({ report, decision: "boundary", source: "blocks", page: null, printed_page: b.page, pid: b.pid, ref_boundary: d.ourBoundary[k] === "tp", ours_boundary: true, correct: d.ourBoundary[k] === "tp", crosses_page: b.afterPageBreak, ...textShape("prev", prevB?.text ?? ""), ...textShape("next", b.text), prev_text: prevB?.text.slice(-60) ?? null, next_text: b.text.slice(0, 60) });
    });
    refBody.forEach((b, k) => {
      if (!d.refIncluded[k] || d.refBoundaryHit[k] || !BOUNDARY_TYPES.has(b.type)) return;
      rows.push({ report, decision: "boundary", source: "blocks", ref_boundary: true, ours_boundary: false, correct: false, ref_next_type: b.type, ...textShape("next", b.text), next_text: b.text.slice(0, 60) });
    });
  }

  // block and heading rows
  ours.body.forEach((b, k) => {
    const li = lineOfOur && O.end[k] > O.start[k] ? (() => {
      for (let i = O.start[k]; i < Math.min(O.end[k], O.start[k] + 5); i++) if (lineOfOur![i] >= 0) return lineOfOur![i];
      return -1;
    })() : -1;
    const L = li >= 0 ? lines[li] : undefined;
    const prevB = k > 0 ? ours.body[k - 1] : null;
    const refType = d.ourRefType[k];
    const base: Row = {
      report,
      page: L?.page ?? null,
      printed_page: b.page,
      pid: b.pid,
      line: b.line,
      ours_type: b.type,
      ref_type: refType,
      after_page_break: b.afterPageBreak,
      prev_type: prevB?.type ?? null,
      prev_ends_sentence: prevB ? endsSentence(prevB.text) : null,
      markers: b.markers.length,
      ...textShape("text", b.text),
      ...lineFeatures("line", L, stats, modalSize),
      text: b.text.slice(0, 100),
    };
    rows.push({ decision: "block", ...base, correct: refType === null ? null : refType === b.type || (refType === "list" && b.type === "contents") });
    const words = b.text.split(/\s+/).length;
    if (b.type === "heading" || words <= 25) {
      const s = d.ourStart[k];
      let refHeading: boolean | null = null;
      let refLevel: number | null = null;
      if (s !== null && d.refIncluded[R.owner[s]]) {
        const rk = R.owner[s];
        const atStart = Math.abs(R.start[rk] - s) <= TOLERANCE;
        refHeading = atStart && refBody[rk].type === "heading";
        refLevel = refHeading ? refBody[rk].level : null;
      }
      rows.push({ decision: "heading", ...base, ref_heading: refHeading, ref_level: refLevel, ours_heading: b.type === "heading", ours_level: b.level, correct: refHeading === null ? null : refHeading === (b.type === "heading") });
    }
  });

  // marker rows
  for (const m of d.refMarkers) {
    const i = m.rpos - 1 >= 0 ? body.inv[m.rpos - 1] : -1;
    const ob = i >= 0 ? ours.body[O.owner[i]] : null;
    const L = lineOfOur && i >= 0 && lineOfOur[i] >= 0 ? lines[lineOfOur[i]] : undefined;
    rows.push({ report, decision: "marker", page: L?.page ?? null, printed_page: ob?.page ?? null, pid: ob?.pid ?? null, label: m.label, ref_marker: true, outcome: m.outcome, correct: m.outcome === "linked", line_superscript: L?.superscript ?? null, before: R.words.slice(Math.max(0, m.rpos - 6), m.rpos).join(" "), after: R.words.slice(m.rpos, m.rpos + 4).join(" ") });
  }
  for (const r of rows) {
    if (r.decision === "boundary" && r.label_confidence === undefined) {
      const flags = labelFlags(r);
      r.label_confidence = r.ref_boundary === null || r.ref_boundary === undefined ? null : flags.length ? "low" : "high";
      r.label_flags = flags.length ? flags.join(",") : null;
    }
  }
  return rows;
}
