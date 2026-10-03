import { describe, expect, it } from "vitest";
import { diffDecisions, formatDecisionDiff, rowKeys } from "../src/lib/score/diff";
import type { Row } from "../src/lib/score/decisions";

const boundary = (page: number, prev: string, next: string, correct: boolean | null): Row => ({
  decision: "boundary", source: "layout", page, prev_text: prev, next_text: next, correct, ours_boundary: !correct, ref_boundary: true, printed_page: page,
});
const block = (text: string, correct: boolean | null, type = "paragraph"): Row => ({ decision: "block", printed_page: 3, text, ours_type: type, ref_type: "paragraph", correct });
const marker = (label: string, correct: boolean): Row => ({ decision: "marker", label, before: "words before", after: "words after", outcome: correct ? "linked" : "bare", correct, printed_page: 4 });

describe("diffDecisions", () => {
  it("separates fixes from regressions per decision kind, with the text", () => {
    const a = [boundary(1, "ends here", "starts here", false), boundary(2, "x", "y", true), block("a heading-ish line", true), marker("12", false)];
    const b = [boundary(1, "ends here", "starts here", true), boundary(2, "x", "y", false), block("a heading-ish line", true), marker("12", true)];
    const d = diffDecisions(a, b);
    expect(d.kinds.boundary.fixed).toHaveLength(1);
    expect(d.kinds.boundary.broke).toHaveLength(1);
    expect(d.kinds.block.same).toBe(1);
    expect(d.kinds.marker.fixed).toHaveLength(1);
    const text = formatDecisionDiff("r", d);
    expect(text).toContain("1 correct→wrong");
    expect(text).toContain("…x ¦ y…");
    expect(text).toMatch(/wrong → correct, boundary/);
  });

  it("reports rows only one run has, and rows that became labelled", () => {
    const a = [block("old text", true), block("same", null)];
    const b = [block("new text", true), block("same", true)];
    const d = diffDecisions(a, b);
    expect(d.kinds.block.added).toHaveLength(1);
    expect(d.kinds.block.gone).toHaveLength(1);
    expect(d.kinds.block.labelled).toHaveLength(1);
  });

  it("numbers repeats of the same key in order, so identical lines are not collapsed", () => {
    const keys = rowKeys([block("Introduction", true), block("Introduction", false)]);
    expect(new Set(keys).size).toBe(2);
  });
});
