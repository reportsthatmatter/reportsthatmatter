/**
 * Every script that can reach production D1 or a Cloudflare account refuses before its first remote call without
 * its confirmation flag, and rejects unknown flags (reportsthatmatter-jp6i, cs92). The mechanism is
 * tests/support/remote-gate.ts: the real script, a fake pnpm/wrangler on PATH that records and fails.
 *
 * Not covered, on purpose: `pnpm d1-usage` has no confirmation flag. It exists to be run by a cron (docs/d1-usage-alert.md),
 * reads Cloudflare's analytics API and writes nothing and no D1 rows, so it only rejects unknown flags.
 * `./scripts/reindex-search.sh` is a bash wrapper that passes its flags to reindex-search.mjs, which is what is tested.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exitUnlessConfirmed, unknownFlags } from "../scripts/lib/args";
import { RemoteNotConfirmed, wranglerRunner } from "../scripts/lib/d1";
import { gateCases, runScript } from "./support/remote-gate";

const REPORT = "uk-leveson-inquiry";
const DEPLOYED = ["--base", "https://rtm-test.invalid"];
const noCache = join(tmpdir(), `rtm-no-marks-cache-${process.pid}.json`);

describe("pnpm feed", () => {
  gateCases({
    script: "scripts/feed.mjs",
    base: ["status"],
    refuses: [
      ["status", "--remote"],
      ["list", "--held", "--remote"],
      ["hide", "42", "--remote"],
      ["show", "42", "--remote"],
      ["hide", "--report", REPORT, "--remote"],
      ["hide", "--all", "--remote"],
      ["rebuild", "--remote"],
      ["rebuild", "--dry-run", "--remote"],
    ],
  });
});

describe("pnpm subscribers", () => {
  gateCases({
    script: "scripts/subscribers.mjs",
    base: ["count"],
    refuses: [["count", "--remote"], ["export", "--remote"], ["remove", "reader@example.org", "--remote"]],
  });
});

describe("pnpm seed-highlights", () => {
  gateCases({ script: "scripts/seed-highlights.mjs", base: ["--dry-run"], refuses: [["--remote"], ["--remote", "--dry-run"], ["--remote", "--report", REPORT]] });
});

describe("pnpm marks check", () => {
  gateCases({
    script: "scripts/marks-check.mjs",
    base: [REPORT, "--no-marks"],
    refuses: [
      [REPORT, "--cache", noCache],
      ["--all", "--refresh", "--cache", noCache],
    ],
  });

  it("reads nothing from production when the run is offline (--no-marks, --marks-file) or local", () => {
    const r = runScript("scripts/marks-check.mjs", [REPORT, "--no-marks"]);
    expect(r.calls).toEqual([]);
    expect(r.output).toContain("marks: skipped");
  });
});

describe("pnpm d1-usage", () => {
  gateCases({ script: "scripts/d1-usage.mjs", base: ["--json"], refuses: [] });
});

describe("pnpm migrate-hosting", () => {
  gateCases({
    script: "scripts/migrate-hosting.ts",
    base: ["inventory"],
    refuses: [["inventory"], ["export-d1"], ["import-d1"], ["verify-d1"], ["sync-d1", "--dry-run"], ["sync-r2", "--dry-run"], ["sync-d1", "--versions", "--overwrite-production"]],
  });
});

describe("pnpm check-search-staleness", () => {
  gateCases({ script: "scripts/check-search-staleness.mjs", base: ["--local"], refuses: [[], ["--remote"]] });
});

describe("scripts/reindex-search.mjs", () => {
  gateCases({
    script: "scripts/reindex-search.mjs",
    base: [REPORT, "--local"],
    refuses: [[REPORT], [REPORT, "--dry-run"], [REPORT, "--full"], ["--record-layouts"], ["--record-layouts", "--dry-run"]],
  });
});

describe("pnpm publish-report", () => {
  gateCases({
    script: "scripts/publish-report.mjs",
    base: [REPORT, "--dry-run", "--offline"],
    refuses: [
      [REPORT, "--preflight", ...DEPLOYED],
      [REPORT, "--dry-run", ...DEPLOYED],
      [REPORT, ...DEPLOYED],
      [REPORT, "--no-preflight", ...DEPLOYED],
    ],
  });
});

describe("the shared pieces", () => {
  it("wranglerRunner refuses a --remote call that was not confirmed, before starting wrangler", () => {
    const run = wranglerRunner(process.cwd());
    expect(() => run("--remote", { command: "SELECT 1" })).toThrow(RemoteNotConfirmed);
    expect(() => run("--remote", { file: "x.sql" })).toThrow(/--yes/);
  });

  it("unknownFlags skips the value after a valued flag and always allows --help", () => {
    expect(unknownFlags(["--a", "--limit", "--not-a-flag-it-is-a-value", "--oops", "-h"], ["--a"], ["--limit"])).toEqual(["--oops"]);
    expect(unknownFlags(["x", "--help"], [])).toEqual([]);
  });

  it("exitUnlessConfirmed lets a confirmed or non-production run through", () => {
    expect(() => exitUnlessConfirmed(["--yes"], "x")).not.toThrow();
    expect(() => exitUnlessConfirmed([], "x", false)).not.toThrow();
  });
});
