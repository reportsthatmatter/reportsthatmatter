import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { overrideDir, reportDirFor, reportDirs } from "../scripts/lib/report-dirs";
import { manifestDir } from "../scripts/lib/pipeline-status";

function site() {
  const base = mkdtempSync(join(tmpdir(), "rtm-rd-"));
  const root = join(base, "site");
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, "reports/manifest.yaml"), "reports:\n  - id: a\n    dir: ../a-report\n  - id: b\n    dir: ../b-report\n");
  const wt = join(base, "wt");
  mkdirSync(join(wt, "a-report"), { recursive: true });
  return { base, root, wt };
}

describe("report-dirs", () => {
  it("uses the manifest dir with no override", () => {
    const { base, root } = site();
    const a = reportDirFor(root, "a", {});
    expect(a).toEqual({ id: "a", dir: join(base, "a-report"), defaultDir: join(base, "a-report"), overridden: false });
  });
  it("prefers RTM_REPORT_DIRS/<repo> only where it exists", () => {
    const { base, root, wt } = site();
    const all = reportDirs(root, { RTM_REPORT_DIRS: wt });
    expect(all.get("a")).toMatchObject({ dir: join(wt, "a-report"), defaultDir: join(base, "a-report"), overridden: true });
    expect(all.get("b")).toMatchObject({ dir: join(base, "b-report"), overridden: false });
  });
  it("falls back to the deprecated RTM_REPO_ROOT, and RTM_REPORT_DIRS wins", () => {
    const { root, wt } = site();
    expect(overrideDir({ RTM_REPO_ROOT: wt })).toBe(wt);
    expect(overrideDir({ RTM_REPO_ROOT: "/x", RTM_REPORT_DIRS: wt })).toBe(wt);
    expect(reportDirFor(root, "a", { RTM_REPO_ROOT: wt }).overridden).toBe(true);
  });
  it("resolves an id outside the manifest to a sibling", () => {
    const { base, root, wt } = site();
    mkdirSync(join(wt, "new-id"));
    expect(reportDirFor(root, "new-id", {}).dir).toBe(join(base, "new-id"));
    expect(reportDirFor(root, "new-id", { RTM_REPORT_DIRS: wt }).dir).toBe(join(wt, "new-id"));
  });
  it("pipeline status reads the worktree (ai23)", () => {
    const { root, wt } = site();
    expect(manifestDir(root, "a", { RTM_REPORT_DIRS: wt })).toBe(join(wt, "a-report"));
    expect(manifestDir(root, "a")).not.toBe(join(wt, "a-report"));
  });
  it("reference.py applies the same rules", () => {
    const { root, wt } = site();
    const py = `import sys; sys.path.insert(0, "scripts/score"); import reference as r; r.SITE=${JSON.stringify(root)}; print(r.repo_dir("a"))`;
    const run = (env: Record<string, string>) =>
      spawnSync("python3", ["-c", py], { encoding: "utf8", env: { ...process.env, RTM_REPORT_DIRS: "", RTM_REPO_ROOT: "", ...env } });
    const out = run({ RTM_REPORT_DIRS: wt });
    if (out.status !== 0 && /ModuleNotFound|ImportError/.test(out.stderr)) return; // python deps absent: skip
    expect(out.stdout.trim()).toBe(join(wt, "a-report"));
    expect(run({ RTM_REPO_ROOT: wt }).stdout.trim()).toBe(join(wt, "a-report"));
  });
});
