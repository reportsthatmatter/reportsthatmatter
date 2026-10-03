/**
 * The shared-checkout guard (reportsthatmatter-m7ga).
 *
 * `~/src/reportsthatmatter/<repo>` is one git checkout shared by every concurrent session. `pnpm ingest run`,
 * `baseline` and `aggregate` write into (or copy out of) a report repo's working tree, so an agent that runs
 * them against the shared checkout dirties the repo for everyone else: three times in one session that broke a
 * peer's verify. The rule: those commands refuse to touch a report repo that is the shared checkout unless
 * `RTM_REPORT_DIRS` points at git worktrees of it, or the integrator passes `--shared` on purpose.
 *
 * "Shared" is: the directory is the manifest's default sibling location AND it is a repo's main working tree,
 * not a linked worktree (a worktree has a `--git-dir` different from its `--git-common-dir`). A worktree that
 * happens to sit at the default path is private to whoever made it, and a directory that is not a git repo has
 * no peers to disturb.
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** True: a linked worktree. False: a repo's main working tree. Null: not a git repo (or git failed). */
export function isLinkedWorktree(dir: string): boolean | null {
  if (!existsSync(dir)) return null;
  const out = spawnSync("git", ["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { encoding: "utf8" });
  if (out.status !== 0) return null;
  const [gitDir, common] = out.stdout.trim().split("\n");
  if (!gitDir || !common) return null;
  return real(gitDir) !== real(common);
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Is `dir` the shared checkout: the default sibling location, and a main working tree. */
export function isSharedCheckout(dir: string, defaultDir: string): boolean {
  if (!existsSync(dir) || !existsSync(defaultDir)) return false;
  if (real(dir) !== real(defaultDir)) return false;
  return isLinkedWorktree(dir) === false;
}

export type Target = { id: string; dir: string; defaultDir: string };

/** The targets that are the shared checkout. Empty when `--shared` was passed. */
export function sharedTargets(targets: Target[], opts: { shared: boolean }): Target[] {
  if (opts.shared) return [];
  return targets.filter((t) => isSharedCheckout(t.dir, t.defaultDir));
}

/** The refusal: what happened, how to make worktrees, and the integrator's opt-in. */
export function sharedMessage(command: string, offenders: Target[]): string {
  const ids = offenders.map((t) => t.id).join(" ");
  const list = offenders.map((t) => `    ${t.id}  ${t.dir}`).join("\n");
  return (
    `\`pnpm ingest ${command}\` refuses to touch the shared checkout of:\n${list}\n\n` +
    "  Concurrent sessions share that checkout; a run here dirties it for everyone (their verify fails on your full.md).\n" +
    "  Work in a git worktree of the report repo instead:\n\n" +
    `    pnpm ingest worktrees ${ids}\n` +
    "    export RTM_REPORT_DIRS=<the directory it prints>     # then re-run this command\n\n" +
    "  The integrator, writing the shared checkouts on purpose, passes --shared."
  );
}

/** What `pnpm ingest worktrees` will create: one entry per distinct repo. */
export type WorktreePlan = { id: string; repo: string; source: string; dest: string; exists: boolean };

export function worktreePlan(entries: Array<{ id: string; source: string }>, destRoot: string): WorktreePlan[] {
  const seen = new Set<string>();
  const plan: WorktreePlan[] = [];
  for (const { id, source } of entries) {
    const repo = basename(source);
    if (seen.has(repo)) continue;
    seen.add(repo);
    const dest = join(destRoot, repo);
    plan.push({ id, repo, source, dest, exists: existsSync(dest) });
  }
  return plan;
}
