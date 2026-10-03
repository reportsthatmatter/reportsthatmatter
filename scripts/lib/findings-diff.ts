/**
 * What the quality tools flagged under two ingests, and which findings appeared or vanished between them
 * (reportsthatmatter-38s.18). A count that moved from 36 to 39 says three things changed; this says which three.
 *
 * Three sources are normalised to one shape: the layout oracle (`pnpm ingest verify --findings-json`), the independent
 * page-anchor check (`pnpm ingest anchors --json`) and the quality signals (`src/lib/quality`, carried in the snapshot).
 * A finding is keyed by source, signal and text, and never by a line number, an id or a page: those are what a change
 * to the pipeline moves (a page-break join shifts every later marker by a page), and the same defect in the same
 * words is the same finding. One whose page moved is counted as `moved`, not as appeared and vanished.
 */
import type { AnchorReport } from "../../src/lib/anchors";
import type { Finding } from "../../src/lib/quality/signals";

export type FindingSource = "oracle" | "anchors" | "quality";

export type NormFinding = { source: FindingSource; signal: string; where: string; text: string };

export type OracleFindingLike = { signal: string; volume: number; page: number; text: string };

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function fromOracle(findings: OracleFindingLike[]): NormFinding[] {
  return findings.map((f) => ({ source: "oracle", signal: f.signal, where: `vol ${f.volume} p.${f.page}`, text: clip(squash(f.text)) }));
}

export function fromAnchors(r: AnchorReport): NormFinding[] {
  const out: NormFinding[] = [];
  for (const v of r.verdicts.filter((x) => x.verdict === "wrong")) {
    out.push({ source: "anchors", signal: "markers-wrong", where: `%%page ${v.label}%% on vol ${v.page?.volume} p.${v.page?.pdfIndex}`, text: clip(squash(v.context ?? "")) });
  }
  for (const b of r.blocks.wrongBlocks.filter((x) => !x.unmarkedPage)) {
    out.push({ source: "anchors", signal: "blocks-wrong", where: `under %%page ${b.marker}%%, printed on ${b.printedOn}`, text: clip(squash(b.text)) });
  }
  for (const u of r.unmarked) out.push({ source: "anchors", signal: "pages-unmarked", where: `vol ${u.volume} p.${u.pdfIndex}`, text: `page ${u.label}` });
  return out;
}

export function fromQuality(findings: Finding[]): NormFinding[] {
  return findings.map((f) => ({ source: "quality", signal: f.signal, where: f.page === null ? "no printed page" : `printed p.${f.page}`, text: clip(squash(f.excerpt)) }));
}

const keyOf = (f: NormFinding) => `${f.source}\u0000${f.signal}\u0000${f.text}`;

export type FindingsDiff = {
  appeared: NormFinding[];
  vanished: NormFinding[];
  /** Findings on both sides with the same words but a different place (page, marker): the defect is still there. */
  moved: number;
  /** Per source and signal: count before, count after. Only signals present on either side. */
  counts: Array<{ source: FindingSource; signal: string; before: number; after: number }>;
};

/** Multiset difference: two identical findings on one side and one on the other is one that appeared or vanished. */
export function diffFindings(before: NormFinding[], after: NormFinding[]): FindingsDiff {
  const pool = new Map<string, NormFinding[]>();
  for (const f of before) pool.set(keyOf(f), [...(pool.get(keyOf(f)) ?? []), f]);
  // twins in the same place pair first, so identical findings on different pages do not steal each other's match
  const rest: NormFinding[] = [];
  for (const f of after) {
    const hit = pool.get(keyOf(f));
    const i = hit?.findIndex((h) => h.where === f.where) ?? -1;
    if (i === -1) rest.push(f);
    else hit!.splice(i, 1);
  }
  const appeared: NormFinding[] = [];
  let moved = 0;
  for (const f of rest) {
    const hit = pool.get(keyOf(f));
    if (hit?.length) (hit.pop(), moved++);
    else appeared.push(f);
  }
  const vanished = [...pool.values()].flat();
  const tally = (list: NormFinding[]) => {
    const m = new Map<string, number>();
    for (const f of list) m.set(`${f.source}\u0000${f.signal}`, (m.get(`${f.source}\u0000${f.signal}`) ?? 0) + 1);
    return m;
  };
  const b = tally(before);
  const a = tally(after);
  const counts = [...new Set([...b.keys(), ...a.keys()])].sort().map((k) => {
    const [source, signal] = k.split("\u0000");
    return { source: source as FindingSource, signal, before: b.get(k) ?? 0, after: a.get(k) ?? 0 };
  });
  return { appeared, vanished, moved, counts };
}

/** One report's findings diff for a terminal or a PR body: the signals that moved, then the findings themselves. */
export function formatFindingsDiff(id: string, d: FindingsDiff, limit: number): string {
  const moved = d.moved ? ` (${d.moved} more only changed page)` : "";
  if (!d.appeared.length && !d.vanished.length) return `${id}: no finding appeared or vanished${moved}`;
  const lines = [`${id}: ${d.appeared.length} appeared, ${d.vanished.length} vanished${moved}`];
  for (const c of d.counts.filter((x) => x.before !== x.after)) lines.push(`  ${c.source} ${c.signal}: ${c.before} → ${c.after}`);
  const list = (mark: string, items: NormFinding[]) => {
    const bySignal = new Map<string, NormFinding[]>();
    for (const f of items) bySignal.set(`${f.source} ${f.signal}`, [...(bySignal.get(`${f.source} ${f.signal}`) ?? []), f]);
    for (const [name, fs] of bySignal) {
      for (const f of fs.slice(0, limit)) lines.push(`  ${mark} ${name} · ${f.where} · ${f.text}`);
      if (fs.length > limit) lines.push(`  ${mark} … ${fs.length - limit} more ${name}`);
    }
  };
  list("+", d.appeared);
  list("−", d.vanished);
  return lines.join("\n");
}
