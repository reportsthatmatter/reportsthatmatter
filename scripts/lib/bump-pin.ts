/**
 * `pnpm bump-pin <version>` (reportsthatmatter-jsk3): the pin bump an integrator did by hand.
 *
 * The pin is `"@rtm/ingest": "github:reportsthatmatter/ingest#vX.Y.Z"` in the site's package.json and in every
 * report repo's. A frozen install (`CI=true pnpm install`) refuses a changed pin, so each repo needs
 * `pnpm install --no-frozen-lockfile` to refresh its lockfile. Pure parts here; the runner is scripts/bump-pin.ts.
 */
import { spawnSync } from "node:child_process";

/** "0.25.0" or "v0.25.0" to "v0.25.0"; null when it is not a release version. */
export function normaliseVersion(arg: string): string | null {
  const m = /^v?(\d+\.\d+\.\d+)$/.exec(arg.trim());
  return m ? `v${m[1]}` : null;
}

/** The pin spec with its tag replaced: `github:org/ingest#v0.24.0` + `v0.25.0`. Null when the spec has no `#tag`. */
export function pinWith(spec: string, tag: string): string | null {
  return /#[^#]+$/.test(spec) ? spec.replace(/#[^#]+$/, `#${tag}`) : null;
}

/** package.json text with the `@rtm/ingest` spec rewritten; throws when there is no entry. */
export function rewritePin(text: string, to: string): string {
  const next = text.replace(/("@rtm\/ingest"\s*:\s*")[^"]*(")/, `$1${to}$2`);
  if (next === text && !text.includes(`"${to}"`)) throw new Error('no "@rtm/ingest" entry to rewrite');
  return next;
}

export type BumpStep = { dir: string; label: string; from: string | null; to: string; argv: string[] };

/** Install is always `--no-frozen-lockfile`: that is the point. */
export const installArgv = (dir: string): string[] => ["pnpm", "-C", dir, "install", "--no-frozen-lockfile"];

// ---- committing the report repos' half (the integrator did this by hand in 18 repos) ----

/** The files a pin bump changes in a report repo, and the only ones it commits. */
export const PIN_FILES = ["package.json", "pnpm-lock.yaml"];

const git = (dir: string, ...args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });

/** The repo's default branch: origin/HEAD, else `main` or `master` if one exists locally, else the current branch. */
export function defaultBranch(dir: string): string | null {
  const head = git(dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (head.status === 0 && head.stdout.trim()) return head.stdout.trim().replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (git(dir, "show-ref", "--verify", "--quiet", `refs/heads/${b}`).status === 0) return b;
  const cur = git(dir, "symbolic-ref", "--short", "HEAD");
  return cur.status === 0 ? cur.stdout.trim() : null;
}

export type CommitResult =
  | { kind: "unchanged" }
  | { kind: "skipped"; reason: string }
  | { kind: "committed"; branch: string; pushed: boolean; error?: string };

/** Paths with changes other than the pin files (porcelain status lines). */
function otherChanges(dir: string): string[] {
  const out = git(dir, "status", "--porcelain");
  return out.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((p) => !PIN_FILES.includes(p));
}

/**
 * Commits package.json and pnpm-lock.yaml (only those) on the repo's default branch and pushes it. Never forces.
 * Skips a repo that is on another branch or has other uncommitted changes; says so rather than committing.
 */
export function commitPinBump(dir: string, tag: string, opts: { push: boolean; dry?: boolean }): CommitResult {
  const branch = defaultBranch(dir);
  const current = git(dir, "symbolic-ref", "--short", "HEAD").stdout.trim();
  const changed = git(dir, "status", "--porcelain", "--", ...PIN_FILES).stdout.trim();
  if (!changed) return { kind: "unchanged" };
  if (!branch || current !== branch) return { kind: "skipped", reason: `on ${current || "a detached HEAD"}, not its default branch ${branch ?? "(unknown)"}` };
  const other = otherChanges(dir);
  if (other.length) return { kind: "skipped", reason: `other uncommitted changes (${other.slice(0, 3).join(", ")}${other.length > 3 ? ", ..." : ""})` };
  if (opts.dry) return { kind: "committed", branch, pushed: opts.push };
  const files = PIN_FILES.filter((f) => git(dir, "status", "--porcelain", "--", f).stdout.trim());
  const add = git(dir, "add", "--", ...files);
  if (add.status !== 0) return { kind: "skipped", reason: `git add failed: ${add.stderr.trim()}` };
  const commit = git(dir, "commit", "-q", "-m", `Bump @rtm/ingest to ${tag}`, "--", ...files);
  if (commit.status !== 0) return { kind: "skipped", reason: `git commit failed: ${(commit.stderr || commit.stdout).trim()}` };
  if (!opts.push) return { kind: "committed", branch, pushed: false };
  const push = git(dir, "push", "origin", branch);
  return push.status === 0 ? { kind: "committed", branch, pushed: true } : { kind: "committed", branch, pushed: false, error: push.stderr.trim() };
}
