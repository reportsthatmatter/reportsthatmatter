import { describe, expect, it } from "vitest";
import { checkOracleBudget, parseOracleBudget, ratchetOracleBudgetText } from "../scripts/ingest/oracle-budget";

const text = `# comment
reports:
  alpha:
    headings-missed: 10
    markers-unlinked: 5  # why: x
  beta:
    markers-unlinked: 3
`;

describe("oracle budgets", () => {
  const budget = parseOracleBudget(text);

  it("fails a count over its budget and notes one under it", () => {
    const r = checkOracleBudget(budget, "alpha", { "headings-missed": 11, "markers-unlinked": 2 });
    expect(r.over).toEqual([{ signal: "headings-missed", count: 11, budget: 10 }]);
    expect(r.slack).toEqual([{ signal: "markers-unlinked", count: 2, budget: 5 }]);
  });

  it("holds a report with no entry to nothing", () => {
    expect(checkOracleBudget(budget, "gamma", { "markers-unlinked": 99 })).toEqual({ over: [], slack: [] });
  });

  it("ratchets only the named report, only downward, keeping comments", () => {
    const out = ratchetOracleBudgetText(text, "alpha", { "headings-missed": 12, "markers-unlinked": 2 });
    expect(out).toContain("headings-missed: 10\n");
    expect(out).toContain("markers-unlinked: 2  # why: x");
    expect(out).toContain("beta:\n    markers-unlinked: 3");
  });
});
