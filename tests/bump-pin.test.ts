import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitPinBump, defaultBranch, installArgv, normaliseVersion, pinWith, rewritePin } from "../scripts/lib/bump-pin";

describe("bump-pin", () => {
  it("normalises versions", () => {
    expect(normaliseVersion("0.25.0")).toBe("v0.25.0");
    expect(normaliseVersion("v0.25.0")).toBe("v0.25.0");
    expect(normaliseVersion("main")).toBeNull();
    expect(normaliseVersion("0.25")).toBeNull();
  });
  it("replaces the tag only", () => {
    expect(pinWith("github:reportsthatmatter/ingest#v0.24.0", "v0.25.0")).toBe("github:reportsthatmatter/ingest#v0.25.0");
    expect(pinWith("^0.24.0", "v0.25.0")).toBeNull();
  });
  it("rewrites package.json text and keeps the rest", () => {
    const text = '{\n  "dependencies": {\n    "@rtm/ingest": "github:x/ingest#v0.24.0",\n    "yaml": "^2"\n  }\n}\n';
    expect(rewritePin(text, "github:x/ingest#v0.25.0")).toBe(text.replace("v0.24.0", "v0.25.0"));
    expect(rewritePin(text.replace("v0.24.0", "v0.25.0"), "github:x/ingest#v0.25.0")).toContain("v0.25.0");
    expect(() => rewritePin("{}", "x")).toThrow();
  });
  it("never installs frozen", () => {
    expect(installArgv("/r")).toEqual(["pnpm", "-C", "/r", "install", "--no-frozen-lockfile"]);
  });
});

describe("commitPinBump", () => {
  const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

  /** A bare remote and a clone of it on `branch`, with package.json and pnpm-lock.yaml committed. */
  function fixture(branch: string) {
    const base = mkdtempSync(join(tmpdir(), "bump-pin-"));
    const remote = join(base, "remote.git");
    const work = join(base, "work");
    execFileSync("git", ["init", "-q", "--bare", `--initial-branch=${branch}`, remote]);
    execFileSync("git", ["clone", "-q", remote, work], { stdio: "ignore" });
    sh(work, "config", "user.email", "t@example.org");
    sh(work, "config", "user.name", "t");
    sh(work, "checkout", "-q", "-B", branch);
    writeFileSync(join(work, "package.json"), '{"dependencies":{"@rtm/ingest":"github:x/ingest#v0.24.0"}}\n');
    writeFileSync(join(work, "pnpm-lock.yaml"), "lock: 1\n");
    writeFileSync(join(work, "full.md"), "text\n");
    sh(work, "add", ".");
    sh(work, "commit", "-qm", "init");
    sh(work, "push", "-q", "-u", "origin", branch);
    sh(work, "remote", "set-head", "origin", branch);
    return { remote, work };
  }
  const bump = (work: string) => {
    writeFileSync(join(work, "package.json"), '{"dependencies":{"@rtm/ingest":"github:x/ingest#v0.25.0"}}\n');
    writeFileSync(join(work, "pnpm-lock.yaml"), "lock: 2\n");
  };

  it.each(["main", "master"])("commits the two files on %s and pushes", (branch) => {
    const { remote, work } = fixture(branch);
    expect(defaultBranch(work)).toBe(branch);
    bump(work);
    const r = commitPinBump(work, "v0.25.0", { push: true });
    expect(r).toEqual({ kind: "committed", branch, pushed: true });
    expect(sh(work, "status", "--porcelain")).toBe("");
    expect(sh(work, "log", "-1", "--format=%s")).toBe("Bump @rtm/ingest to v0.25.0");
    expect(sh(remote, "log", "-1", "--format=%s", branch)).toBe("Bump @rtm/ingest to v0.25.0");
  });

  it("--no-push commits but leaves the remote alone", () => {
    const { remote, work } = fixture("main");
    bump(work);
    expect(commitPinBump(work, "v0.25.0", { push: false })).toEqual({ kind: "committed", branch: "main", pushed: false });
    expect(sh(remote, "log", "-1", "--format=%s", "main")).toBe("init");
  });

  it("dry run changes nothing", () => {
    const { work } = fixture("main");
    bump(work);
    expect(commitPinBump(work, "v0.25.0", { push: true, dry: true })).toEqual({ kind: "committed", branch: "main", pushed: true });
    expect(sh(work, "status", "--porcelain")).toContain("package.json");
  });

  it("reports nothing to commit when the pin did not change", () => {
    const { work } = fixture("main");
    expect(commitPinBump(work, "v0.24.0", { push: true })).toEqual({ kind: "unchanged" });
  });

  it("skips a repo on another branch, and one with other uncommitted changes, without committing", () => {
    const a = fixture("main");
    sh(a.work, "checkout", "-q", "-b", "wt/feature");
    bump(a.work);
    const skipped = commitPinBump(a.work, "v0.25.0", { push: true });
    expect(skipped.kind).toBe("skipped");
    expect(sh(a.work, "log", "-1", "--format=%s")).toBe("init");

    const b = fixture("master");
    bump(b.work);
    writeFileSync(join(b.work, "full.md"), "a peer's edit\n");
    const dirty = commitPinBump(b.work, "v0.25.0", { push: true });
    expect(dirty).toMatchObject({ kind: "skipped" });
    expect((dirty as { reason: string }).reason).toContain("full.md");
    expect(sh(b.work, "log", "-1", "--format=%s")).toBe("init");
  });

  it("falls back to a local main or master when origin/HEAD is unset", () => {
    const { work } = fixture("master");
    sh(work, "remote", "set-head", "origin", "-d");
    expect(defaultBranch(work)).toBe("master");
  });
});
