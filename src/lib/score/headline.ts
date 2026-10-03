/**
 * The headline numbers `pnpm score` records in docs/scores.json (38s.6), and the arithmetic around them:
 * page-break join accuracy over all rows, high-confidence rows and adjudicated rows; the reference's own
 * error rate and the ceiling that says when a reference is too noisy to trust a score taken against it;
 * the dev / held-out split; the previous value and the delta.
 */
import type { Row } from "./decisions";
import type { AdjudicationStats } from "./adjudicated";
import type { SummaryRow } from "./report";

/** A reference whose wrong-answer rate plus its no-answer share exceeds this is too noisy to tune against. */
export const REFERENCE_CEILING = { error: 0.05, noAnswer: 0.1 };

export type Metrics = Record<string, number | null>;

export type JoinAccuracy = { right: number; n: number };

/** Page-break rows (a break between two printed lines on different pages) the reference has an answer for. */
export function pageBreakRows(rows: Row[]): Row[] {
  return rows.filter((r) => r.decision === "boundary" && r.source === "layout" && r.crosses_page === true && r.ref_boundary !== null && r.ref_boundary !== undefined);
}

const acc = (rows: Row[]): JoinAccuracy => ({ right: rows.filter((r) => r.ours_boundary === r.ref_boundary).length, n: rows.length });

/** Page-break join accuracy: all rows the reference covers, the high-confidence ones, and adjudicated rows (ours wrong / judged). */
export function joinAccuracy(rows: Row[], adj: AdjudicationStats | null) {
  const pb = pageBreakRows(rows);
  return {
    all: acc(pb),
    high: acc(pb.filter((r) => r.label_confidence === "high")),
    adjudicated: adj ? { oursWrong: adj.oursWrong, judged: adj.oursJudged } : null,
  };
}

const ratio = (a: JoinAccuracy) => (a.n ? a.right / a.n : null);

/** Page-level reference totals (bead 7d4y: src/lib/score/pages.ts `scorePages(...).totals`), where a report has them. */
export type PageTotals = { pages: number; wer: number; markerP: number; markerR: number };

/** The flat, diffable headline for one report. A metric the report has no reference for is null, never 0. */
export function headline(row: SummaryRow, rows: Row[], adj: AdjudicationStats | null, pages: PageTotals | null = null): Metrics {
  const j = joinAccuracy(rows, adj);
  const hasMarkers = row.refMarkers > 0;
  return {
    boundary_p: row.boundaryP,
    boundary_r: row.boundaryR,
    boundary_f1: row.boundaryF1,
    join_all: ratio(j.all),
    join_all_n: j.all.n,
    join_high: ratio(j.high),
    join_high_n: j.high.n,
    join_adj_ours_wrong: j.adjudicated ? j.adjudicated.oursWrong : null,
    join_adj_judged: j.adjudicated ? j.adjudicated.judged : null,
    marker_p: hasMarkers ? row.markerP : null,
    marker_r: hasMarkers ? row.markerR : null,
    wer: row.wer,
    wer_ref_coverage: row.refCoverage,
    wer_pages: pages ? pages.wer : null,
    wer_pages_n: pages ? pages.pages : null,
    page_marker_p: pages ? pages.markerP : null,
    page_marker_r: pages ? pages.markerR : null,
    ref_error_rate: adj ? adj.referenceErrorRate : null,
    ref_no_answer_rate: adj && adj.judged + adj.uncovered ? adj.uncovered / (adj.judged + adj.uncovered) : null,
    ref_unusable_rate: adj ? adj.referenceUnusableRate : null,
  };
}

/** Why scoring against this reference should not be trusted: no adjudication, or error plus no-answer share over the ceiling. */
export function referenceWarning(id: string, adj: AdjudicationStats | null, ceiling = REFERENCE_CEILING): string | null {
  if (!adj) return `${id}: no reference/adjudicated.yaml, so the reference's own error rate is unknown; scores against it are ungated (pnpm score ${id} --adjudicate-draft)`;
  const err = adj.referenceErrorRate ?? 0;
  const none = adj.judged + adj.uncovered ? adj.uncovered / (adj.judged + adj.uncovered) : 0;
  const limit = ceiling.error + ceiling.noAnswer;
  if (err + none > limit) return `${id}: reference error ${(err * 100).toFixed(1)}% plus no-answer share ${(none * 100).toFixed(1)}% exceeds the ceiling of ${(limit * 100).toFixed(0)}% (${ceiling.error * 100}% + ${ceiling.noAnswer * 100}%): too noisy to tune against`;
  return null;
}

/** Dev / held-out sets (reports/score-sets.yaml). */
export type ScoreSets = { development: string[]; heldOut: string[] };

export function setOf(sets: ScoreSets, id: string): "development" | "held-out" | null {
  return sets.development.includes(id) ? "development" : sets.heldOut.includes(id) ? "held-out" : null;
}

/** A stored entry: current metrics, the value before the last change, and when. */
export type Entry = { set: string; ingest?: string; metrics: Metrics; previous?: Metrics | null };
export type ScoresFile = { generated?: string; ingest?: string; reports: Record<string, Entry> };

const same = (a: Metrics, b: Metrics) => Object.keys({ ...a, ...b }).every((k) => (a[k] ?? null) === (b[k] ?? null));

/**
 * Merge a fresh run into the committed file. `previous` is the committed value when it differs from the new one;
 * when nothing moved the old `previous` is kept, so re-running does not erase the delta of the last change.
 */
export function mergeScores(old: ScoresFile | null, fresh: Record<string, Entry>, ingest?: string): ScoresFile {
  const reports: Record<string, Entry> = { ...(old?.reports ?? {}) };
  for (const [id, e] of Object.entries(fresh)) {
    const o = old?.reports?.[id];
    const previous = o ? (same(o.metrics, e.metrics) ? o.previous ?? null : o.metrics) : null;
    reports[id] = { set: e.set, ingest, metrics: e.metrics, previous };
  }
  return { ingest, reports: Object.fromEntries(Object.entries(reports).sort(([a], [b]) => a.localeCompare(b))) };
}

const COUNT = /_n$|_judged$|_wrong$/;
export const isCount = (k: string) => COUNT.test(k);

export function fmtMetric(k: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return isCount(k) ? String(v) : (v * 100).toFixed(1) + "%";
}

/** "+1.2" in points for a rate, "+3" for a count; empty when unchanged or unknown. */
export function fmtDelta(k: string, now: number | null | undefined, then: number | null | undefined): string {
  if (now === null || now === undefined || then === null || then === undefined || now === then) return "";
  const d = now - then;
  const s = isCount(k) ? String(d) : (d * 100).toFixed(1) + " pts";
  return (d > 0 ? "+" : "") + s;
}

/** Metrics where a lower value is better. */
export const LOWER_IS_BETTER = new Set(["wer", "wer_pages", "ref_error_rate", "ref_no_answer_rate", "ref_unusable_rate", "join_adj_ours_wrong"]);
const NEUTRAL = (k: string) => (isCount(k) && k !== "join_adj_ours_wrong") || k === "wer_ref_coverage" || k.startsWith("ref_");

/** Did this change make the report worse? Neutral metrics (counts, the reference's own error) never regress. */
export function regressed(k: string, now: number | null | undefined, then: number | null | undefined, tol = 0.0005): boolean {
  if (now === null || now === undefined || then === null || then === undefined || NEUTRAL(k)) return false;
  const d = now - then;
  return LOWER_IS_BETTER.has(k) ? d > tol : d < -tol;
}

export const HEADLINE_COLUMNS: { key: string; label: string }[] = [
  { key: "boundary_p", label: "boundary P" },
  { key: "boundary_r", label: "R" },
  { key: "boundary_f1", label: "F1" },
  { key: "join_all", label: "join, all rows" },
  { key: "join_high", label: "join, high-conf." },
  { key: "marker_p", label: "marker P" },
  { key: "marker_r", label: "R" },
  { key: "wer", label: "WER" },
  { key: "ref_error_rate", label: "reference error" },
];

const cell = (k: string, e: Entry, prev?: Metrics | null) => {
  const v = e.metrics[k];
  const d = prev ? fmtDelta(k, v, prev[k]) : "";
  const mark = prev && regressed(k, v, prev[k]) ? " ▼" : "";
  return fmtMetric(k, v) + (d ? ` (${d})` : "") + mark;
};

const adjCell = (e: Entry) => (e.metrics.join_adj_judged === null || e.metrics.join_adj_judged === undefined ? "n/a" : `${e.metrics.join_adj_ours_wrong} / ${e.metrics.join_adj_judged}`);

/**
 * A markdown table for a set of entries. `base` is what to diff against (the committed file at a ref, or each
 * entry's own `previous`); with neither, no deltas.
 */
export function headlineTable(reports: Record<string, Entry>, base?: Record<string, Entry> | "previous" | null): string {
  const head = ["report", ...HEADLINE_COLUMNS.map((c) => c.label), "ours wrong / judged (adjudicated)"];
  const lines = [`| ${head.join(" | ")} |`, `|${head.map((_, i) => (i ? "---:" : "---")).join("|")}|`];
  for (const [id, e] of Object.entries(reports)) {
    const prev = base === "previous" ? e.previous : base ? base[id]?.metrics : null;
    const adjPrev = prev && prev.join_adj_judged !== null && prev.join_adj_judged !== undefined ? ` (was ${prev.join_adj_ours_wrong} / ${prev.join_adj_judged})` : "";
    const adjNow = adjCell(e);
    const adjMark = prev && regressed("join_adj_ours_wrong", e.metrics.join_adj_ours_wrong, prev.join_adj_ours_wrong) ? " ▼" : "";
    lines.push(`| ${id} | ${HEADLINE_COLUMNS.map((c) => cell(c.key, e, prev)).join(" | ")} | ${adjNow}${prev && adjPrev && adjNow !== `${prev.join_adj_ours_wrong} / ${prev.join_adj_judged}` ? adjPrev : ""}${adjMark} |`);
  }
  return lines.join("\n");
}
