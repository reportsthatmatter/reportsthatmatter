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
 *   chapter's note 60), or at a reference k below half of the last two that
 *   carries on k+1..k+4 (a run whose first notes were never linked); the run is
 *   named for the heading it starts under. A lone low number is a stray, not a restart. A report whose numbering does not
 *   restart is one run, which is meaningful where its notes are linked at all.
 *   Where the definitions themselves restart (the same `[^N]:` defined more
 *   than once, as Leveson's per-chapter notes are), the runs are read off the
 *   definitions instead: a run starts at a definition numbered no higher than
 *   the one before it, and each reference belongs to the run of the definition
 *   it is served with (`resolveNoteReferences`, the renderer's own pairing),
 *   so a reference served with another chapter's note reads as out of order or
 *   a repeat there, and one paired with none stays in the run it sits in.
 *
 * Gaps are judged only in a run where at least half the notes are linked: a run
 * where most markers never became links (Lehman's, Jack Smith's) would report
 * every one of them, which `bare-footnote-marker` already counts. Repeats and
 * out-of-order references are judged in every run. A stretch of consecutive
 * missing numbers is one finding.
 */
import { pageNumber } from "./blocks";
import { bodyOf, pairNoteReferences } from "./note-pairing";
import type { Finding, Signal } from "./signals";

type Ref = { note: number; group: string; page: number | null; context: string; heading: string; seq: number };

/**
 * `fillGaps` labels the notes of a stretch it fills from the PDF `[^N-90xx]`
 * (9000 plus the gap's index), so they cannot collide with the edition's own
 * `[^N-C]`; the notes are the chapter's, split across two labels (Hillsborough:
 * chapter 7's note 1 is `[^1-7]`, its 2-95 `[^N-9014]`). Such a group is read as
 * part of the chapter label read next to it.
 */
const GAP_GROUP_BASE = 9000;

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

/**
 * Folds each gap-filled group (`ch9000` and up) into the chapter read just
 * before it, or failing that just after it, whose notes it does not repeat:
 * Hillsborough's `ch9019` (notes 27-58) sits between chapter 10's 1-26 and
 * 59-; `ch9010` (1-64) precedes chapter 4's 65-75.
 */
function mergeGapGroups(runs: Map<string, Ref[]>, order: string[], defined: Map<string, number>): void {
  const chapter = (key: string) => (/^ch(\d+)$/.exec(key) ? Number(key.slice(2)) : NaN);
  const all = [...runs.values()].flat().sort((a, b) => a.seq - b.seq);
  for (const key of [...order]) {
    if (!(chapter(key) >= GAP_GROUP_BASE)) continue;
    const refs = runs.get(key)!;
    const notes = new Set(refs.map((r) => r.note));
    const first = refs[0].seq;
    const last = refs[refs.length - 1].seq;
    const neighbour = (from: Ref[]) => from.find((r) => r.group !== key && chapter(r.group) < GAP_GROUP_BASE)?.group;
    const disjoint = (k: string | undefined) => k !== undefined && runs.has(k) && !runs.get(k)!.some((r) => notes.has(r.note));
    const before = neighbour(all.filter((r) => r.seq < first).reverse());
    const after = neighbour(all.filter((r) => r.seq > last));
    const into = disjoint(before) ? before : disjoint(after) ? after : undefined;
    if (!into) continue;
    const merged = [...runs.get(into)!, ...refs].sort((a, b) => a.seq - b.seq);
    runs.set(into, merged);
    runs.delete(key);
    order.splice(order.indexOf(key), 1);
    defined.set(into, Math.max(defined.get(into) ?? 0, defined.get(key) ?? 0));
  }
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

  // `[^N]` labels a numbering that restarts defines more than once (Leveson: per chapter); the
  // definitions then say where each run starts (a number not above the one before it), and each
  // reference belongs to the run of the definition it is served with.
  const plainDefs = [...markdown.matchAll(/^\[\^(\d+)\]:/gm)].map((m) => Number(m[1]));
  const byDefinitions = new Set(plainDefs).size < plainDefs.length;
  // each definition's run, by label and its index among that label's definitions
  const defRun = new Map<string, number[]>();
  const defMax: number[] = [];
  {
    let r = 0;
    plainDefs.forEach((n, i) => {
      if (i > 0 && n <= plainDefs[i - 1]) r += 1;
      if (!defRun.has(String(n))) defRun.set(String(n), []);
      defRun.get(String(n))!.push(r);
      defMax[r] = Math.max(defMax[r] ?? 0, n);
    });
  }
  // which definition each plain reference is served with: the renderer's own pairing
  const plainRefs = raw.filter((m) => m[4] !== undefined && m[5] === undefined);
  const pairing = byDefinitions ? pairNoteReferences(plainRefs.map((m) => m[4]), plainDefs.map(String)) : [];
  const servedRun = new Map<RegExpMatchArray, number | undefined>();
  plainRefs.forEach((m, i) => {
    const k = pairing[i];
    servedRun.set(m, k === null || k === undefined ? undefined : defRun.get(m[4])?.[k]);
  });
  const runName = new Map<number, string>();
  let lastDefRun = 0;

  const runs = new Map<string, Ref[]>();
  const order: string[] = [];
  let page: number | null = null;
  let heading = "(start)";
  let plainRun = 0;
  let runHeading = "";
  let last = 0;
  let beforeLast = 0;
  let seq = 0;
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
    // A restart: the numbering starts over and carries on consecutively. From
    // 1, 2 or 3 two more in step are enough; a run whose first notes were lost
    // (a Part whose opening page's markers were never linked starts at 10)
    // must start below half of where the last run ended and carry on four more
    // in step. A lone low number is a stray (a reporter's volume in
    // "2 U.S. 99"), and a page's markers read twice start just behind the run,
    // not far below it; neither is a new chapter.
    const low = note <= 3 ? last > note + 2 && beforeLast > note + 2 : note * 2 < last && note * 2 < beforeLast;
    if (m[5] === undefined && low && !byDefinitions) {
      const need = note <= 3 ? 2 : 4;
      const i = raw.indexOf(m);
      const after = raw.slice(i + 1).filter((t) => t[4] !== undefined && t[5] === undefined).slice(0, need);
      if (after.length === need && after.every((t, k) => Number(t[4]) === note + k + 1)) {
        plainRun += 1;
        // The run is named for the heading it starts under, and keeps that name
        // through the later headings it crosses (a Part's notes span its chapters).
        runHeading = heading;
      }
    }
    if (m[5] !== undefined) {
      const [a, b] = [Number(m[4]), Number(m[5])];
      note = firstHalf ? a : b;
      key = `ch${firstHalf ? b : a}`;
    } else if (byDefinitions) {
      // the run of the definition this reference is served with (an unpaired one stays in the run it sits in)
      const r = servedRun.get(m) ?? lastDefRun;
      lastDefRun = r;
      if (!runName.has(r)) runName.set(r, r === 0 ? "report" : `run ${r + 1}, from "${heading}"`);
      key = runName.get(r)!;
    } else {
      key = plainRun ? `run ${plainRun + 1}, from "${runHeading}"` : "report";
    }
    beforeLast = last;
    last = note;
    const at = m.index ?? 0;
    if (!runs.has(key)) {
      runs.set(key, []);
      order.push(key);
    }
    runs.get(key)!.push({ note, group: key, page, heading, seq: seq++, context: body.slice(Math.max(0, at - 40), at + m[0].length + 20) });
  }
  for (const [r, name] of runName) defined.set(name, Math.max(defined.get(name) ?? 0, defMax[r] ?? 0));
  mergeGapGroups(runs, order, defined);

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
