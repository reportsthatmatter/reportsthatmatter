// Decision records stay numbered uniquely (reportsthatmatter-js2r): in the v0.25.0 batch two PRs both added
// 0015 and 0016 and the reviewer renumbered by hand. This runs in `pnpm test`, so CI fails the collision.
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDecisions, decisionIndex, nextNumber, readDecisions } from "../scripts/lib/decisions";

const dir = join(import.meta.dirname, "../docs/decisions");

const record = (n: string, status = "open", title = `${n}. A question?`) =>
  `# ${title}\n\n- **Status:** ${status}\n- **Date raised:** 2026-10-10 · **Date decided:** —\n- **Beads:** reportsthatmatter-abcd (this decision)\n`;

/** A scratch copy of the real records, plus extra files. */
function scratch(extra: Record<string, string>) {
  const d = mkdtempSync(join(tmpdir(), "rtm-decisions-"));
  cpSync(dir, d, { recursive: true });
  for (const [f, text] of Object.entries(extra)) writeFileSync(join(d, f), text);
  return d;
}

describe("docs/decisions/", () => {
  it("has no duplicate numbers, and every title agrees with its file name", () => {
    expect(checkDecisions(dir)).toEqual([]);
  });

  it("finds the records, 0001 upward", () => {
    const numbers = readDecisions(dir).map((r) => r.number);
    expect(numbers.length).toBeGreaterThanOrEqual(20);
    expect(numbers[0]).toBe("0001");
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("fails on a scratch copy holding two records numbered alike", () => {
    const next = nextNumber(dir);
    const d = scratch({ [`${next}-first.md`]: record(next), [`${next}-second.md`]: record(next) });
    const problems = checkDecisions(d);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(new RegExp(`number ${next} is taken by 2 records: ${next}-first.md, ${next}-second.md`));
  });

  it("fails when the title disagrees with the file name, or has no number", () => {
    const d = scratch({ "0090-a.md": record("0091"), "0091-b.md": "# No number here\n\n- **Status:** open\n" });
    const problems = checkDecisions(d);
    expect(problems).toContain("0090-a.md: the title says 0091, the file name says 0090");
    expect(problems).toContain('0091-b.md: the title must read "# 0091. <question>"');
  });

  it("fails on a record with no Status line", () => {
    const d = scratch({ "0090-a.md": "# 0090. A?\n" });
    expect(checkDecisions(d)).toEqual(["0090-a.md: no \"- **Status:**\" line"]);
  });

  it("numbers the next record one past the highest, 4 digits", () => {
    const d = mkdtempSync(join(tmpdir(), "rtm-decisions-"));
    writeFileSync(join(d, "0000-template.md"), record("0000"));
    expect(nextNumber(d)).toBe("0001");
    writeFileSync(join(d, "0007-x.md"), record("0007"));
    expect(nextNumber(d)).toBe("0008");
  });

  it("the generated index has a row for every record, in number order", () => {
    const rows = decisionIndex(dir).split("\n").slice(2);
    expect(rows.map((r) => r.match(/^\| \[(\d{4})\]/)?.[1])).toEqual(readDecisions(dir).map((r) => r.number));
    expect(rows.every((r) => !r.endsWith("| — |"))).toBe(true); // each names its bead
  });
});
