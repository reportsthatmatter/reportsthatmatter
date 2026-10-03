/** Reads local and stored passages and plans the reindex of one report; shared by the reindex CLI and `publish-report --dry-run`. */
import { maxRowid, readCounter, readStored, readVersionRow, type Runner, type StoredRead, type Target, type VersionRow } from "./d1";
import { estimateFullWrites, estimateWrites, layoutAfter, planReindex, type Cost, type Placement, type Plan, DEFAULT_COST } from "./reindex";
import { readReportPassages } from "./report-passages";

type Extract = Parameters<typeof readReportPassages>[2];

export type ReindexPlan = {
  report: string;
  contentVersion: string;
  /** The version row already says this content is indexed, so nothing needs writing. */
  current: boolean;
  plan: Plan;
  passages: ReturnType<typeof readReportPassages>["passages"];
  writes: number;
  fullWrites: number;
  version: VersionRow;
  /** How the stored rows were read; absent when `current` (nothing was read but the version row). */
  read?: StoredRead;
  /** Rows D1 reported reading for this plan (0 where it does not report it, e.g. a local wrangler). */
  rowsRead: number;
};

export function planReport(opts: { root: string; report: string; target: Target; run: Runner; extract: Extract; cost?: Cost; force?: boolean }): ReindexPlan {
  const cost = opts.cost ?? DEFAULT_COST;
  const before = readCounter.rowsRead;
  const { contentVersion, passages } = readReportPassages(opts.root, opts.report, opts.extract);
  const version = readVersionRow(opts.run, opts.target, opts.report);
  const current = !opts.force && version.contentVersion === contentVersion;
  // When the version row already matches there is nothing to diff, and reading every stored row is the expensive part.
  if (current) {
    const none: Plan = { insert: [], deleteRowids: [], unchanged: passages.length, added: 0, changed: 0, removed: 0, stored: passages.length, local: passages.length };
    return { report: opts.report, contentVersion, current, plan: none, passages, writes: cost.version, fullWrites: estimateFullWrites(passages.length, passages.length, cost), version, rowsRead: readCounter.rowsRead - before };
  }
  const read = readStored(opts.run, opts.target, opts.report, version.layout);
  const plan = planReindex(passages, read.rows);
  return { report: opts.report, contentVersion, current, plan, passages, writes: estimateWrites(plan, cost), fullWrites: estimateFullWrites(passages.length, read.rows.length, cost), version, read, rowsRead: readCounter.rowsRead - before };
}

/**
 * Where the new rows go and the layout to record, for a database with migration 0004's column (else undefined:
 * the statements then leave rowids and the layout alone, as before). Reads the table's highest rowid, which
 * costs nothing; call it just before applying, since the new rows go above it.
 */
export function placement(p: ReindexPlan, run: Runner, target: Target, indexedAt: number): Placement | undefined {
  if (!p.version.hasLayoutColumn) return undefined;
  const expectIndexedAt = p.version.indexedAt;
  if (p.current) return { firstRowid: 0, layout: p.version.layout ? { ...p.version.layout, at: indexedAt } : null, expectIndexedAt };
  const firstRowid = maxRowid(run, target) + 1;
  return { firstRowid, layout: layoutAfter(p.read!.rows, p.read!.runs, p.plan, firstRowid, indexedAt), expectIndexedAt };
}

/** Rows a real (non-dry) run of this plan will read: the same read again, plus the highest rowid and the version check. */
export function estimatedReindexReads(p: ReindexPlan): number {
  return p.current ? 2 : p.rowsRead + 3;
}

export function describePlan(p: ReindexPlan): string {
  if (p.current) return `${p.report}: search index already matches this prerender (version ${p.contentVersion}); only its indexed-at stamp is refreshed (1 row write)`;
  const { plan } = p;
  const how = p.read?.via === "layout"
    ? `read through its recorded layout (${p.read.runs.length} rowid run(s))`
    : `read by scanning the whole table: ${p.read?.fallback ?? "no layout"}`;
  return (
    `${p.report}: ${plan.local.toLocaleString()} paragraph(s) to index, ${plan.stored.toLocaleString()} indexed: ` +
    `${plan.changed.toLocaleString()} changed, ${plan.added.toLocaleString()} new, ${plan.removed.toLocaleString()} gone, ${plan.unchanged.toLocaleString()} unchanged\n` +
    `  about ${p.writes.toLocaleString()} row write(s) (a full reindex would be ${p.fullWrites.toLocaleString()})\n` +
    `  stored rows ${how}${p.rowsRead ? `: ${p.rowsRead.toLocaleString()} rows read` : ""}`
  );
}
