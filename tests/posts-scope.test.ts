import { describe, expect, it } from "vitest";
import { inScope, reportScope } from "../scripts/lib/posts-scope";

describe("posts scope", () => {
  it("collects repeated and comma-separated --report", () => {
    expect(reportScope(["--verify", "--report", "a,b", "--report", "c"])).toEqual(["a", "b", "c"]);
    expect(reportScope(["--verify"])).toEqual([]);
  });
  it("filters problems, or keeps all with no scope", () => {
    const p = [{ report: "a" }, { report: "b" }];
    expect(inScope(p, ["a"])).toEqual([{ report: "a" }]);
    expect(inScope(p, [])).toEqual(p);
  });
});
