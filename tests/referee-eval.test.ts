import { describe, expect, it } from "vitest";
import { errorKind } from "../scripts/ingest/referee";

// The error kinds `pnpm ingest referee eval --breakdown` reports at adjudicated page breaks (38s.15).
describe("errorKind", () => {
  const join = (prev: string, next: string, between = "none") => ({ prev, next, join: true, between });
  it("puts something of ours standing between the halves first, whatever the lines' shape", () => {
    expect(errorKind(join("Adding weight to", "the Orbiter reduces the payload", "notes"), 1)).toBe("missed join: notes left between in our text");
    expect(errorKind(join("for the", "Environmental Defense Fund's Ocean Program"), 2)).toBe("missed join: something left between in our text");
  });
  it("treats footnotes at the page foot as routine when nothing of ours stands between", () => {
    expect(errorKind(join("the D.C. Circuit, and the", "Supreme Court. 256 Given the gravity", "notes"))).toBe("missed join: capital after an unfinished sentence");
    expect(errorKind(join("which are made from recipes known", "only by the manufacturer", "notes"))).toBe("missed join: lower-case continuation");
    expect(errorKind(join("(proposing April", "2026 trial date, emphasizing"))).toBe("missed join: digit, bracket or quotation mark opens");
    expect(errorKind(join("pressures on banks.3169", "One analyst wrote in late September 2007"))).toBe("missed join: runs on after a finished sentence");
  });
  it("names a caption or figure the adjudicator saw between", () => {
    expect(errorKind(join("as seen in the", "chart and the table", "caption"))).toBe("missed join: caption between");
  });
  it("classes a wrong join by how the new block opens", () => {
    const split = (prev: string, next: string) => ({ prev, next, join: false });
    expect(errorKind(split("was not itself minded to pursue;", "(c) why the ICO did not appear"))).toBe("wrong join: into a label or numbered paragraph");
    expect(errorKind(split("Sir Paul Stephenson said:763", "“… I am nervous about restraining"))).toBe("wrong join: into a quotation");
    expect(errorKind(split("David-John Collins", "Lord Condon of Langton Green"))).toBe("wrong join: after an unfinished line");
  });
});
