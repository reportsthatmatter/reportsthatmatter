import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SHIP = join(import.meta.dirname, "../scripts/ship.ts");

// The scratch --root has no package.json: if --reset ever goes on to build the context or run a step, the script crashes
// (exit 1) instead of touching a real checkout, and this test fails.
describe("pnpm ship --reset runs no step (reportsthatmatter-fjej)", () => {
  it("deletes the state file, prints state reset: <path> and exits 0", () => {
    const root = mkdtempSync(join(tmpdir(), "ship-reset-"));
    const state = join(root, "build/ship/state.json");
    mkdirSync(join(root, "build/ship"), { recursive: true });
    writeFileSync(state, JSON.stringify({ spec: "0.0.0" }));
    const r = spawnSync("pnpm", ["exec", "tsx", SHIP, "--reset", "--root", root], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain(`state reset: ${state}`);
    expect(r.status).toBe(0);
    expect(existsSync(state)).toBe(false);
    expect(existsSync(join(root, "build/ship/logs"))).toBe(false);
  });

  it("refuses --reset --shared with the usage line and runs nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "ship-reset-"));
    const r = spawnSync("pnpm", ["exec", "tsx", SHIP, "--reset", "--shared", "--root", root], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: pnpm ship --reset/);
  });
});
