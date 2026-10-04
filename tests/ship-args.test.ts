import { describe, expect, it } from "vitest";
import { parseShipArgs } from "../scripts/lib/ship-args";

describe("parseShipArgs", () => {
  it("accepts the documented flags", () => {
    const a = parseShipArgs(["--shared", "--yes", "--old-ref", "63ebf7de", "--base", "https://x.test", "--d1-limit", "29000"]);
    expect(a.errors).toEqual([]);
    expect(a.flag("--shared")).toBe(true);
    expect(a.flag("--plan")).toBe(false);
    expect(a.opt("--old-ref")).toBe("63ebf7de");
    expect(a.opt("--d1-limit")).toBe("29000");
  });

  it("rejects an unknown flag, so a typo cannot run the release", () => {
    expect(parseShipArgs(["--pln"]).errors).toEqual(["unknown flag --pln"]);
    expect(parseShipArgs(["--plan", "--redoo", "status"]).errors).toContain("unknown flag --redoo");
  });

  it("rejects a stray word and a value flag with no value", () => {
    expect(parseShipArgs(["plan"]).errors).toEqual(['unexpected argument "plan"']);
    expect(parseShipArgs(["--redo"]).errors).toEqual(["--redo needs a value"]);
    expect(parseShipArgs(["--redo", "--yes"]).errors).toEqual(["--redo needs a value"]);
  });

  it("collects every repeated --redo, and comma lists, in order", () => {
    const a = parseShipArgs(["--redo", "status", "--redo", "d1-estimate", "--ack", "baseline,corpus", "--ack", "editorial"]);
    expect(a.errors).toEqual([]);
    expect(a.list("--redo")).toEqual(["status", "d1-estimate"]);
    expect(a.list("--ack")).toEqual(["baseline", "corpus", "editorial"]);
    expect(a.list("--skip")).toEqual([]);
  });

  it("takes the last of a repeated single-valued option", () => {
    expect(parseShipArgs(["--base", "a", "--base", "b"]).opt("--base")).toBe("b");
  });
});
