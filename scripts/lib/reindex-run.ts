/** Reads local and stored passages and plans the reindex of one report; shared by the reindex CLI and `publish-report --dry-run`. */
import { readIndexedVersion, readStoredPassages, type Runner, type Target } from "./d1";
import { estimateFullWrites, estimateWrites, planReindex, type Cost, type Plan, DEFAULT_COST } from "./reindex";
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
};

export function planReport(opts: { root: string; report: string; target: Target; run: Runner; extract: Extract; cost?: Cost; force?: boolean }): ReindexPlan {
  const cost = opts.cost ?? DEFAULT_COST;
  const { contentVersion, passages } = readReportPassages(opts.root, opts.report, opts.extract);
  const indexed = readIndexedVersion(opts.run, opts.target, opts.report);
  const current = !opts.force && indexed === contentVersion;
  // When the version row already matches there is nothing to diff, and reading every stored row is the expensive part.
  if (current) {
    const none: Plan = { insert: [], deleteRowids: [], unchanged: passages.length, added: 0, changed: 0, removed: 0, stored: passages.length, local: passages.length };
    return { report: opts.report, contentVersion, current, plan: none, passages, writes: cost.version, fullWrites: estimateFullWrites(passages.length, passages.length, cost) };
  }
  const stored = readStoredPassages(opts.run, opts.target, opts.report);
  const plan = planReindex(passages, stored);
  return { report: opts.report, contentVersion, current, plan, passages, writes: estimateWrites(plan, cost), fullWrites: estimateFullWrites(passages.length, stored.length, cost) };
}

export function describePlan(p: ReindexPlan): string {
  if (p.current) return `${p.report}: search index already matches this prerender (version ${p.contentVersion}); only its indexed-at stamp is refreshed (1 row write)`;
  const { plan } = p;
  return (
    `${p.report}: ${plan.local.toLocaleString()} paragraph(s) to index, ${plan.stored.toLocaleString()} indexed: ` +
    `${plan.changed.toLocaleString()} changed, ${plan.added.toLocaleString()} new, ${plan.removed.toLocaleString()} gone, ${plan.unchanged.toLocaleString()} unchanged\n` +
    `  about ${p.writes.toLocaleString()} row write(s) (a full reindex would be ${p.fullWrites.toLocaleString()})`
  );
}
