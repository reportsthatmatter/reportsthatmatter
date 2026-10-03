/**
 * `pnpm ingest try <branch|path> [<id>...] [--no-score] [--layout] [--keep] [--limit N]`: what an unreleased @rtm/ingest does
 * to the rendered corpus, without touching a shared checkout and leaving this one as it was found
 * (reportsthatmatter-1w3).
 *
 *   pnpm ingest try ../ingest-fix-x              # a checkout or worktree of ingest (built if dist is stale)
 *   pnpm ingest try fix/hyphen-joins us-911-commission uk-leveson-inquiry
 *   pnpm ingest try --restore                    # undo a trial that was interrupted
 *
 * Steps: snapshot the site's rendered pages (the pinned ingest's output); make a throwaway git worktree of each
 * named report repo (the shared checkouts are never written); link the ingest into this site's node_modules and into
 * each trial worktree (report repos import @rtm/ingest from their own node_modules, so a site-only link fails with
 * "does not provide an export"); run each report; copy its markdown over the site's aggregate; prerender; snapshot
 * again; print the join/move list, the quality-count deltas and the score deltas; undo all of it.
 *
 * Everything it changes is recorded in `.rtm-try.lock` first, so `--restore` can undo a crashed trial.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { SIGNALS } from "../../src/lib/quality/signals.ts";
import { diffTable } from "../../src/lib/quality/diff.ts";
import { diffSnapshots, formatDiff, type Snapshot } from "../lib/render-diff.ts";
import { backupFile, lockPathFor, readLock, relink, restore, writeLock, type Lock } from "../lib/trial-links.ts";
// @ts-expect-error plain .mjs
import { staleReason } from "../prerender-stamp.mjs";

const ROOT = join(import.meta.dirname, "../..");
const say = (line = "") => console.log(line);
const run = (cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; log?: string } = {}) => {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, encoding: "utf8", maxBuffer: 1 << 28 });
  if (opts.log) writeFileSync(opts.log, `${r.stdout}\n${r.stderr}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})\n${(r.stderr || r.stdout).split("\n").slice(-25).join("\n")}`);
  return r.stdout;
};

function manifestIds(): Map<string, string> {
  const raw = parse(readFileSync(join(ROOT, "reports/manifest.yaml"), "utf8")) as { reports: Array<{ id: string; dir: string }> };
  return new Map(raw.reports.map((r) => [r.id, resolve(ROOT, r.dir)]));
}

/** The newest mtime under `dir`, to tell a stale dist from a built one. */
function newest(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

/** A path to a checkout, or a git ref of the shared ingest repo (made into a throwaway worktree). */
export function resolveIngest(source: string, tmp: string, lock: Lock): string {
  const ingestRepo = resolve(process.env.RTM_INGEST_DIR ?? join(ROOT, "../ingest"));
  let dir: string;
  if (existsSync(join(resolve(source), "package.json"))) dir = resolve(source);
  else {
    const ref = [source, `origin/${source}`].find((r) => spawnSync("git", ["-C", ingestRepo, "rev-parse", "--verify", "-q", `${r}^{commit}`]).status === 0);
    if (!ref) throw new Error(`${source} is neither a directory nor a ref of ${ingestRepo}`);
    dir = join(tmp, "ingest");
    run("git", ["-C", ingestRepo, "worktree", "add", "--detach", dir, ref]);
    lock.worktrees.push({ repo: ingestRepo, dir });
    writeLock(lockPathFor(ROOT), lock);
  }
  if (!existsSync(join(dir, "node_modules"))) {
    say(`  installing ${dir}`);
    run("pnpm", ["install", "--frozen-lockfile"], { cwd: dir, env: { CI: "true" } });
  }
  const built = join(dir, "dist/index.js");
  if (!existsSync(built) || newest(join(dir, "src")) > statSync(built).mtimeMs) {
    say(`  building ${dir}`);
    run("pnpm", ["build"], { cwd: dir });
  }
  return dir;
}

function snapshot(out: string, ids: string[]): Snapshot[] {
  run("pnpm", ["exec", "tsx", "scripts/ingest/snapshot.ts", out, ...ids]);
  return JSON.parse(readFileSync(out, "utf8")) as Snapshot[];
}

function withReference(ids: string[], dirs: Map<string, string>): string[] {
  return ids.filter((id) => existsSync(join(dirs.get(id)!, "reference/manifest.json")));
}

export async function runTry(argv: string[]): Promise<number> {
  const lockPath = lockPathFor(ROOT);
  if (argv.includes("--restore")) {
    const lock = readLock(lockPath);
    if (!lock) {
      say("nothing to restore (no .rtm-try.lock)");
      return 0;
    }
    for (const line of restore(lock, lockPath)) say(`  ${line}`);
    say("  now run: pnpm prerender");
    return 0;
  }
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--limit");
  const [source, ...named] = positional;
  if (!source) {
    console.error("usage: pnpm ingest try <branch|path> [<id>...] [--no-score] [--layout] [--keep] [--limit N]   |   pnpm ingest try --restore");
    return 1;
  }
  if (readLock(lockPath)) {
    console.error("A previous trial left .rtm-try.lock: run `pnpm ingest try --restore` first.");
    return 1;
  }
  const dirs = manifestIds();
  const registry = parse(readFileSync(join(ROOT, "reports/registry.yaml"), "utf8")) as { reports: Array<{ id: string }> };
  const inRegistry = new Set(registry.reports.map((r) => r.id));
  const ids = named.length ? named : [...dirs.keys()].filter((id) => inRegistry.has(id)).sort();
  for (const id of ids) {
    if (!dirs.has(id) || !inRegistry.has(id)) {
      console.error(`${id} is not in both reports/manifest.yaml and reports/registry.yaml`);
      return 1;
    }
  }
  const limit = Number(flags.includes("--limit") ? argv[argv.indexOf("--limit") + 1] : 3);
  const wantScore = !flags.includes("--no-score");
  // layout-based page-break rows need pdftohtml per report (slow): default to the block-level decisions
  const layoutFlag = flags.includes("--layout") ? [] : ["--no-layout"];

  if (staleReason()) {
    say("Prerendering the pinned state first (assets/generated/ was stale)");
    run("pnpm", ["prerender"]);
  }

  const tmp = mkdtempSync(join(tmpdir(), "rtm-try-"));
  const linkPath = join(ROOT, "node_modules/@rtm/ingest");
  const lock: Lock = { linkPath, originalTarget: null, files: [], worktrees: [], tmp, startedAt: new Date().toISOString() };
  const keep = flags.includes("--keep");
  let failure: unknown;
  let restored = false;
  const undo = () => {
    if (restored || keep) return;
    restored = true;
    const lines = restore(lock, lockPath);
    for (const l of lines) say(`  ${l}`);
  };
  process.on("SIGINT", () => {
    undo();
    process.exit(130);
  });

  try {
    writeLock(lockPath, lock);
    const ingestDir = resolveIngest(source, tmp, lock);
    const version = JSON.parse(readFileSync(join(ingestDir, "package.json"), "utf8")).version;
    say(`Trying @rtm/ingest ${version} from ${ingestDir} on ${ids.length} report(s)`);

    // before: the pinned ingest's rendered pages
    say("Snapshot with the pinned ingest …");
    const before = snapshot(join(tmp, "before.json"), ids);
    const scored = wantScore ? withReference(ids, dirs) : [];
    if (scored.length) run("pnpm", ["score", ...scored, "--out", join(tmp, "score-before"), ...layoutFlag], { log: join(tmp, "score-before.log") });

    // trial worktrees of the report repos
    const trialRepos = join(tmp, "repos");
    mkdirSync(trialRepos);
    for (const id of ids) {
      const repo = dirs.get(id)!;
      const dir = join(trialRepos, basename(repo));
      if (existsSync(dir)) continue;
      const branch = spawnSync("git", ["-C", repo, "branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
      if (branch !== "main") say(`  ! ${basename(repo)} is on ${branch || "a detached head"}, not main: the trial starts from what is checked out`);
      run("git", ["-C", repo, "worktree", "add", "--detach", dir, "HEAD"]);
      lock.worktrees.push({ repo, dir });
      writeLock(lockPath, lock);
      mkdirSync(join(dir, "node_modules/@rtm"), { recursive: true });
      symlinkSync(ingestDir, join(dir, "node_modules/@rtm/ingest"));
      // untracked inputs and caches the trial reads: shared, not copied (the layout cache is keyed by content)
      for (const extra of ["reference", ".cache"]) if (existsSync(join(repo, extra)) && !existsSync(join(dir, extra))) symlinkSync(join(repo, extra), join(dir, extra));
    }

    // link the ingest into the site, recording how to undo it before doing it
    lock.originalTarget = readlinkOrNull(linkPath);
    for (const id of ids) {
      for (const f of ["full.md", "PROCESSING.md"]) backupFile(lock, join(ROOT, "reports", id, f), join(tmp, "backup", id));
    }
    writeLock(lockPath, lock);
    relink(linkPath, ingestDir);

    // after: run, aggregate, prerender
    const env = { RTM_REPORT_DIRS: trialRepos };
    for (const id of ids) {
      const repo = join(trialRepos, basename(dirs.get(id)!));
      const siteCopy = join(ROOT, "reports", id, "full.md");
      if (existsSync(siteCopy) && existsSync(join(repo, "full.md")) && readFileSync(siteCopy, "utf8") !== readFileSync(join(repo, "full.md"), "utf8")) {
        say(`  ! ${id}: the site's reports/${id}/full.md differs from its repo at HEAD; the diff below includes that drift (pnpm ingest aggregate)`);
      }
      say(`Re-ingesting ${id} …`);
      run("pnpm", ["ingest", "run", id], { env, log: join(tmp, `run-${id}.log`) });
      copyFileSync(join(repo, "full.md"), siteCopy);
      if (existsSync(join(repo, "PROCESSING.md"))) copyFileSync(join(repo, "PROCESSING.md"), join(ROOT, "reports", id, "PROCESSING.md"));
    }
    say("Prerendering with the trial ingest …");
    run("pnpm", ["prerender"], { log: join(tmp, "prerender.log") });
    const after = snapshot(join(tmp, "after.json"), ids);
    if (scored.length) run("pnpm", ["score", ...scored, "--out", join(tmp, "score-after"), ...layoutFlag], { log: join(tmp, "score-after.log") });

    say("\n== Rendered text ==");
    for (const b of before) say(formatDiff(diffSnapshots(b, after.find((a) => a.id === b.id)!), limit));
    const q = (snaps: Snapshot[]) => Object.fromEntries(snaps.map((s) => [s.id, s.quality ?? {}]));
    const moved = before.some((b) => SIGNALS.some((s) => b.quality?.[s.id] !== after.find((a) => a.id === b.id)?.quality?.[s.id]));
    say("\n== Quality counts, pinned ingest to trial ingest ==\n");
    say(moved ? diffTable({ ingest: "pinned", recorded: "now", reports: q(before) }, q(after), "the pinned ingest") : "no quality signal moved");
    if (scored.length) {
      say("\n== Score decisions (pnpm score --diff), reports with a reference edition ==");
      say(run("pnpm", ["--silent", "score", "--diff", join(tmp, "score-before"), join(tmp, "score-after"), ...scored, "--limit", String(limit)]));
    } else if (wantScore) say("\n(no named report has a reference edition: score skipped)");
    if (keep) say(`\n--keep: the site is still linked to ${ingestDir}. Undo with: pnpm ingest try --restore  (then pnpm prerender)`);
  } catch (error) {
    failure = error;
  } finally {
    undo();
  }
  if (!keep) {
    try {
      say("Re-prerendering the pinned state …");
      run("pnpm", ["prerender"]);
    } catch (error) {
      console.error(`pnpm prerender failed after the restore: ${error instanceof Error ? error.message : error}`);
      failure ??= error;
    }
  }
  if (failure) {
    console.error(failure instanceof Error ? failure.message : String(failure));
    return 1;
  }
  return 0;
}

function readlinkOrNull(path: string): string | null {
  try {
    return execFileSync("readlink", [path], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}
