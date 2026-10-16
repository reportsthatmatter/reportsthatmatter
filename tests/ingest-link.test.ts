import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDrifted, linkAll, linkLockPathFor, linkStates, readLinkLock, unlinkAll } from "../scripts/lib/ingest-link";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ingest-link-"));
  for (const d of ["pinned", "linked", "site/node_modules/@rtm", "repo/node_modules/@rtm", "bare/node_modules"]) mkdirSync(join(dir, d), { recursive: true });
  symlinkSync(join(dir, "pinned"), join(dir, "site/node_modules/@rtm/ingest"));
  symlinkSync(join(dir, "pinned"), join(dir, "repo/node_modules/@rtm/ingest"));
  return { dir, site: join(dir, "site/node_modules/@rtm/ingest"), repo: join(dir, "repo/node_modules/@rtm/ingest"), bare: join(dir, "bare/node_modules/@rtm/ingest"), lock: linkLockPathFor(dir), linked: join(dir, "linked") };
}

describe("pnpm ingest link bookkeeping", () => {
  it("links the site and a report worktree, then restores each to what it was, including one that did not exist", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site, f.repo, f.bare]);
    for (const p of [f.site, f.repo, f.bare]) expect(readlinkSync(p)).toBe(f.linked);
    expect(readLinkLock(f.lock)?.links.map((l) => l.originalTarget)).toEqual([join(f.dir, "pinned"), join(f.dir, "pinned"), null]);
    const said = unlinkAll(f.lock);
    expect(said).toHaveLength(3);
    expect(readlinkSync(f.site)).toBe(join(f.dir, "pinned"));
    expect(readlinkSync(f.repo)).toBe(join(f.dir, "pinned"));
    expect(existsSync(f.bare) || (() => { try { lstatSync(f.bare); return true; } catch { return false; } })()).toBe(false);
    expect(existsSync(f.lock)).toBe(false);
  });

  it("refuses a second link while one is recorded", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site]);
    expect(() => linkAll(f.lock, f.linked, [f.repo])).toThrow(/already linked/);
  });

  it("undoes its own work when a path is a real directory, which relink refuses to replace", () => {
    const f = fixture();
    mkdirSync(f.bare, { recursive: true });
    writeFileSync(join(f.bare, "x"), "real install");
    expect(() => linkAll(f.lock, f.linked, [f.site, f.bare])).toThrow(/not a symlink/);
    expect(readlinkSync(f.site)).toBe(join(f.dir, "pinned"));
    expect(existsSync(f.lock)).toBe(false);
  });

  it("restore with nothing recorded is a no-op", () => {
    expect(unlinkAll(join(mkdtempSync(join(tmpdir(), "ingest-link-")), ".rtm-link.lock"))).toEqual([]);
  });
});

// reportsthatmatter-irfs: a pnpm install resets node_modules/@rtm/ingest to the pin and leaves .rtm-link.lock behind.
describe("a lock a pnpm install has undone", () => {
  const reset = (path: string, to: string) => {
    rmSync(path, { force: true });
    symlinkSync(to, path);
  };

  it("a fresh lock is not drifted and keeps the refusal", () => {
    const f = fixture();
    const lock = linkAll(f.lock, f.linked, [f.site, f.repo]);
    expect(isDrifted(lock)).toBe(false);
    expect(linkStates(lock).map((s) => s.linked)).toEqual([true, true]);
    expect(() => linkAll(f.lock, f.linked, [f.site, f.repo])).toThrow(/already linked/);
  });

  it("marks each link linked or drifted, with where a drifted one points", () => {
    const f = fixture();
    const lock = linkAll(f.lock, f.linked, [f.site, f.repo, f.bare]);
    reset(f.site, join(f.dir, "pinned"));
    expect(linkStates(lock)).toEqual([
      { linkPath: f.site, linked: false, target: join(f.dir, "pinned") },
      { linkPath: f.repo, linked: true, target: f.linked },
      { linkPath: f.bare, linked: true, target: f.linked },
    ]);
    rmSync(f.bare, { force: true });
    expect(linkStates(lock)[2]).toEqual({ linkPath: f.bare, linked: false, target: "(missing)" });
    expect(isDrifted(lock)).toBe(true);
  });

  it("relinks instead of refusing when the site was reset but a report worktree is still linked", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site, f.repo]);
    reset(f.site, join(f.dir, "pinned"));
    const lock = linkAll(f.lock, f.linked, [f.site, f.repo]);
    expect(readlinkSync(f.site)).toBe(f.linked);
    expect(readlinkSync(f.repo)).toBe(f.linked);
    // the new lock records what is there now, so --restore returns to the pin
    expect(lock.links.map((l) => l.originalTarget)).toEqual([join(f.dir, "pinned"), join(f.dir, "pinned")]);
    expect(isDrifted(readLinkLock(f.lock)!)).toBe(false);
  });

  it("relinks when every link was reset", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site, f.repo]);
    reset(f.site, join(f.dir, "pinned"));
    reset(f.repo, join(f.dir, "pinned"));
    linkAll(f.lock, f.linked, [f.site]);
    expect(readlinkSync(f.site)).toBe(f.linked);
    expect(readlinkSync(f.repo)).toBe(join(f.dir, "pinned"));
  });

  it("--restore leaves a drifted link alone (pnpm owns it now) and restores the live ones", () => {
    const f = fixture();
    linkAll(f.lock, f.linked, [f.site, f.repo]);
    const newPin = join(f.dir, "newpin");
    mkdirSync(newPin);
    reset(f.site, newPin);
    const said = unlinkAll(f.lock);
    expect(said).toHaveLength(1);
    expect(readlinkSync(f.site)).toBe(newPin);
    expect(readlinkSync(f.repo)).toBe(join(f.dir, "pinned"));
    expect(existsSync(f.lock)).toBe(false);
  });
});

