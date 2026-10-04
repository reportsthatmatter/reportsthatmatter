/**
 * note-reference-sequence (G, reportsthatmatter-3ezs): within one run of notes,
 * the linked references should read 1..n in order, each once. A gap is a note
 * whose number no reference carries (a marker the pipeline did not link, or
 * read as something else); a repeat is a number referenced twice (a stray digit
 * read as a note, or a marker doubled by a page join); out of order is a
 * number that falls outside the longest increasing run of first appearances (a
 * note read from the wrong page, a column read in the wrong order, a stray
 * number read as a note). Each is a place the text and its
 * notes lost step, found by reading the linked references alone, so it does not
 * share the pairing (`note-marker-unpaired`) or the pipeline's own count.
 *
 * What a "run" is depends on the label:
 *
 * - `[^N-C]` (chapter-scoped notes: 9/11, Saville, Deepwater and Columbia with
 *   `layoutEndnotes`): one run per chapter, in reading order across the body.
 *   Which half of the label is the note and which the chapter is read off the
 *   definitions: the half with more distinct values is the note number (9/11's
 *   `[^4-1]` is note 4 of chapter 1; Saville's `[^1-442]` is note 442 of
 *   volume 1). The run is n long where n is the larger of its highest
 *   reference and its highest defined note, so a missing tail is a gap too.
 * - `[^N]`: one run through the report, except that a numbering that restarts
 *   begins a new run at a reference numbered 1, 2 or 3 that carries on k, k+1,
 *   k+2 after a run whose last two references were past k+2 (a chapter's note 1 after the previous
 *   chapter's note 60); the run is named for the heading it falls under. A lone
 *   low number is a stray, not a restart. A report whose numbering does not
 *   restart is one run, which is meaningful where its notes are linked at all.
 *
 * Gaps are judged only in a run where at least half the notes are linked: a run
 * where most markers never became links (Lehman's, Jack Smith's) would report
 * every one of them, which `bare-footnote-marker` already counts. Repeats and
 * out-of-order references are judged in every run. A stretch of consecutive
 * missing numbers is one finding.
 */
import { pageNumber } from "./blocks";
import { bodyOf } from "./note-pairing";
import type { Finding, Signal } from "./signals";

type Ref = { note: number; group: string; page: number | null; context: string; heading: string };

// A reference followed by a colon is a definition only at the start of a line: "…to Washington, DC[^357-50]:" is a reference.
const TOKEN = /^(#{2,3}) (.+)$|%%page ([^%]+)%%|\[\^(\d+)(?:-(\d+))?\](?!:(?<=^\[\^\d+(?:-\d+)?\]:))/gm;
const DEFINITION = /^\[\^(\d+)-(\d+)\]:/gm;

const clip = (text: string, n = 120) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/** For `[^a-b]` labels: whether the note number is the first half. More distinct values marks the note. */
function noteIsFirstHalf(markdown: string, refs: [number, number][]): boolean {
  const pairs = [...markdown.matchAll(DEFINITION)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
  const sample = pairs.length ? pairs : refs;
  return new Set(sample.map((p) => p[0])).size >= new Set(sample.map((p) => p[1])).size;
}

/** Indices of one longest strictly increasing subsequence of `values`. */
function longestIncreasing(values: number[]): Set<number> {
  const tails: number[] = []; // index into values of the smallest tail of an increasing run of each length
  const prev: number[] = new Array(values.length).fill(-1);
  values.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  });
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i);
  return keep;
}

export function noteSequenceFindings(markdown: string): Finding[] {
  const body = bodyOf(markdown);
  const raw = [...body.matchAll(TOKEN)];
  const dashed = raw.filter((m) => m[5] !== undefined).map((m) => [Number(m[4]), Number(m[5])] as [number, number]);
  const firstHalf = noteIsFirstHalf(markdown, dashed);

  // The highest defined note per group, for labels that name their chapter.
  const defined = new Map<string, number>();
  for (const m of markdown.matchAll(DEFINITION)) {
    const [note, group] = firstHalf ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
    defined.set(`ch${group}`, Math.max(defined.get(`ch${group}`) ?? 0, note));
  }

  const runs = new Map<string, Ref[]>();
  const order: string[] = [];
  let page: number | null = null;
  let heading = "(start)";
  let plainRun = 0;
  let last = 0;
  let beforeLast = 0;
  for (const m of raw) {
    if (m[1]) {
      heading = m[2];
      continue;
    }
    if (m[3] !== undefined) {
      page = pageNumber(m[3]);
      continue;
    }
    let note = Number(m[4]);
    let key: string;
    if (m[5] === undefined && note <= 3 && last > note + 2 && beforeLast > note + 2) {
      // A restart: the numbering starts over (1, 2 or 3) and carries on 1, 2, 3.
      // A lone low number is a stray (a reporter's volume in "2 U.S. 99"), not a new chapter.
      const after = raw.slice(raw.indexOf(m) + 1).filter((t) => t[4] !== undefined && t[5] === undefined).slice(0, 2);
      if (after.length === 2 && Number(after[0][4]) === note + 1 && Number(after[1][4]) === note + 2) plainRun += 1;
    }
    if (m[5] !== undefined) {
      const [a, b] = [Number(m[4]), Number(m[5])];
      note = firstHalf ? a : b;
      key = `ch${firstHalf ? b : a}`;
    } else {
      key = plainRun ? `run ${plainRun + 1}, from "${heading}"` : "report";
    }
    beforeLast = last;
    last = note;
    const at = m.index ?? 0;
    if (!runs.has(key)) {
      runs.set(key, []);
      order.push(key);
    }
    runs.get(key)!.push({ note, group: key, page, heading, context: body.slice(Math.max(0, at - 40), at + m[0].length + 20) });
  }

  const out: Finding[] = [];
  const add = (page: number | null, excerpt: string) => out.push({ signal: "note-reference-sequence", page, excerpt: clip(excerpt, 200) });
  for (const key of order) {
    const refs = runs.get(key)!;
    const seen = new Set<number>();
    const first: Ref[] = [];
    for (const r of refs) {
      if (seen.has(r.note)) {
        add(r.page, `repeat: note ${r.note} again in ${key} — ${clip(r.context, 90)}`);
        continue;
      }
      seen.add(r.note);
      first.push(r);
    }
    // Out of order is what is left outside a longest increasing run of first
    // appearances, so one stray number (a year read as note 202) is one finding,
    // not one for every reference that follows it.
    const keep = longestIncreasing(first.map((r) => r.note));
    first.forEach((r, i) => {
      if (keep.has(i)) return;
      const before = [...first.slice(0, i)].reverse().find((_, k) => keep.has(i - 1 - k));
      const after = first.slice(i + 1).find((_, k) => keep.has(i + 1 + k));
      add(r.page, `out of order: note ${r.note} in ${key} reads after ${before?.note ?? "the start"}, before ${after?.note ?? "the end"} — ${clip(r.context, 90)}`);
    });
    const max = Math.max(0, ...first.map((r) => r.note));
    const n = Math.max(max, defined.get(key) ?? 0);
    if (seen.size * 2 < n) continue;
    for (let i = 1; i <= n; i++) {
      if (seen.has(i)) continue;
      let j = i;
      while (j + 1 <= n && !seen.has(j + 1)) j++;
      add(null, `gap: ${j === i ? `note ${i}` : `notes ${i}-${j}`} never referenced in ${key} (${seen.size} of ${n} linked)`);
      i = j;
    }
  }
  return out;
}

export const noteReferenceSequence: Signal = {
  id: "note-reference-sequence",
  kind: "count",
  cls: "G",
  doc: "Within a run of notes (a chapter for `[^N-C]` labels; a run of `[^N]` that restarts at a heading), the linked references should read 1..n in order, each once. One finding per gap (a stretch of unreferenced numbers, judged only in a run where half the notes are linked), per repeated reference and per first appearance outside the longest increasing run (out of order).",
  run: (input) => noteSequenceFindings(input.markdown),
};
