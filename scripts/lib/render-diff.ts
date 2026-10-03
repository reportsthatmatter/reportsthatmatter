/**
 * What a re-ingest did to a report's rendered page, from two snapshots (before: the pinned ingest; after: the
 * unreleased one). Pure: `scripts/ingest/snapshot.ts` writes the snapshots, `scripts/ingest/try.ts` prints this.
 *
 * Paragraphs are aligned by text, not id, because ids are what a change moves: a join of two paragraphs gives the
 * result a new id, and an id-keyed diff would call that one removal and one addition with no link between them.
 */

export type SnapshotParagraph = { id: string; text: string; section: string };

export type Snapshot = {
  id: string;
  words: number;
  sections: Array<{ slug: string; title: string; paragraphs: number }>;
  paragraphs: SnapshotParagraph[];
  /** Ids of sidenotes (`sn-…`), the footnote apparatus. */
  sidenotes: string[];
  /** Quality signal counts (src/lib/quality), when the report is in the registry. */
  quality?: Record<string, number>;
};

export type Hunk =
  | { kind: "join"; old: SnapshotParagraph[]; now: SnapshotParagraph[] }
  | { kind: "split"; old: SnapshotParagraph[]; now: SnapshotParagraph[] }
  | { kind: "changed"; old: SnapshotParagraph[]; now: SnapshotParagraph[] }
  | { kind: "added"; old: SnapshotParagraph[]; now: SnapshotParagraph[] }
  | { kind: "removed"; old: SnapshotParagraph[]; now: SnapshotParagraph[] }
  | { kind: "moved"; old: SnapshotParagraph[]; now: SnapshotParagraph[] };

export type ReportDiff = {
  id: string;
  words: [number, number];
  paragraphs: [number, number];
  sidenotes: [number, number];
  sectionsGone: string[];
  sectionsNew: string[];
  sectionsChanged: number;
  idsLost: number;
  idsNew: number;
  hunks: Hunk[];
  counts: Record<Hunk["kind"], number>;
  moved: boolean;
};

/** Text compared as the reader would: no whitespace, hyphens or case. A join that only re-spaces the text is still a join. */
export const norm = (text: string) => text.toLowerCase().replace(/[\s\-‐-―]+/g, "");

type Op = { kind: "eq" | "del" | "ins"; a?: number; b?: number };

/** Shortest edit script, Myers' O(ND), for a region small enough that D*D fits in memory. */
function myers(a: string[], b: string[], aOff: number, bOff: number, ops: Op[]): void {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return;
  const trace: Int32Array[] = [];
  let v = new Int32Array(2 * max + 2);
  const off = max;
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  const back: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const vv = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const prevX = vv[off + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      back.push({ kind: "eq", a: aOff + x, b: bOff + y });
    }
    if (x === prevX) {
      y--;
      back.push({ kind: "ins", b: bOff + y });
    } else {
      x--;
      back.push({ kind: "del", a: aOff + x });
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    back.push({ kind: "eq", a: aOff + x, b: bOff + y });
  }
  for (let i = back.length - 1; i >= 0; i--) ops.push(back[i]);
}

const MYERS_LIMIT = 1500;

/**
 * Edit script between two hash sequences: patience anchors (hashes unique to both sides, in longest increasing
 * order) split the problem, Myers solves each gap, and a gap too large for either is one replace. Linear in memory
 * for a re-ingest that moved every id of a 20,000-paragraph report.
 */
export function diffSequences(a: string[], b: string[]): Op[] {
  const ops: Op[] = [];
  const walk = (aLo: number, aHi: number, bLo: number, bHi: number) => {
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) ops.push({ kind: "eq", a: aLo++, b: bLo++ });
    const tail: Op[] = [];
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) tail.push({ kind: "eq", a: --aHi, b: --bHi });
    const flushTail = () => {
      for (let i = tail.length - 1; i >= 0; i--) ops.push(tail[i]);
    };
    if (aLo === aHi || bLo === bHi) {
      for (let i = aLo; i < aHi; i++) ops.push({ kind: "del", a: i });
      for (let j = bLo; j < bHi; j++) ops.push({ kind: "ins", b: j });
      return flushTail();
    }
    // anchors: hash occurring exactly once in each range
    const countA = new Map<string, number>();
    const countB = new Map<string, number>();
    for (let i = aLo; i < aHi; i++) countA.set(a[i], (countA.get(a[i]) ?? 0) + 1);
    for (let j = bLo; j < bHi; j++) countB.set(b[j], (countB.get(b[j]) ?? 0) + 1);
    const posB = new Map<string, number>();
    for (let j = bLo; j < bHi; j++) if (countB.get(b[j]) === 1 && countA.get(b[j]) === 1) posB.set(b[j], j);
    const pairs: Array<[number, number]> = [];
    for (let i = aLo; i < aHi; i++) {
      const j = posB.get(a[i]);
      if (j !== undefined && countA.get(a[i]) === 1) pairs.push([i, j]);
    }
    // longest increasing subsequence on j
    const tails: number[] = [];
    const prev: number[] = new Array(pairs.length).fill(-1);
    pairs.forEach(([, j], idx) => {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pairs[tails[mid]][1] < j) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prev[idx] = tails[lo - 1];
      tails[lo] = idx;
    });
    const anchors: Array<[number, number]> = [];
    for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) anchors.push(pairs[k]);
    anchors.reverse();
    if (!anchors.length) {
      if (aHi - aLo <= MYERS_LIMIT && bHi - bLo <= MYERS_LIMIT) myers(a.slice(aLo, aHi), b.slice(bLo, bHi), aLo, bLo, ops);
      else {
        for (let i = aLo; i < aHi; i++) ops.push({ kind: "del", a: i });
        for (let j = bLo; j < bHi; j++) ops.push({ kind: "ins", b: j });
      }
      return flushTail();
    }
    let ai = aLo;
    let bi = bLo;
    for (const [i, j] of anchors) {
      walk(ai, i, bi, j);
      ops.push({ kind: "eq", a: i, b: j });
      ai = i + 1;
      bi = j + 1;
    }
    walk(ai, aHi, bi, bHi);
    flushTail();
  };
  walk(0, a.length, 0, b.length);
  return ops;
}

const empty = (): Record<Hunk["kind"], number> => ({ join: 0, split: 0, changed: 0, added: 0, removed: 0, moved: 0 });

export function diffSnapshots(before: Snapshot, after: Snapshot): ReportDiff {
  const ha = before.paragraphs.map((p) => norm(p.text));
  const hb = after.paragraphs.map((p) => norm(p.text));
  const ops = diffSequences(ha, hb);

  // group consecutive non-equal ops into replace hunks
  const raw: Array<{ old: SnapshotParagraph[]; now: SnapshotParagraph[] }> = [];
  let cur: { old: SnapshotParagraph[]; now: SnapshotParagraph[] } | null = null;
  for (const op of ops) {
    if (op.kind === "eq") {
      cur = null;
      continue;
    }
    if (!cur) raw.push((cur = { old: [], now: [] }));
    if (op.kind === "del") cur.old.push(before.paragraphs[op.a!]);
    else cur.now.push(after.paragraphs[op.b!]);
  }

  // text that left one place and arrived in another is a move, not a removal plus an addition
  const addedAt = new Map<string, Array<{ h: number; p: SnapshotParagraph }>>();
  raw.forEach((h, hi) => h.now.forEach((p) => addedAt.set(norm(p.text), [...(addedAt.get(norm(p.text)) ?? []), { h: hi, p }])));
  const movedOld: SnapshotParagraph[] = [];
  const movedNow: SnapshotParagraph[] = [];
  const consumedNow = new Set<SnapshotParagraph>();
  const consumedOld = new Set<SnapshotParagraph>();
  raw.forEach((h, hi) => {
    // a replace hunk is not a pure move: only unmatched deletions in hunks with no insertion here, or elsewhere
    for (const p of h.old) {
      const hit = (addedAt.get(norm(p.text)) ?? []).find((x) => x.h !== hi && !consumedNow.has(x.p));
      if (hit && norm(p.text).length > 40) {
        consumedNow.add(hit.p);
        consumedOld.add(p);
        movedOld.push(p);
        movedNow.push(hit.p);
      }
    }
  });

  const hunks: Hunk[] = [];
  for (const h of raw) {
    const old = h.old.filter((p) => !consumedOld.has(p));
    const now = h.now.filter((p) => !consumedNow.has(p));
    if (!old.length && !now.length) continue;
    if (!old.length) hunks.push({ kind: "added", old, now });
    else if (!now.length) hunks.push({ kind: "removed", old, now });
    else if (old.length >= 2 && now.length === 1) hunks.push({ kind: "join", old, now });
    else if (old.length === 1 && now.length >= 2) hunks.push({ kind: "split", old, now });
    else hunks.push({ kind: "changed", old, now });
  }
  if (movedNow.length) hunks.push({ kind: "moved", old: movedOld, now: movedNow });

  const counts = empty();
  for (const h of hunks) counts[h.kind] += h.kind === "moved" ? h.now.length : 1;

  const oldIds = new Set(before.paragraphs.map((p) => p.id));
  const newIds = new Set(after.paragraphs.map((p) => p.id));
  const oldSlugs = new Set(before.sections.map((s) => s.slug));
  const newSlugs = new Set(after.sections.map((s) => s.slug));
  const oldBySlug = new Map(before.sections.map((s) => [s.slug, s]));
  return {
    id: before.id,
    words: [before.words, after.words],
    paragraphs: [before.paragraphs.length, after.paragraphs.length],
    sidenotes: [before.sidenotes.length, after.sidenotes.length],
    sectionsGone: [...oldSlugs].filter((s) => !newSlugs.has(s)),
    sectionsNew: [...newSlugs].filter((s) => !oldSlugs.has(s)),
    sectionsChanged: after.sections.filter((s) => oldBySlug.has(s.slug) && oldBySlug.get(s.slug)!.paragraphs !== s.paragraphs).length,
    idsLost: [...oldIds].filter((i) => !newIds.has(i)).length,
    idsNew: [...newIds].filter((i) => !oldIds.has(i)).length,
    hunks,
    counts,
    moved: hunks.length > 0 || before.words !== after.words,
  };
}

const clip = (text: string, n = 110) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const fmt = (n: number) => n.toLocaleString("en-US");
const arrow = ([a, b]: [number, number]) => (a === b ? fmt(a) : `${fmt(a)} → ${fmt(b)}`);

/** The join/move list for one report: a summary line, then up to `perKind` excerpts of each kind of change. */
export function formatDiff(d: ReportDiff, perKind = 3): string {
  if (!d.moved && !d.idsLost && !d.idsNew) return `  ✓ ${d.id}: rendered text unchanged`;
  const c = d.counts;
  const lines = [
    `  ✗ ${d.id}: words ${arrow(d.words)}, paragraphs ${arrow(d.paragraphs)}, sidenotes ${arrow(d.sidenotes)}`,
    `      joined ${c.join}, split ${c.split}, changed ${c.changed}, added ${c.added}, removed ${c.removed}, moved ${c.moved}; ids lost ${fmt(d.idsLost)}, new ${fmt(d.idsNew)}; sections gone ${d.sectionsGone.length}, new ${d.sectionsNew.length}, resized ${d.sectionsChanged}`,
  ];
  if (d.sectionsGone.length) lines.push(`      sections gone: ${d.sectionsGone.slice(0, 5).join(", ")}${d.sectionsGone.length > 5 ? ", …" : ""}`);
  if (d.sectionsNew.length) lines.push(`      sections new: ${d.sectionsNew.slice(0, 5).join(", ")}${d.sectionsNew.length > 5 ? ", …" : ""}`);
  for (const kind of ["join", "split", "changed", "added", "removed", "moved"] as const) {
    const of = d.hunks.filter((h) => h.kind === kind);
    for (const h of of.slice(0, perKind)) {
      if (h.kind === "moved") {
        lines.push(`      moved ${h.now.length} paragraph(s), e.g. ${h.old[0].id} → ${h.now[0].id}: ${clip(h.now[0].text)}`);
        continue;
      }
      lines.push(`      ${kind} ${h.old.length}→${h.now.length} in ${(h.now[0] ?? h.old[0]).section}`);
      for (const p of h.old.slice(0, 3)) lines.push(`        - [${p.id}] ${clip(p.text)}`);
      for (const p of h.now.slice(0, 3)) lines.push(`        + [${p.id}] ${clip(p.text)}`);
    }
    if (of.length > perKind && kind !== "moved") lines.push(`      …and ${of.length - perKind} more ${kind}`);
  }
  return lines.join("\n");
}
