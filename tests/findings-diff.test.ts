import { describe, expect, it } from "vitest";
import { diffFindings, formatFindingsDiff, fromAnchors, fromOracle, fromQuality } from "../scripts/lib/findings-diff";
import { parseVerifyArgs } from "../scripts/ingest/verify-args";

const o = (signal: string, page: number, text: string) => ({ signal, volume: 1, page, text });

describe("diffFindings", () => {
  it("reports what appeared and what vanished, keyed by page and text, not position", () => {
    const before = fromOracle([o("headings-missed", 3, "Intro"), o("headings-missed", 9, "Gone"), o("quotes-missed", 4, "q")]);
    const after = fromOracle([o("quotes-missed", 4, "q"), o("headings-missed", 3, "Intro"), o("headings-missed", 12, "New   one")]);
    const d = diffFindings(before, after);
    expect(d.appeared.map((f) => f.text)).toEqual(["New one"]);
    expect(d.vanished.map((f) => f.text)).toEqual(["Gone"]);
    expect(d.counts.find((c) => c.signal === "headings-missed")).toMatchObject({ before: 2, after: 2 });
  });

  it("treats duplicates as a multiset", () => {
    const one = fromOracle([o("a", 1, "x")]);
    const two = fromOracle([o("a", 1, "x"), o("a", 1, "x")]);
    expect(diffFindings(one, two).appeared).toHaveLength(1);
    expect(diffFindings(two, one).vanished).toHaveLength(1);
    expect(diffFindings(two, two)).toMatchObject({ appeared: [], vanished: [] });
  });

  it("normalises anchors and quality findings, and keeps the sources apart", () => {
    const anchors = fromAnchors({
      verdicts: [{ label: "12", line: 40, verdict: "wrong", page: { volume: 1, pdfIndex: 14 }, context: "the words" }, { label: "13", line: 50, verdict: "exact" }],
      blocks: { wrongBlocks: [{ line: 7, marker: "5", printedOn: "6", text: "block", unmarkedPage: false }, { line: 8, marker: "5", printedOn: "7", text: "b2", unmarkedPage: true }] },
      unmarked: [{ volume: 1, pdfIndex: 20, label: "18" }],
    } as never);
    expect(anchors.map((f) => f.signal)).toEqual(["markers-wrong", "blocks-wrong", "pages-unmarked"]);
    const q = fromQuality([{ signal: "hyphen", page: null, excerpt: "co-\noperate" }]);
    expect(q[0]).toMatchObject({ source: "quality", where: "no printed page", text: "co- operate" });
    // a line number moving is not a different finding
    const moved = fromAnchors({ verdicts: [{ label: "12", line: 99, verdict: "wrong", page: { volume: 1, pdfIndex: 14 }, context: "the words" }], blocks: { wrongBlocks: [] }, unmarked: [] } as never);
    expect(diffFindings(anchors.slice(0, 1), moved)).toMatchObject({ appeared: [], vanished: [] });
  });

  it("does not call a finding that only changed page appeared and vanished", () => {
    const d = diffFindings(fromOracle([o("quotes-missed", 83, "same words"), o("quotes-missed", 5, "same words")]), fromOracle([o("quotes-missed", 84, "same words"), o("quotes-missed", 5, "same words")]));
    expect(d).toMatchObject({ appeared: [], vanished: [], moved: 1 });
    expect(formatFindingsDiff("r", d, 3)).toBe("r: no finding appeared or vanished (1 more only changed page)");
  });

  it("prints the signals that moved and at most `limit` findings per signal", () => {
    const after = fromOracle([o("headings-missed", 1, "a"), o("headings-missed", 2, "b"), o("headings-missed", 3, "c")]);
    const text = formatFindingsDiff("r", diffFindings([], after), 2);
    expect(text).toContain("r: 3 appeared, 0 vanished");
    expect(text).toContain("oracle headings-missed: 0 → 3");
    expect(text).toContain("+ oracle headings-missed · vol 1 p.1 · a");
    expect(text).toContain("… 1 more oracle headings-missed");
    expect(formatFindingsDiff("r", diffFindings(after, after), 2)).toBe("r: no finding appeared or vanished");
  });
});

describe("parseVerifyArgs", () => {
  it("keeps --findings N and --findings-json <file> out of the positional arguments", () => {
    expect(parseVerifyArgs(["--findings", "20", "us-x"])).toMatchObject({ positional: ["us-x"], findingsLimit: 20 });
    expect(parseVerifyArgs(["us-x", "--findings"])).toMatchObject({ positional: ["us-x"], findingsLimit: 5 });
    expect(parseVerifyArgs(["--findings", "all"]).findingsLimit).toBe(Infinity);
    expect(parseVerifyArgs(["--findings", "us-x"])).toMatchObject({ positional: ["us-x"], findingsLimit: 5 });
    const r = parseVerifyArgs(["--no-golden", "--findings-json", "/t/f.json", "us-x"]);
    expect(r).toMatchObject({ positional: ["us-x"], findingsJson: "/t/f.json", flags: ["--no-golden"], findingsLimit: undefined });
    expect(() => parseVerifyArgs(["--findings-json"])).toThrow();
  });
});
