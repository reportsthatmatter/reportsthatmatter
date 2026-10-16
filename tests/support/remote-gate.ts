/**
 * The shared test for "no script reaches production before its confirmation flag" (reportsthatmatter-jp6i, cs92).
 *
 * `runScript` spawns the real script with a fake `pnpm`, `wrangler` and `npx` first on PATH. Every one of them only
 * records its arguments and exits 1, so a script that tries a remote call both leaves a trace in `calls` and fails;
 * wrangler is reached only through `pnpm` (scripts/lib/d1.ts, migrate-hosting.ts), so nothing is ever sent anywhere.
 * `gateCases` and `unknownFlagCases` then state the two promises every such script keeps:
 *
 *   1. without its confirmation flag it exits non-zero, says the flag, and makes no call;
 *   2. an unknown flag (a mistyped `--offline`) exits 2 before any call.
 *
 * Add a script by adding it to tests/remote-gate.test.ts. The helper also sets CLOUDFLARE_* and wrangler profile
 * variables to nothing, so a script that skips the fake and reads credentials directly would find none.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const tsx = join(root, "node_modules/.bin/tsx");

export type Run = { status: number | null; output: string; calls: string[] };

/** Runs `node_modules/.bin/tsx <script> <args>` in the repo with the recording fakes first on PATH. */
export function runScript(script: string, args: string[], env: Record<string, string> = {}): Run {
  const bin = mkdtempSync(join(tmpdir(), "remote-gate-"));
  const called = join(bin, "called");
  for (const name of ["pnpm", "wrangler", "npx"]) {
    const file = join(bin, name);
    writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${called}"\nexit 1\n`);
    chmodSync(file, 0o755);
  }
  const result = spawnSync(tsx, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "", PATH: `${bin}:${process.env.PATH}`, ...env },
    timeout: 60_000,
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: existsSync(called) ? readFileSync(called, "utf8").split("\n").filter(Boolean) : [],
  };
}

export type Gate = {
  /** The script, relative to the repo root. */
  script: string;
  /** Invocations that would reach production and carry no confirmation flag: each must refuse. */
  refuses: string[][];
  /** A valid invocation (flags only) to which an unknown flag is added. */
  base: string[];
  /** The text the refusal must name; default `--yes`. */
  flag?: string;
  /** Environment the script needs to get as far as its gate (e.g. a fake Cloudflare account). */
  env?: Record<string, string>;
};

/** Registers the two promises for one script inside the caller's `describe`. */
export function gateCases({ script, refuses, base, flag = "--yes", env }: Gate): void {
  for (const args of refuses) {
    it(`${script} ${args.join(" ")} refuses before any remote call`, () => {
      const r = runScript(script, args, env);
      expect(r.status, r.output).not.toBe(0);
      expect(r.output).toContain(flag);
      expect(r.calls).toEqual([]);
    }, 90_000);
  }
  it(`${script} rejects an unknown flag with exit 2 before any remote call`, () => {
    const r = runScript(script, [...base, "--offline-typo"], env);
    expect(r.status, r.output).toBe(2);
    expect(r.output).toMatch(/unknown flag --offline-typo/);
    expect(r.calls).toEqual([]);
  }, 90_000);
}
