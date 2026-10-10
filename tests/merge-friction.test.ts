/**
 * The shared files that conflicted at every integration were split (site #317): the corpus baseline is one file per
 * report, the decisions index is generated, and lessons are one file each. A PR written before the split can bring
 * the old files back by a merge that does not conflict (a fresh add). Nothing reads them any more, so they would
 * sit there silently stale: fail instead, with what to do.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("merge-friction layout", () => {
  it("the single corpus baseline file is gone: accept into reports/corpus-baseline/<id>.json (pnpm corpus accept <id>)", () => {
    expect(existsSync(join(root, "reports/corpus-baseline.json"))).toBe(false);
  });
  it("docs/decisions/README.md holds no index table: the index is generated (pnpm decisions)", () => {
    const readme = readFileSync(join(root, "docs/decisions/README.md"), "utf8");
    expect(readme).not.toMatch(/^\| \[\d{4}\]\(/m);
  });
});
