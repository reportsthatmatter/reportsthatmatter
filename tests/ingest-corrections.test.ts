import { describe, expect, it } from "vitest";
import { parseCorrections, applyCorrections } from "../scripts/ingest/corrections";
import type { Block } from "../scripts/ingest/paragraphs";

const at = (volume: number, printed: number) => ({ volume, pdfIndex: printed, printed });

const blocks = (): Block[] => [
  { kind: "paragraph", text: "So Help 1;fe Godp. 451 was cited.", at: at(2, 380) },
  { kind: "paragraph", text: "An unrelated paragraph.", at: at(2, 381) },
  { kind: "paragraph", text: "So Help 1;fe Godp. 451 was cited.", at: at(1, 12) },
];

const yaml = (body: string) => `version: 1\ncorrections:\n${body}`;

const ONE = yaml(`  - id: c-0001
    where: { volume: 2, printed: 380 }
    find: "So Help 1;fe Godp. 451"
    replace: "So Help Me God p. 451"
    reason: small-font OCR; checked against the scan
`);

describe("parseCorrections", () => {
  it("reads a correction", () => {
    const parsed = parseCorrections(ONE, "x");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].replace).toBe("So Help Me God p. 451");
  });

  it("rejects a correction with no id, since errors name it", () => {
    expect(() =>
      parseCorrections(yaml('  - find: "a"\n    replace: "b"\n'), "x")
    ).toThrow(/id/i);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      parseCorrections(
        yaml('  - id: c-1\n    find: "a"\n    replace: "b"\n  - id: c-1\n    find: "c"\n    replace: "d"\n'),
        "x"
      )
    ).toThrow(/c-1/);
  });

  it("requires a reason, because a correction is a human judgement on record", () => {
    expect(() =>
      parseCorrections(yaml('  - id: c-1\n    find: "a"\n    replace: "b"\n'), "x")
    ).not.toThrow();
  });
});

describe("applyCorrections", () => {
  it("applies a correction scoped to its page", () => {
    const result = applyCorrections(blocks(), parseCorrections(ONE, "x"), "x");
    const text = (block: Block) => (block as { text: string }).text;
    expect(text(result.blocks[0])).toContain("So Help Me God p. 451");
    // The identical text on another volume's page is left alone.
    expect(text(result.blocks[2])).toContain("So Help 1;fe Godp. 451");
    expect(result.applied).toBe(1);
  });

  it("fails loudly when a correction matches nothing", () => {
    const stale = yaml(`  - id: c-9
    where: { volume: 2, printed: 380 }
    find: "text that is not there"
    replace: "x"
`);
    expect(() => applyCorrections(blocks(), parseCorrections(stale, "x"), "x")).toThrow(
      /c-9.*matched 0/is
    );
  });

  it("fails loudly when a correction matches more than once", () => {
    const ambiguous = yaml(`  - id: c-8
    find: "So Help 1;fe Godp. 451"
    replace: "x"
`);
    expect(() =>
      applyCorrections(blocks(), parseCorrections(ambiguous, "x"), "x")
    ).toThrow(/c-8.*matched 2/is);
  });

  it("leaves blocks untouched when there are no corrections", () => {
    const before = blocks();
    const result = applyCorrections(before, [], "x");
    expect(result.blocks).toEqual(before);
    expect(result.applied).toBe(0);
  });

  it("corrects list items too", () => {
    const list: Block[] = [
      { kind: "list", items: ["a wrogn item"], quoted: false, at: at(1, 5) },
    ];
    const fix = yaml('  - id: c-2\n    find: "wrogn"\n    replace: "wrong"\n');
    const result = applyCorrections(list, parseCorrections(fix, "x"), "x");
    expect((result.blocks[0] as { items: string[] }).items[0]).toBe("a wrong item");
  });
});
