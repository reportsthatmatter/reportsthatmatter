/**
 * `pnpm ingest try <branch|path> [<id>...] [--no-score] [--layout] [--keep] [--limit N]`: what an unreleased @rtm/ingest does
 * to the rendered corpus, without touching a shared checkout and leaving this one as it was found
 * (reportsthatmatter-1w3).
 *
 *   pnpm ingest try ../ingest-fix-x              # a checkout or worktree of ingest (built if dist is stale)
 *   pnpm ingest try fix/hyphen-joins us-911-commission uk-leveson-inquiry
 *   pnpm ingest try ../ingest-fix-x --base main  # compare two unreleased ingests (a PR against an unreleased main), not pinned vs trial
 *   pnpm ingest try --restore                    # undo a trial that was interrupted
 *
 * Steps: snapshot the site's rendered pages (the pinned ingest's output); make a throwaway git worktree of each
 * named report repo (the shared checkouts are never written); link the ingest into this site's node_modules and into
 * each trial worktree (report repos import @rtm/ingest from their own node_modules, so a site-only link fails with
 * "does not provide an export"); run each report; copy its markdown over the site's aggregate; prerender; snapshot
 * again; print the join/move list, the quality-count deltas, the score deltas and the findings diff (the oracle, anchor
 * and quality findings that appeared or vanished, from `pnpm ingest verify --findings-json` and `pnpm ingest anchors
 * --json`); undo all of it. `--base <ref|path>` makes the "before" side an ingest too, run the same way as the trial
 * (so it needs no pin bump and measures a PR against an unreleased main); without it the before side is the pinned ingest
 * as the site renders it now. Each side's ingest version and path are printed.
 *
 * Everything it changes is recorded in `.rtm-try.lock` first, so `--restore` can undo a crashed trial.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { SIGNALS } from "../../src/lib/quality/signals.ts";
import { diffTable } from "../../src/lib/quality/diff.ts";
import { diffSnapshots, formatDiff, type Snapshot } from "../lib/render-diff.ts";
import { reportDirs } from "../lib/report-dirs.ts";
import { diffFindings, formatFindingsDiff, fromAnchors, fromOracle, fromQuality, type NormFinding } from "../lib/findings-diff.ts";
import { diffFolios, formatFolioDiff, type FolioReport } from "../lib/folios.ts";
import { installedIngest } from "../lib/ingest-version.ts";
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
  // The manifest's own (shared) location, not RTM_REPORT_DIRS: a trial branches from each repo's committed HEAD there.
  return new Map([...reportDirs(ROOT)].map(([id, r]) => [id, r.defaultDir]));
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
export function resolveIngest(source: string, tmp: string, lock: Lock, name = "ingest"): string {
  const ingestRepo = resolve(process.env.RTM_INGEST_DIR ?? join(ROOT, "../ingest"));
  let dir: string;
  if (existsSync(join(resolve(source), "package.json"))) dir = resolve(source);
  else {
    const ref = [source, `origin/${source}`].find((r) => spawnSync("git", ["-C", ingestRepo, "rev-parse", "--verify", "-q", `${r}^{commit}`]).status === 0);
    if (!ref) throw new Error(`${source} is neither a directory nor a ref of ${ingestRepo}`);
    dir = join(tmp, name);
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

type Side = {
  label: string;
  version: string;
  dir: string;
  snaps: Snapshot[];
  scoreDir?: string;
  /** Oracle, anchor and quality findings per report id. */
  findings: Map<string, NormFinding[]>;
  /** Each page's printed-number read and source per report id (`pnpm ingest folios --json`); empty when the ingest has no `folioReport`. */
  folios: Map<string, FolioReport>;
  /** Why a findings source is missing for a report (a missing PDF, a crash), so a gap is not read as a clean side. */
  gaps: string[];
};

/** Runs a command whose exit status does not matter (verify exits 1 over an oracle budget), and says whether it left its output file. */
function runLoose(args: string[], env: NodeJS.ProcessEnv, out: string, log: string): boolean {
  const r = spawnSync("pnpm", ["--silent", "ingest", ...args, "--no-preflight"], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 1 << 28 });
  writeFileSync(log, `${r.stdout}\n${r.stderr}`);
  return existsSync(out);
}

function collectFindings(ids: string[], snaps: Snapshot[], env: NodeJS.ProcessEnv, tmp: string, tag: string): Pick<Side, "findings" | "gaps" | "folios"> {
  const findings = new Map<string, NormFinding[]>();
  const gaps: string[] = [];
  const folios = new Map<string, FolioReport>();
  for (const id of ids) {
    const foliosOut = join(tmp, `${tag}-folios-${id}.json`);
    if (runLoose(["folios", id, "--json", foliosOut], env, foliosOut, join(tmp, `${tag}-folios-${id}.log`))) folios.set(id, (JSON.parse(readFileSync(foliosOut, "utf8")) as Record<string, FolioReport>)[id]);
    else gaps.push(`${id}: no folio report (the ingest has no folioReport, or the re-ingest failed; see ${tag}-folios-${id}.log)`);
    const list: NormFinding[] = fromQuality(snaps.find((s) => s.id === id)?.qualityFindings ?? []);
    const oracleOut = join(tmp, `${tag}-oracle-${id}.json`);
    if (runLoose(["verify", id, "--no-golden", "--findings-json", oracleOut], env, oracleOut, join(tmp, `${tag}-verify-${id}.log`))) {
      list.push(...fromOracle((JSON.parse(readFileSync(oracleOut, "utf8")) as Record<string, Array<{ signal: string; volume: number; page: number; text: string }>>)[id] ?? []));
    } else gaps.push(`${id}: no oracle findings (see ${tag}-verify-${id}.log in the trial's scratch directory; --keep keeps it)`);
    const anchorsOut = join(tmp, `${tag}-anchors-${id}.json`);
    if (runLoose(["anchors", id, "--json", anchorsOut], env, anchorsOut, join(tmp, `${tag}-anchors-${id}.log`))) {
      list.push(...fromAnchors((JSON.parse(readFileSync(anchorsOut, "utf8")) as Record<string, Parameters<typeof fromAnchors>[0]>)[id]));
    } else gaps.push(`${id}: no anchor findings`);
    findings.set(id, list);
  }
  return { findings, gaps, folios };
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
  const valued = new Set(["--limit", "--base"]);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
  const [source, ...named] = positional;
  const baseSource = flags.includes("--base") ? argv[argv.indexOf("--base") + 1] : undefined;
  if (flags.includes("--base") && (!baseSource || baseSource.startsWith("--"))) {
    console.error("--base needs a branch, ref or path of an ingest checkout");
    return 1;
  }
  if (!source) {
    console.error("usage: pnpm ingest try <branch|path> [<id>...] [--base <branch|path>] [--no-score] [--no-findings] [--layout] [--keep] [--limit N]   |   pnpm ingest try --restore");
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
  const wantFindings = !flags.includes("--no-findings");
  // layout-based page-break rows need pdftohtml per report (slow): default to the block-level decisions
  const layoutFlag = flags.includes("--layout") ? [] : ["--no-layout"];

  if (staleReason()) {
    say("Prerendering the pinned state first (assets/generated/ was stale)");
    run("pnpm", ["prerender"]);
  }

  const tmp = mkdtempSync(join(tmpdir(), "rtm-try-"));
  const linkPath = join(ROOT, "node_modules/@rtm/ingest");
  // recorded before anything can fail: a build error in resolveIngest otherwise restores to "absent" and deletes the pinned link
  const lock: Lock = { linkPath, originalTarget: readlinkOrNull(linkPath), files: [], worktrees: [], tmp, startedAt: new Date().toISOString() };
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
    // `pnpm score` rewrites docs/scores.json whatever --out says: put it back with the aggregated files
    if (wantScore) backupFile(lock, join(ROOT, "docs/scores.json"), join(tmp, "backup", "docs"));
    writeLock(lockPath, lock);
    const baseDir = baseSource ? resolveIngest(baseSource, tmp, lock, "ingest-base") : undefined;
    const versionOf = (dir: string) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version as string;
    const pinned = installedIngest(ROOT);
    say(`Trying @rtm/ingest ${versionOf(ingestDir)} from ${ingestDir} on ${ids.length} report(s)`);
    say(baseDir ? `Base:   @rtm/ingest ${versionOf(baseDir)} from ${baseDir}` : `Base:   @rtm/ingest ${pinned.version} from ${pinned.dir} (the pinned ingest, as the site renders it now)`);

    // trial worktrees of the report repos
    const trialRepos = join(tmp, "repos");
    mkdirSync(trialRepos);
    const worktreeLinks: string[] = [];
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
      worktreeLinks.push(join(dir, "node_modules/@rtm/ingest"));
      // untracked inputs and caches the trial reads: shared, not copied (the layout cache is keyed by content)
      for (const extra of ["reference", ".cache"]) if (existsSync(join(repo, extra)) && !existsSync(join(dir, extra))) symlinkSync(join(repo, extra), join(dir, extra));
    }
    const linkWorktrees = (dir: string) => {
      for (const l of worktreeLinks) relink(l, dir);
    };
    linkWorktrees(pinned.dir);
    const env = { RTM_REPORT_DIRS: trialRepos };

    // what each side's text is, scored and flagged. `dir` null: the pinned ingest, as the site renders it now.
    const measureSide = (label: string, version: string, dir: string | null, tag: string): Side => {
      if (dir) {
        // re-ingest with this ingest, linked into the site and into each report worktree, and aggregate over the site's copy
        for (const id of ids) {
          for (const f of ["full.md", "PROCESSING.md"]) backupFile(lock, join(ROOT, "reports", id, f), join(tmp, "backup", id));
        }
        writeLock(lockPath, lock);
        relink(linkPath, dir);
        linkWorktrees(dir);
        for (const id of ids) {
          const repo = join(trialRepos, basename(dirs.get(id)!));
          const siteCopy = join(ROOT, "reports", id, "full.md");
          if (tag === "after" && !baseDir && existsSync(siteCopy) && existsSync(join(repo, "full.md")) && readFileSync(siteCopy, "utf8") !== readFileSync(join(repo, "full.md"), "utf8")) {
            say(`  ! ${id}: the site's reports/${id}/full.md differs from its repo at HEAD; the diff below includes that drift (pnpm ingest aggregate)`);
          }
          say(`Re-ingesting ${id} with ${label} …`);
          run("pnpm", ["ingest", "run", id], { env, log: join(tmp, `run-${tag}-${id}.log`) });
          copyFileSync(join(repo, "full.md"), siteCopy);
          if (existsSync(join(repo, "PROCESSING.md"))) copyFileSync(join(repo, "PROCESSING.md"), join(ROOT, "reports", id, "PROCESSING.md"));
        }
        say(`Prerendering with ${label} …`);
        run("pnpm", ["prerender"], { log: join(tmp, `prerender-${tag}.log`) });
      }
      say(`Snapshot with ${label} …`);
      const snaps = snapshot(join(tmp, `${tag}.json`), ids);
      const scored = wantScore ? withReference(ids, dirs) : [];
      let scoreDir: string | undefined;
      if (scored.length) {
        scoreDir = join(tmp, `score-${tag}`);
        run("pnpm", ["score", ...scored, "--out", scoreDir, ...layoutFlag], { log: join(tmp, `score-${tag}.log`) });
      }
      let found: Pick<Side, "findings" | "gaps" | "folios"> = { findings: new Map(), gaps: [], folios: new Map() };
      if (wantFindings) {
        say(`Findings with ${label} (oracle, anchors) …`);
        found = collectFindings(ids, snaps, env, tmp, tag);
      }
      return { label, version, dir: dir ?? pinned.dir, snaps, scoreDir, ...found };
    };

    const before = baseDir ? measureSide(`base ${versionOf(baseDir)}`, versionOf(baseDir), baseDir, "before") : measureSide(`the pinned ingest ${pinned.version}`, pinned.version, null, "before");
    const after = measureSide(`trial ${versionOf(ingestDir)}`, versionOf(ingestDir), ingestDir, "after");
    const [was, now] = baseDir ? ["base", "trial"] : ["pinned", "trial"];
    const scored = after.scoreDir && before.scoreDir ? withReference(ids, dirs) : [];

    say(`\n== Rendered text, ${was} ingest to ${now} ingest ==`);
    for (const b of before.snaps) say(formatDiff(diffSnapshots(b, after.snaps.find((a) => a.id === b.id)!), limit));
    const q = (snaps: Snapshot[]) => Object.fromEntries(snaps.map((s) => [s.id, s.quality ?? {}]));
    const moved = before.snaps.some((b) => SIGNALS.some((s) => b.quality?.[s.id] !== after.snaps.find((a) => a.id === b.id)?.quality?.[s.id]));
    say(`\n== Quality counts, ${was} ingest to ${now} ingest ==\n`);
    say(moved ? diffTable({ ingest: was, recorded: now, reports: q(before.snaps) }, q(after.snaps), `the ${was} ingest`) : "no quality signal moved");
    if (scored.length) {
      say("\n== Score decisions (pnpm score --diff), reports with a reference edition ==");
      say(run("pnpm", ["--silent", "score", "--diff", before.scoreDir!, after.scoreDir!, ...scored, "--limit", String(limit)]));
    } else if (wantScore) say("\n(no named report has a reference edition: score skipped)");
    if (wantFindings) {
      say(`\n== Findings that appeared or vanished (oracle, anchors, quality excerpts), ${was} ${before.version} to ${now} ${after.version} ==`);
      let total = 0;
      for (const id of ids) {
        const d = diffFindings(before.findings.get(id) ?? [], after.findings.get(id) ?? []);
        total += d.appeared.length + d.vanished.length;
        say(formatFindingsDiff(id, d, limit));
      }
      if (!total) say("(no finding moved)");
      say(`\n== Pages that changed source (vision or pipeline) or printed-number read, ${was} ${before.version} to ${now} ${after.version} ==`);
      for (const id of ids) {
        const [b, a] = [before.folios.get(id), after.folios.get(id)];
        say(b && a ? formatFolioDiff(id, diffFolios(b, a), limit) : `${id}: not compared (a side has no folio report)`);
      }
      for (const g of [...before.gaps.map((x) => `${was}: ${x}`), ...after.gaps.map((x) => `${now}: ${x}`)]) say(`  ! ${g}`);
    }
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
    const message = failure instanceof Error ? failure.message : String(failure);
    console.error(message);
    if (baseSource && /does not provide an export/.test(message)) {
      console.error(`\nThe report repos' ingest.ts at HEAD import a pass the base ingest (${baseSource}) does not have. A base must be at least as new as what the report repos declare: the previous release only works against report repos from before the pin moved. Use a base that contains the passes in use (usually the ingest main the PR branches from).`);
    }
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
