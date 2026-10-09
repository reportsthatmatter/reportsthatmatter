/* Report, and remove the safe, stale agent worktrees (reportsthatmatter-6142).
 *
 *   pnpm worktrees                    the plan: every linked worktree of the site, ingest and the report repos under the
 *                                     projects directory, marked remove or keep, with why (writes nothing)
 *   pnpm worktrees prune              the same, as a plan
 *   pnpm worktrees prune --apply      remove the "remove" ones, re-reading every fact right before each removal
 *     --min-age <hours>               keep anything touched more recently (default 24)
 *     --keep <regex>                  keep paths matching (repeatable)
 *     --no-pr                         do not ask gh for PR state (squash-merged worktrees are then kept)
 *
 * Removable means: clean apart from build output, every commit on a remote, merged (an ancestor of the default branch,
 * main or master, or its PR merged at exactly this HEAD: squash merges are invisible to ancestry), no open PR, no
 * scratch files, not touched in the last 24 hours, not a main working tree or a shared checkout's path, not the one it
 * runs from. Also kept: a named branch with no PR whose HEAD is on main (not started yet: ancestry cannot tell that from
 * merged), a `<X>-reports/<repo>` worktree while the site worktree `<X>` exists, and an ingest worktree some checkout
 * links as its @rtm/ingest. Apply removes the worktree (symlinks are unlinked, never followed; `--force` only when its
 * changes are all build output, so git itself refuses a file that appears at the last moment), deletes its local
 * branch when it was merged, and prunes. It refuses a worktree whose HEAD or files moved since the plan was made. Nothing is removed without --apply. Logic and tests:
 * scripts/lib/worktrees.ts. The 2026-10-09 hand pass removed live worktrees; this is the guard against a repeat.
 */
import "./lib/help.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { classify, formatPlan, type Facts, type PrState, type Verdict } from "./lib/worktrees.ts";
import { reportDirs } from "./lib/report-dirs.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith("--") ? args[0] : "plan";
if (!["plan", "prune"].includes(cmd)) {
  console.error("usage: pnpm worktrees [prune [--apply]] [--min-age <hours>] [--keep <regex>] [--no-pr]");
  process.exit(2);
}
const apply = cmd === "prune" && args.includes("--apply");
const opt = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const minAgeHours = Number(opt("--min-age") ?? 24);
const keep = args.flatMap((a, i) => (a === "--keep" && args[i + 1] ? [new RegExp(args[i + 1])] : []));
const useGh = !args.includes("--no-pr");

const git = (dir: string, a: string[]) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8", maxBuffer: 1 << 26 });
const out = (dir: string, a: string[]) => {
  const r = git(dir, a);
  return r.status === 0 ? r.stdout.trim() : null;
};

// ---- which repos --------------------------------------------------------------------------------------------------

const mainOf = (dir: string): string | null => {
  const first = out(dir, ["worktree", "list", "--porcelain"])?.split("\n").find((l) => l.startsWith("worktree "));
  return first ? first.slice(9) : null;
};
const siteMain = mainOf(root)!;
const projects = dirname(siteMain);
const repos = new Map<string, string>(); // main working tree -> label
repos.set(siteMain, "site");
if (existsSync(join(projects, "ingest"))) repos.set(mainOf(join(projects, "ingest")) ?? join(projects, "ingest"), "ingest");
// Shared checkouts' paths, whatever git says about them: a shared checkout that is itself a linked worktree of a clone
// elsewhere would otherwise look like any other worktree (reviewer fixup, PR #299).
const sharedPaths = new Set<string>([resolve(siteMain), resolve(projects, "ingest"), resolve(projects, "reportsthatmatter")]);
for (const r of reportDirs(root).values()) {
  sharedPaths.add(resolve(r.defaultDir));
  const m = existsSync(r.defaultDir) ? mainOf(r.defaultDir) : null;
  if (m) repos.set(m, r.id);
}

type Listed = { path: string; head: string; branch: string | null; repo: string; main: string };
function listWorktrees(): Listed[] {
  const all: Listed[] = [];
  for (const [main, label] of repos) {
    const text = out(main, ["worktree", "list", "--porcelain"]) ?? "";
    for (const block of text.split("\n\n")) {
      const f = Object.fromEntries(block.split("\n").map((l) => [l.split(" ")[0], l.slice(l.indexOf(" ") + 1)]));
      if (!f.worktree || f.bare !== undefined) continue;
      all.push({ path: f.worktree, head: f.HEAD ?? "", branch: f.branch ? f.branch.replace(/^refs\/heads\//, "") : null, repo: label, main });
    }
  }
  return all.filter((w) => resolve(w.path).startsWith(projects + "/"));
}

// ---- facts --------------------------------------------------------------------------------------------------------

const real = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};
const inside = (p: string, dir: string) => p === dir || p.startsWith(dir + "/");

/** Where each checkout's @rtm/ingest points: its node_modules link (`pnpm ingest link`) and a package.json `link:` spec. */
function ingestTargets(paths: string[]): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (const from of paths) {
    const nm = real(join(from, "node_modules/@rtm/ingest"));
    if (nm) out.push({ from, to: nm });
    try {
      const spec: string | undefined = JSON.parse(readFileSync(join(from, "package.json"), "utf8")).dependencies?.["@rtm/ingest"];
      if (spec?.startsWith("link:")) out.push({ from, to: real(resolve(from, spec.slice(5))) ?? resolve(from, spec.slice(5)) });
    } catch {}
  }
  return out;
}

/** A `<X>-reports/<repo>` worktree belongs to the site worktree `<X>` (`pnpm ingest worktrees` makes them so). */
const ownerOf = (path: string): string | null => {
  const wrapper = dirname(resolve(path));
  if (!basename(wrapper).endsWith("-reports")) return null;
  const site = wrapper.slice(0, -"-reports".length);
  return existsSync(site) ? site : null;
};

const changedOf = (path: string): string[] =>
  [...new Set([...(out(path, ["diff", "HEAD", "--name-only"]) ?? "").split("\n"), ...(out(path, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n")].filter(Boolean))].sort();

const defaultBranch = (main: string): string => {
  const ref = out(main, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (ref) return ref;
  return out(main, ["rev-parse", "--verify", "-q", "origin/main"]) ? "origin/main" : "origin/master";
};

const prCache = new Map<string, Array<{ headRefName: string; headRefOid: string; state: string }>>();
function prs(main: string) {
  if (!prCache.has(main)) {
    const r = spawnSync("gh", ["pr", "list", "--state", "all", "--limit", "1000", "--json", "headRefName,headRefOid,state"], { cwd: main, encoding: "utf8" });
    prCache.set(main, r.status === 0 ? JSON.parse(r.stdout) : (null as never));
  }
  return prCache.get(main);
}

function ageHours(w: Listed, changed: string[]): number {
  const gitDir = out(w.path, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const probes = [w.path, ...(gitDir ? ["HEAD", "index", "logs/HEAD"].map((f) => join(gitDir, f)) : []), ...changed.slice(0, 200).map((p) => join(w.path, p))];
  const newest = Math.max(...probes.map((p) => { try { return statSync(p).mtimeMs; } catch { return 0; } }));
  return (Date.now() - newest) / 3_600_000;
}

function gather(w: Listed, links: Array<{ from: string; to: string }>): Facts {
  const head = out(w.path, ["rev-parse", "HEAD"]) ?? w.head;
  const dflt = defaultBranch(w.main);
  // Working tree against HEAD, plus untracked: the index is ignored, because a stale index shows staged reverts.
  const changed = changedOf(w.path);
  const scratchDir = join(w.path, ".scratch");
  const scratch = existsSync(scratchDir) ? readdirSync(scratchDir).map((f) => `.scratch/${f}`) : [];
  const unpushed = Number(out(w.path, ["rev-list", "--count", head, "--not", "--remotes"]) ?? 1);
  let pr: PrState = "none";
  let prHeadMatches = false;
  if (useGh && w.branch) {
    const list = prs(w.main);
    if (!list) pr = "unknown";
    else {
      const mine = list.filter((p) => p.headRefName === w.branch);
      if (mine.some((p) => p.state === "OPEN")) pr = "open";
      else if (mine.some((p) => p.state === "MERGED")) {
        pr = "merged";
        prHeadMatches = mine.some((p) => p.state === "MERGED" && p.headRefOid === head);
      } else if (mine.length) pr = "closed";
    }
  }
  return {
    path: w.path,
    repo: w.repo,
    isMain: resolve(w.path) === resolve(w.main),
    isCurrent: resolve(w.path) === resolve(root),
    branch: w.branch,
    head,
    mergedIntoDefault: git(w.path, ["merge-base", "--is-ancestor", head, dflt]).status === 0,
    pr,
    prHeadMatches,
    unpushed: Number.isFinite(unpushed) ? unpushed : 1,
    changed,
    scratch,
    ageHours: ageHours(w, changed),
    shared: sharedPaths.has(resolve(w.path)),
    owner: ownerOf(w.path),
    linkedFrom: (() => {
      const me = real(w.path) ?? resolve(w.path);
      return [...new Set(links.filter((l) => !inside(real(l.from) ?? l.from, me) && inside(l.to, me)).map((l) => l.from))];
    })(),
  };
}

const listed = listWorktrees();
const linksNow = () => ingestTargets([...repos.keys(), ...listWorktrees().map((w) => w.path)]);
const links = linksNow();
const rows = listed.map((w) => {
  const facts = gather(w, links);
  return { w, facts, verdict: classify(facts, { minAgeHours, keep }) };
});
const planned = rows.filter((r) => !r.facts.isMain).sort((a, b) => Number(b.verdict.remove) - Number(a.verdict.remove) || a.facts.path.localeCompare(b.facts.path));
console.log(formatPlan(planned));
const removable = planned.filter((r) => r.verdict.remove);
console.log(`\n${planned.length} linked worktree(s) in ${repos.size} repo(s): ${removable.length} removable, ${planned.length - removable.length} kept (min age ${minAgeHours}h).`);
if (!apply) {
  if (removable.length) console.log("Nothing removed. `pnpm worktrees prune --apply` removes the ones marked remove, after re-checking each.");
  process.exit(0);
}

// ---- apply: re-read everything, per worktree, immediately before removing -------------------------------------------

let removed = 0;
for (const r of removable) {
  prCache.clear();
  const again = gather(r.w, linksNow());
  const verdict: Verdict = classify(again, { minAgeHours, keep });
  if (again.head !== r.facts.head) {
    console.log(`  skip ${r.facts.path}: HEAD moved since the plan (${r.facts.head.slice(0, 8)} -> ${again.head.slice(0, 8)})`);
    continue;
  }
  if (!verdict.remove) {
    console.log(`  skip ${r.facts.path}: no longer removable (${verdict.reasons.join("; ")})`);
    continue;
  }
  // Last look, after the slow parts of gather (gh): anything written since means someone is in it.
  if (changedOf(r.facts.path).join("\n") !== again.changed.join("\n")) {
    console.log(`  skip ${r.facts.path}: its files changed while it was being checked`);
    continue;
  }
  // --force only for a tree whose changes are all build output; a clean one is removed without it, so git itself
  // refuses if a file appeared in the last moment.
  const rm = git(r.w.main, ["worktree", "remove", ...(again.derivedOnly ? ["--force"] : []), r.facts.path]);
  if (rm.status !== 0) {
    console.log(`  skip ${r.facts.path}: git worktree remove failed: ${rm.stderr.trim()}`);
    continue;
  }
  removed++;
  console.log(`  removed ${r.facts.path}`);
  if (r.facts.branch && again.unpushed === 0) git(r.w.main, ["branch", "-D", r.facts.branch]); // merged and pushed: squash merges defeat -d
}
for (const main of repos.keys()) git(main, ["worktree", "prune"]);
console.log(`\nremoved ${removed} of ${removable.length}.`);
