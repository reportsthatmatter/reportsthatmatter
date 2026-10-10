/**
 * `pnpm worktrees prune` decisions (reportsthatmatter-6142), pure so tests can feed it facts.
 *
 * Written from two hand housekeeping passes (2026-10-04, 2026-10-09) and the failure of the second: it removed live
 * `*-1009` worktrees, with their unpushed local branches, in the middle of a session. So the tool:
 *  - plans first and prints a table (the default), and `--apply` re-reads every fact for a worktree immediately
 *    before removing it and removes only if it is STILL removable and its HEAD is still the one in the plan;
 *  - keeps anything touched in the last 24 hours (`--min-age`), whatever else is true: a live session's worktree is
 *    young; and anything with a commit on no remote, a real change, an open PR, or no proof of being merged;
 *  - never touches a main working tree (a shared checkout) or the worktree it is run from.
 */
export type PrState = "merged" | "open" | "closed" | "none" | "unknown";

export type Facts = {
  path: string;
  repo: string;
  /** The repo's main working tree: a shared checkout. */
  isMain: boolean;
  isCurrent: boolean;
  branch: string | null;
  head: string;
  /** HEAD is an ancestor of the repo's default branch on origin (main OR master). */
  mergedIntoDefault: boolean;
  /** `gh pr list --state all --head <branch>`: the newest PR's state, and whether its head oid is this HEAD. */
  pr: PrState;
  prHeadMatches: boolean;
  /** Commits reachable from HEAD that are on no remote branch (detached HEADs included). */
  unpushed: number;
  /** Changed or untracked paths, working tree against HEAD (the index is ignored: stale indexes show staged reverts). */
  changed: string[];
  /** `.scratch/` or similar holds files the owner has not copied out. */
  scratch: string[];
  ageHours: number;
  /** The path is a shared checkout's location (the site's, ingest's or a manifest report repo's), whatever git says. */
  shared?: boolean;
  /** A `<site worktree>-reports/<repo>` worktree whose site worktree still exists: that session's RTM_REPORT_DIRS. */
  owner?: string | null;
  /** Worktrees whose `node_modules/@rtm/ingest` (a `pnpm ingest link`) or `package.json` link: points into this one. */
  linkedFrom?: string[];
};

export type Verdict = { remove: boolean; reasons: string[]; derivedOnly: boolean };

/** Paths a build rewrites; a worktree whose only changes are these has nothing of its owner's in it. */
export const DERIVED = [
  /^assets\/generated\//,
  /^src\/generated\//,
  /^dist\//,
  /(^|\/)node_modules(\/|$)/,
  /^(\.cache|\.rtm-[\w-]+\.lock|build|score-out)(\/|$)/,
  /^(full\.md|baseline\.json|fidelity\.md)$/,
  /^reports\/[^/]+\/(full\.md|PROCESSING\.md)$/,
  /^(package\.json|pnpm-lock\.yaml)$/,
];

export const isDerived = (path: string): boolean => DERIVED.some((re) => re.test(path));

export function classify(f: Facts, opts: { minAgeHours?: number; keep?: RegExp[] } = {}): Verdict {
  const minAge = opts.minAgeHours ?? 24;
  const reasons: string[] = [];
  if (f.isMain) reasons.push("main working tree (a shared checkout)");
  if (f.shared && !f.isMain) reasons.push("a shared checkout's path (manifest, ingest or site)");
  if (f.owner) reasons.push(`belongs to the site worktree ${f.owner} (its RTM_REPORT_DIRS)`);
  if (f.linkedFrom?.length) reasons.push(`linked as @rtm/ingest from ${f.linkedFrom.slice(0, 2).join(", ")}`);
  if (f.isCurrent) reasons.push("the worktree this command runs from");
  if (opts.keep?.some((re) => re.test(f.path))) reasons.push("on the keep list");
  if (f.ageHours < minAge) reasons.push(`touched ${f.ageHours.toFixed(1)}h ago (< ${minAge}h): a live session may own it`);
  if (f.unpushed > 0) reasons.push(`${f.unpushed} commit(s) on no remote`);
  const real = f.changed.filter((p) => !isDerived(p));
  if (real.length) reasons.push(`${real.length} real change(s): ${real.slice(0, 3).join(", ")}${real.length > 3 ? ", ..." : ""}`);
  if (f.scratch.length) reasons.push(`scratch files to copy out (${f.scratch.slice(0, 2).join(", ")})`);
  if (f.pr === "open") reasons.push("an open PR");
  const merged = f.mergedIntoDefault || (f.pr === "merged" && f.prHeadMatches);
  if (!merged) reasons.push(f.pr === "merged" ? "its PR merged, but this HEAD is not the PR's head (later commits?)" : "not shown to be merged (not an ancestor of the default branch, no merged PR at this HEAD)");
  // A new branch made from origin/main (`git worktree add -b x origin/main`, `pnpm ingest worktrees`) is an ancestor of
  // main before its first commit: ancestry alone does not tell "merged" from "not started". Without a PR, keep it.
  else if (f.branch && (f.pr === "none" || f.pr === "unknown"))
    reasons.push("a branch with no PR whose HEAD is already on the default branch: not started yet, or merged without a PR (remove it by hand if it is done)");
  return { remove: reasons.length === 0, reasons, derivedOnly: f.changed.length > 0 && real.length === 0 };
}

/** Plan lines, one per worktree, keeps first with their reasons. */
export function formatPlan(rows: Array<{ facts: Facts; verdict: Verdict }>): string {
  const line = (r: { facts: Facts; verdict: Verdict }) =>
    `${r.verdict.remove ? "remove" : "keep  "}  ${r.facts.path}  [${r.facts.branch ?? `detached ${r.facts.head.slice(0, 8)}`}]${r.verdict.remove ? (r.verdict.derivedOnly ? "  (derived files only)" : "") : `\n          ${r.verdict.reasons.join("; ")}`}`;
  return rows.map(line).join("\n");
}
