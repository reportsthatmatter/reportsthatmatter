import { describe, expect, it } from "vitest";
import { gradeDiff, gradeReport, gradeTable, letterFor, precisionOf, type GradeInput, type GradeRecord } from "../src/lib/grade/grade";
import { pageBreaksFor, summariseReferee } from "../src/lib/grade/inputs";

const base = (over: Partial<GradeInput> = {}): GradeInput => ({
  id: "r",
  pages: 100,
  words: 40000,
  cleanEdition: false,
  oracle: { "paragraphs-oversplit": 0, "quotes-spurious": 0, "headings-missed": 0, "headings-spurious": 0, "markers-unlinked": 0, "markers-spurious": 0, "note-off-page": 0 },
  pooled: { "paragraphs-oversplit": { tp: 8, fp: 2, fn: 0 }, "quotes-spurious": { tp: 1, fp: 9, fn: 0 }, "headings-missed": { tp: 5, fp: 5, fn: 0 }, "headings-spurious": { tp: 0, fp: 4, fn: 0 }, "markers-unlinked": { tp: 10, fp: 0, fn: 0 }, "markers-spurious": { tp: 0, fp: 10, fn: 0 } },
  anchors: { "markers-wrong": 0, "pages-unmarked": 0, "blocks-wrong": 0, "markers-stacked": 5 },
  aliases: { unmatched: 0, reused: 0 },
  pageBreaks: null,
  werPages: null,
  ...over,
});

describe("quality bar grade (38s.16, decision 0030)", () => {
  it("maps errors per 10 pages to letters at the decided thresholds", () => {
    expect([0, 1, 1.01, 3, 3.5, 10, 10.1, 30, 31].map(letterFor)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D", "F"]);
  });

  it("takes a report's own golden precision only with enough findings, else pooled, else a prior", () => {
    const pooled = { s: { tp: 8, fp: 2, fn: 0 }, thin: { tp: 0, fp: 4, fn: 0 } };
    expect(precisionOf("s", { s: { tp: 5, fp: 0, fn: 0 } }, pooled).p).toBe(1);
    expect(precisionOf("s", { s: { tp: 1, fp: 1, fn: 0 } }, pooled).p).toBeCloseTo(0.8);
    expect(precisionOf("thin", undefined, pooled).p).toBeCloseTo(1 / 6);
    expect(precisionOf("absent", undefined, pooled).p).toBeCloseTo(0.5);
  });

  it("weights counts by precision, sums dimensions per 10 pages, and applies the no-dimension-below-C rule", () => {
    // notes: 100 unlinked x 1.0 = 100 errors over 100 pages = 10 per 10 pp (C); headings 40 x 0.5 = 20 -> 2 (B)
    const g = gradeReport(base({ oracle: { ...base().oracle!, "markers-unlinked": 100, "headings-missed": 40 } }));
    expect(g.dimensions.notes.per10).toBeCloseTo(10);
    expect(g.dimensions.notes.letter).toBe("C");
    expect(g.dimensions.headings.per10).toBeCloseTo(2);
    expect(g.per10).toBeCloseTo(12);
    expect(g.letter).toBe("D");
    expect(g.publishable).toBe(false);
    const d = gradeReport(base({ pages: 1000, oracle: { ...base().oracle!, "markers-unlinked": 1100 } }));
    expect(d.dimensions.notes.letter).toBe("D");
    expect(d.letter).toBe("D");
    expect(d.below).toEqual(["notes"]);
  });

  it("takes the larger of oversplits and page-break errors (they overlap), plus spurious quotations", () => {
    const g = gradeReport(base({ oracle: { ...base().oracle!, "paragraphs-oversplit": 10, "quotes-spurious": 10 }, pageBreaks: { source: "mini-reference", wrong: 2, judged: 20, stratum: "random" } }));
    // oversplit 10 x 0.8 = 8; page breaks 0.1 x 100 = 10; quotes 10 x 0.1 = 1 -> 11 errors -> 1.1 per 10 pp
    expect(g.dimensions.paragraphs.errors).toBeCloseTo(11);
    expect(g.dimensions.paragraphs.per10).toBeCloseTo(1.1);
    const hybrid = gradeReport(base({ cleanEdition: true, pageBreaks: { source: "reference", wrong: 5, judged: 10, stratum: "all" } }));
    expect(hybrid.dimensions.paragraphs.errors).toBe(0);
    expect(hybrid.dimensions.paragraphs.note).toMatch(/clean edition/);
  });

  it("grades reused ids, shows unmatched ids and words without grading them, and marks what is unmeasured", () => {
    const g = gradeReport(base({ aliases: { unmatched: 500, reused: 10 }, werPages: { wer: 0.01, pages: 50 }, anchors: null }));
    expect(g.dimensions.ids.per10).toBeCloseTo(1);
    expect(g.dimensions.ids.unmatched).toEqual({ count: 500, per10: 50 });
    expect(g.dimensions.words.graded).toBe(false);
    expect(g.dimensions.words.basis).toBe("indicative");
    expect(g.dimensions.words.per10).toBeCloseTo(40); // 1% of 400 words a page, x 10
    expect(g.dimensions.pages.basis).toBe("unmeasured");
    expect(g.per10).toBeCloseTo(1);
    expect(g.letter).toBe("A");
    const t = gradeTable([g]);
    expect(t).toContain("?40.0");
    expect(t).toContain("(?50.0 unmatched)");
    expect(t).toContain("| – |");
  });

  it("diffs letters and dimension moves against a previous record", () => {
    const now: GradeRecord = { ingest: "v2", site: "b", recorded: "d", reports: { r: gradeReport(base({ oracle: { ...base().oracle!, "markers-unlinked": 5 } })) } };
    const was: GradeRecord = { ingest: "v1", site: "a", recorded: "d", reports: { r: gradeReport(base({ oracle: { ...base().oracle!, "markers-unlinked": 50 } })) } };
    const d = gradeDiff(now, was);
    expect(d).toContain("▲ up");
    expect(d).toContain("N 5.0→0.5");
    expect(gradeDiff(now, null)).toContain("new");
  });
});

describe("grade inputs", () => {
  it("summarises referee eval labels by stratum, using the served call", () => {
    const rows = [
      { report: "a", stratum: "random", truth: "join", after: "split" },
      { report: "a", stratum: "random", truth: "join", after: "join" },
      { report: "a", stratum: "tier-low", truth: "split", after: "join" },
      { report: "a", stratum: "random", truth: "join", after: null },
    ].map((r) => JSON.stringify(r)).join("\n");
    const rec = summariseReferee(rows, "v1", "2026-10-25");
    expect(rec.reports.a).toEqual({ random: { judged: 2, wrong: 1 }, all: { judged: 3, wrong: 2 } });
    // under 10 random breaks: fall back to all strata
    expect(pageBreaksFor("a", rec, null)).toEqual({ source: "mini-reference", wrong: 2, judged: 3, stratum: "all" });
    expect(pageBreaksFor("b", rec, { reports: { b: { metrics: { join_adj_ours_wrong: 1, join_adj_judged: 30 } } } })).toEqual({ source: "reference", wrong: 1, judged: 30, stratum: "all" });
    expect(pageBreaksFor("c", rec, null)).toBeNull();
  });
});
