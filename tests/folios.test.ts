import { describe, expect, it } from "vitest";
import { diffFolios, formatFolioDiff, formatFolios, parsePagesArg, type FolioPage, type FolioReport } from "../scripts/lib/folios";

const page = (pdfIndex: number, printed: number | null, source: FolioPage["source"] = "pipeline", extra: Partial<FolioPage> = {}): FolioPage => ({ volume: 1, pdfIndex, printed, source, offset: printed === null ? null : printed - pdfIndex, ...extra });
const report = (pages: FolioPage[], runs: FolioReport["runs"] = []): FolioReport => ({ pages, runs, unread: pages.filter((p) => p.printed === null && !p.stray).length, inferred: pages.filter((p) => p.inferred !== undefined).length, strays: pages.filter((p) => p.stray).length });

describe("formatFolios", () => {
  const r = report(
    [page(1, 1, "vision"), page(2, 2, "vision"), page(3, 77, "pipeline", { printed: null, stray: { printed: 77, dropped: true }, offset: 74 }), page(4, null, "pipeline", { inferred: 4 }), page(5, 5)],
    [{ volume: 1, fromPdf: 1, toPdf: 5, reads: 3, offset: 0, firstPrinted: 1, lastPrinted: 5 }]
  );
  it("summarises runs, strays and unread pages", () => {
    const text = formatFolios("x", r);
    expect(text).toContain("x: 5 PDF pages; 3 read a printed number, 1 numbered from their neighbours, 1 none, 1 stray read; source vision 2, pipeline 3");
    expect(text).toContain("p.1-5  offset 0  printed 1-5  3 reads");
    expect(text).toContain("p.3 read 77 (offset +74) dropped by foliosInStep");
    expect(text).toContain("p.4 (marked 4 from neighbours)");
    expect(text).toContain("source runs: p.1-2 vision, p.3-5 pipeline");
    expect(text).not.toContain("PDF page |");
  });
  it("prints one row per page on request, or for a range", () => {
    expect(formatFolios("x", r, { pages: "all" })).toContain("p.3 | none | +74 | pipeline | stray read 77 (dropped)");
    const some = formatFolios("x", r, { pages: { from: 5, to: 5 } });
    expect(some).toContain("p.5 | 5 | 0 | pipeline");
    expect(some).not.toContain("p.1 |");
  });
  it("parses --pages", () => {
    expect(parsePagesArg("all")).toBe("all");
    expect(parsePagesArg("10-12")).toEqual({ from: 10, to: 12 });
    expect(parsePagesArg("x")).toBeUndefined();
  });
});

describe("diffFolios", () => {
  const before = report([page(1, 1, "vision"), page(2, 2, "vision"), page(3, 3, "vision"), page(4, 4, "pipeline"), page(5, 2)]);
  const after = report([page(1, 1, "vision"), page(2, 2, "pipeline"), page(3, 3, "pipeline"), page(4, 4, "vision"), page(5, null, "pipeline", { stray: { printed: 2, dropped: true }, offset: -3 })]);
  it("lists source flips and read changes, collapsing consecutive pages", () => {
    const d = diffFolios(before, after);
    expect(d.flipped.map((f) => f.pdfIndex)).toEqual([2, 3, 4]);
    expect(d.reread).toEqual([{ volume: 1, pdfIndex: 5, from: 2, to: null }]);
    const text = formatFolioDiff("x", d, 5);
    expect(text).toContain("x: 3 pages changed source, 1 changed printed-number read");
    expect(text).toContain("p.2-3  vision → pipeline");
    expect(text).toContain("p.4  pipeline → vision");
    expect(text).toContain("p.5  2 → none");
  });
  it("says so when nothing moved", () => {
    expect(formatFolioDiff("x", diffFolios(before, before), 5)).toBe("x: no page changed source or printed-number read");
  });
});
