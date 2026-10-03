/**
 * `pnpm ingest link <ingest dir> [<id>...]` | `--restore` | `--status`: test an unreleased ingest worktree from this
 * site worktree without editing package.json (scripts/lib/ingest-link.ts says why that matters).
 *
 *   pnpm ingest link ../ingest-my-fix                  build it if stale; link it into this site and into each report worktree
 *   pnpm ingest link ../ingest-my-fix us-911-commission  only that report's repo (the site is always linked)
 *   pnpm ingest link --status                          what is linked, and the version each link resolves to
 *   pnpm ingest link --restore                         put every link back (then `pnpm prerender` if you re-ingested)
 *
 * Report repos are linked only where `RTM_REPORT_DIRS` names a worktree of them: the shared checkouts are never
 * written. Each report's `ingest.ts` imports `@rtm/ingest` from its own node_modules, so linking the site alone runs
 * the unreleased pipeline with the old report definitions (and silently ignores a new pass: reportsthatmatter-5xln).
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { linkAll, linkLockPathFor, readLinkLock, unlinkAll } from "../lib/ingest-link.ts";
import { installedIngest } from "../lib/ingest-version.ts";
import { resolveIngest } from "./try.ts";
import { readLock, type Lock } from "../lib/trial-links.ts";

const ROOT = join(import.meta.dirname, "../..");

export function runLink(argv: string[]): number {
  const lockPath = linkLockPathFor(ROOT);
  if (argv.includes("--restore")) {
    const lines = unlinkAll(lockPath);
    console.log(lines.length ? lines.map((l) => `  relinked ${l}`).join("\n") : "nothing to restore (no .rtm-link.lock)");
    return 0;
  }
  if (argv.includes("--status")) {
    const lock = readLinkLock(lockPath);
    if (!lock) {
      const here = installedIngest(ROOT);
      console.log(`not linked: this site runs @rtm/ingest ${here.version} (${here.dir})`);
      return 0;
    }
    console.log(`linked to ${lock.ingestDir} since ${lock.at}:`);
    for (const { linkPath } of lock.links) console.log(`  ${linkPath} → ${existsSync(linkPath) ? realpathSync(linkPath) : "(missing)"}`);
    return 0;
  }
  const [source, ...ids] = argv.filter((a) => !a.startsWith("--"));
  if (!source) {
    console.error("usage: pnpm ingest link <ingest dir> [<id>...]   |   pnpm ingest link --restore   |   pnpm ingest link --status");
    return 1;
  }
  if (!existsSync(join(resolve(source), "package.json"))) {
    console.error(`${source} is not an ingest checkout (no package.json); pass a worktree path, e.g. ../ingest-my-fix`);
    return 1;
  }
  if (readLock(join(ROOT, ".rtm-try.lock"))) {
    console.error("A `pnpm ingest try` left .rtm-try.lock: run `pnpm ingest try --restore` first.");
    return 1;
  }
  if (readLinkLock(lockPath)) {
    console.error("Already linked: run `pnpm ingest link --restore` first (or `--status`).");
    return 1;
  }
  const manifest = parse(readFileSync(join(ROOT, "reports/manifest.yaml"), "utf8")) as { reports: Array<{ id: string; dir: string }> };
  const wanted = manifest.reports.filter((r) => !ids.length || ids.includes(r.id));
  for (const id of ids) if (!manifest.reports.some((r) => r.id === id)) return console.error(`${id} is not in reports/manifest.yaml`), 1;
  const override = process.env.RTM_REPORT_DIRS;
  const links = [join(ROOT, "node_modules/@rtm/ingest")];
  const skipped: string[] = [];
  for (const r of wanted) {
    const dir = override ? join(resolve(override), basename(r.dir)) : undefined;
    if (dir && existsSync(join(dir, "node_modules"))) {
      if (!links.includes(join(dir, "node_modules/@rtm/ingest"))) links.push(join(dir, "node_modules/@rtm/ingest"));
    } else skipped.push(r.id);
  }
  const scratch: Lock = { linkPath: "", originalTarget: null, files: [], worktrees: [], tmp: "", startedAt: "" };
  const ingestDir = resolveIngest(source, "", scratch);
  const version = JSON.parse(readFileSync(join(ingestDir, "package.json"), "utf8")).version;
  linkAll(lockPath, ingestDir, links);
  console.log(`Linked @rtm/ingest ${version} from ${ingestDir} into ${links.length} place(s):`);
  for (const l of links) console.log(`  ${l}`);
  if (skipped.length) console.log(`Not linked (no worktree under RTM_REPORT_DIRS, shared checkouts are never written): ${skipped.join(", ")}\n  pnpm ingest worktrees ${skipped.slice(0, 3).join(" ")}  then export the RTM_REPORT_DIRS it prints, run \`pnpm install\` there, and link again`);
  console.log("Nothing tracked changed. Undo with: pnpm ingest link --restore");
  return 0;
}
