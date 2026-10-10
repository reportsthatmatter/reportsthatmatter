/**
 * The one report-directory resolver (reportsthatmatter-461y, ai23, j6ld).
 *
 * A report's repo lives where `reports/manifest.yaml` says (`dir`, relative to the site root: by default a sibling
 * checkout, the shared one). `RTM_REPORT_DIRS=<dir>` names a directory of git worktrees of the report repos
 * (`pnpm ingest worktrees <id…>` prints it): where `<dir>/<repo basename>` exists it wins, so work on a report's
 * branch is read from the branch, not from the shared checkout's main. Every site script that reads a report repo
 * goes through here: TypeScript and .mjs import these functions; `scripts/score/reference.py` (Python) implements
 * the same three rules and `tests/report-dirs.test.ts` pins them.
 *
 * `RTM_REPO_ROOT` was the older name `pnpm score` and `scripts/score/reference.py` used for the same thing. It is
 * still read, as a fallback, when `RTM_REPORT_DIRS` is unset; set `RTM_REPORT_DIRS`.
 *
 * Rules, in order, for a report id:
 *   1. the manifest entry's `dir`, resolved against the site root (the "default", i.e. shared, location);
 *   2. an id not in the manifest (a report scored before it is published, e.g. Duelfer): a sibling `../<id>`;
 *   3. an override directory (`RTM_REPORT_DIRS`, else `RTM_REPO_ROOT`) containing `<basename of 1 or 2>` replaces it.
 *
 * Pure of process state: callers pass the env.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";

export type ManifestEntry = { id: string; dir: string };
export type ReportDir = {
  id: string;
  /** Where the report is read from: the override worktree if there is one, else `defaultDir`. */
  dir: string;
  /** The manifest's own location (the shared checkout), whatever the override says. */
  defaultDir: string;
  /** True when `dir` came from the override directory. */
  overridden: boolean;
};

/** The override directory from the environment, absolute, or undefined. `RTM_REPO_ROOT` is the deprecated name. */
export function overrideDir(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.RTM_REPORT_DIRS || env.RTM_REPO_ROOT;
  return raw ? resolve(raw) : undefined;
}

export function readManifest(root: string): ManifestEntry[] {
  const raw = parse(readFileSync(join(root, "reports/manifest.yaml"), "utf8")) as { reports?: ManifestEntry[] } | null;
  return raw?.reports ?? [];
}

/** One report's directory. `entry` is its manifest row, or null for an id not in the manifest (sibling convention). */
export function resolveReportDir(root: string, id: string, entry: ManifestEntry | null, env: NodeJS.ProcessEnv = process.env): ReportDir {
  const defaultDir = entry ? resolve(root, entry.dir) : resolve(root, "..", id);
  const base = overrideDir(env);
  const alt = base ? join(base, basename(defaultDir)) : undefined;
  if (alt && existsSync(alt)) return { id, dir: alt, defaultDir, overridden: true };
  return { id, dir: defaultDir, defaultDir, overridden: false };
}

/** Every manifest report, in manifest order. */
export function reportDirs(root: string, env: NodeJS.ProcessEnv = process.env): Map<string, ReportDir> {
  return new Map(readManifest(root).map((entry) => [entry.id, resolveReportDir(root, entry.id, entry, env)]));
}

/** One report by id, in or out of the manifest. */
export function reportDirFor(root: string, id: string, env: NodeJS.ProcessEnv = process.env): ReportDir {
  const entry = readManifest(root).find((r) => r.id === id) ?? null;
  return resolveReportDir(root, id, entry, env);
}
