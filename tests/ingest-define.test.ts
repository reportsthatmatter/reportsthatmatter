import { describe, expect, it } from "vitest";
import { pipeline, resolvePasses } from "../scripts/ingest/define";
import { geometry, runningFurniture, printedPageNumber } from "../scripts/ingest/passes";

const base = {
  id: "x",
  title: "X",
  repo: "../x",
  volumes: [{ path: "archive/a.pdf" }],
};

describe("pipeline", () => {
  it("accepts a minimal definition", () => {
    expect(pipeline(base).id).toBe("x");
  });

  it("rejects a definition with no volumes", () => {
    expect(() => pipeline({ ...base, volumes: [] })).toThrow(/volume/i);
  });

  it("rejects a volume path that escapes the report repo", () => {
    expect(() =>
      pipeline({ ...base, volumes: [{ path: "../../etc/passwd" }] })
    ).toThrow(/escapes/i);
  });

  it("rejects two geometry passes, which would silently pick one", () => {
    expect(() =>
      pipeline({ ...base, passes: [geometry("document"), geometry("per-volume")] })
    ).toThrow(/geometry/i);
  });
});

describe("resolvePasses", () => {
  it("defaults to whole-document geometry and no volume passes", () => {
    const resolved = resolvePasses(pipeline(base));
    expect(resolved.geometry).toBe("document");
    expect(resolved.volumePasses).toEqual([]);
  });

  it("reads a multi-volume declaration", () => {
    // What Leveson declares. This replaced a `pageGroups.length > 1` test —
    // a property of the document inferred from the argument count.
    const resolved = resolvePasses(
      pipeline({ ...base, passes: [geometry("per-volume"), runningFurniture()] })
    );
    expect(resolved.geometry).toBe("per-volume");
    expect(resolved.volumePasses.map((p) => p.name)).toEqual(["runningFurniture"]);
  });

  it("ignores page-stage passes, which the page splitter runs itself", () => {
    const resolved = resolvePasses(pipeline({ ...base, passes: [printedPageNumber()] }));
    expect(resolved.volumePasses).toEqual([]);
  });
});
