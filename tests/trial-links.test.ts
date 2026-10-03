import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupFile, readLock, relink, restore, writeLock, type Lock } from "../scripts/lib/trial-links";

function site() {
  const dir = mkdtempSync(join(tmpdir(), "trial-links-"));
  mkdirSync(join(dir, "node_modules/@rtm"), { recursive: true });
  mkdirSync(join(dir, "pinned"));
  mkdirSync(join(dir, "linked"));
  symlinkSync(join(dir, "pinned"), join(dir, "node_modules/@rtm/ingest"));
  mkdirSync(join(dir, "reports/r"), { recursive: true });
  writeFileSync(join(dir, "reports/r/full.md"), "pinned text");
  return dir;
}

describe("trial link bookkeeping", () => {
  it("relinks, records, and restores the link and the aggregated files", () => {
    const dir = site();
    const linkPath = join(dir, "node_modules/@rtm/ingest");
    const lockPath = join(dir, ".rtm-try.lock");
    const lock: Lock = { linkPath, originalTarget: null, files: [], worktrees: [], tmp: join(dir, "tmp"), startedAt: "now" };

    backupFile(lock, join(dir, "reports/r/full.md"), join(dir, "tmp/backup"));
    backupFile(lock, join(dir, "reports/r/PROCESSING.md"), join(dir, "tmp/backup")); // absent: removed on restore
    lock.originalTarget = relink(linkPath, join(dir, "linked"));
    writeLock(lockPath, lock);
    writeFileSync(join(dir, "reports/r/full.md"), "trial text");
    writeFileSync(join(dir, "reports/r/PROCESSING.md"), "trial notes");
    expect(readlinkSync(linkPath)).toBe(join(dir, "linked"));

    // a crashed run is undone from the lock file alone
    const said = restore(readLock(lockPath)!, lockPath);
    expect(said.join("\n")).toContain("relinked");
    expect(readlinkSync(linkPath)).toBe(join(dir, "pinned"));
    expect(readFileSync(join(dir, "reports/r/full.md"), "utf8")).toBe("pinned text");
    expect(existsSync(join(dir, "reports/r/PROCESSING.md"))).toBe(false);
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(join(dir, "tmp"))).toBe(false);
  });

  it("is safe to restore twice", () => {
    const dir = site();
    const linkPath = join(dir, "node_modules/@rtm/ingest");
    const lock: Lock = { linkPath, originalTarget: join(dir, "pinned"), files: [], worktrees: [], tmp: join(dir, "tmp"), startedAt: "now" };
    expect(() => {
      restore(lock);
      restore(lock);
    }).not.toThrow();
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  });

  it("refuses to replace a real directory with a link", () => {
    const dir = site();
    mkdirSync(join(dir, "node_modules/real"));
    expect(() => relink(join(dir, "node_modules/real"), join(dir, "linked"))).toThrow(/not a symlink/);
  });
});
