import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { paragraphDensityCheck, MIN_PARAGRAPH_IDS_PER_1000_WORDS } from "../src/lib/density";

// reportsthatmatter-4qw: uk-chilcot-inquiry shipped from ingest v0.14.0 with
// 892 numbered paragraphs written to Markdown as a bare ordered list — no
// paragraph id, so `pnpm ingest check` and `pnpm corpus check` both passed
// (a baseline records whatever shipped, not whether it was right). This is
// the check that would have caught it: paragraph ids per 1,000 words,
// implausibly low for a report with running prose.
describe("paragraphDensityCheck (reportsthatmatter-4qw)", () => {
  it("fails on the pre-fix Chilcot baseline — 64 ids over 59,832 words", () => {
    const result = paragraphDensityCheck(59832, 64);
    expect(result.perThousandWords).toBeCloseTo(1.07, 1);
    expect(result.ok).toBe(false);
  });

  it("passes on the fixed Chilcot — 956 ids over 61,616 words", () => {
    const result = paragraphDensityCheck(61616, 956);
    expect(result.perThousandWords).toBeCloseTo(15.52, 1);
    expect(result.ok).toBe(true);
  });

  it("passes on every other report in the current corpus baseline", () => {
    const root = join(import.meta.dirname, "..");
    const baseline = JSON.parse(readFileSync(join(root, "reports/corpus-baseline.json"), "utf8"));
    const failing: string[] = [];
    for (const [id, report] of Object.entries(baseline.reports) as [string, { words: number; paragraphs: number }][]) {
      const { ok, perThousandWords } = paragraphDensityCheck(report.words, report.paragraphs);
      if (!ok) failing.push(`${id} (${perThousandWords.toFixed(2)}/1000 words)`);
    }
    expect(failing).toEqual([]);
  });

  it("the threshold sits below the corpus's own legitimate floor (jack-smith-vol1, ~6.7/1000)", () => {
    expect(MIN_PARAGRAPH_IDS_PER_1000_WORDS).toBeLessThan(6.7);
  });
});
