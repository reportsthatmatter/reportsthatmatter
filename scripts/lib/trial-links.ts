/**
 * Bookkeeping for `pnpm ingest try`: what it changed in the site checkout, written to a lock file before it changes
 * anything, so a crashed or interrupted trial is undone by `pnpm ingest try --restore` instead of by hand.
 *
 * Three things are changed and all three are restored: the `node_modules/@rtm/ingest` link, the aggregated
 * `reports/<id>/{full.md,PROCESSING.md}` copies, and the per-trial git worktrees of the report repos.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

export type Lock = {
  /** The site's node_modules/@rtm/ingest. */
  linkPath: string;
  /** Where it pointed before; null when it did not exist. */
  originalTarget: string | null;
  /** Files copied aside before being overwritten; `backup: null` means the file did not exist and is removed on restore. */
  files: Array<{ file: string; backup: string | null }>;
  /** git worktrees to remove: the repo they belong to and where they are. */
  worktrees: Array<{ repo: string; dir: string }>;
  /** Scratch directory holding backups and logs, removed last. */
  tmp: string;
  startedAt: string;
};

export const lockPathFor = (root: string) => join(root, ".rtm-try.lock");

export function readLock(path: string): Lock | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Lock) : null;
}

export function writeLock(path: string, lock: Lock): void {
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

function currentTarget(path: string): string | null {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null;
  } catch {
    return null;
  }
}

/** Points `linkPath` at `target`, returning what it pointed at. Refuses a path that is a real directory, which this would destroy. */
export function relink(linkPath: string, target: string): string | null {
  let original: string | null = null;
  try {
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) throw new Error(`${linkPath} is not a symlink; refusing to replace it`);
    original = readlinkSync(linkPath);
    rmSync(linkPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath);
  return original;
}

/** Copies `file` into `backupDir` (or notes it did not exist) and records it in the lock. */
export function backupFile(lock: Lock, file: string, backupDir: string): void {
  if (lock.files.some((f) => f.file === file)) return;
  if (!existsSync(file)) {
    lock.files.push({ file, backup: null });
    return;
  }
  const backup = join(backupDir, String(lock.files.length));
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(file, backup);
  lock.files.push({ file, backup });
}

/** Undoes everything the lock records, tolerating steps that already happened. Returns what it did, one line each. */
export function restore(lock: Lock, lockPath?: string): string[] {
  const said: string[] = [];
  const now = currentTarget(lock.linkPath);
  if (now !== lock.originalTarget) {
    rmSync(lock.linkPath, { force: true });
    if (lock.originalTarget !== null) symlinkSync(lock.originalTarget, lock.linkPath);
    said.push(`relinked ${lock.linkPath} → ${lock.originalTarget ?? "(absent)"}`);
  }
  let files = 0;
  for (const { file, backup } of lock.files) {
    if (backup === null) {
      if (existsSync(file)) rmSync(file);
      continue;
    }
    if (existsSync(backup)) {
      copyFileSync(backup, file);
      files++;
    }
  }
  if (files) said.push(`restored ${files} aggregated file(s)`);
  for (const { repo, dir } of lock.worktrees) {
    try {
      execFileSync("git", ["-C", repo, "worktree", "remove", "--force", dir], { stdio: "ignore" });
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
    try {
      execFileSync("git", ["-C", repo, "worktree", "prune"], { stdio: "ignore" });
    } catch {
      // the repo is gone; nothing to prune
    }
  }
  if (lock.worktrees.length) said.push(`removed ${lock.worktrees.length} trial worktree(s)`);
  rmSync(lock.tmp, { recursive: true, force: true });
  if (lockPath) rmSync(lockPath, { force: true });
  return said;
}
