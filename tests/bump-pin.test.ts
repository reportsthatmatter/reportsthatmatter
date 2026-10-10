import { describe, expect, it } from "vitest";
import { installArgv, normaliseVersion, pinWith, rewritePin } from "../scripts/lib/bump-pin";

describe("bump-pin", () => {
  it("normalises versions", () => {
    expect(normaliseVersion("0.25.0")).toBe("v0.25.0");
    expect(normaliseVersion("v0.25.0")).toBe("v0.25.0");
    expect(normaliseVersion("main")).toBeNull();
    expect(normaliseVersion("0.25")).toBeNull();
  });
  it("replaces the tag only", () => {
    expect(pinWith("github:reportsthatmatter/ingest#v0.24.0", "v0.25.0")).toBe("github:reportsthatmatter/ingest#v0.25.0");
    expect(pinWith("^0.24.0", "v0.25.0")).toBeNull();
  });
  it("rewrites package.json text and keeps the rest", () => {
    const text = '{\n  "dependencies": {\n    "@rtm/ingest": "github:x/ingest#v0.24.0",\n    "yaml": "^2"\n  }\n}\n';
    expect(rewritePin(text, "github:x/ingest#v0.25.0")).toBe(text.replace("v0.24.0", "v0.25.0"));
    expect(rewritePin(text.replace("v0.24.0", "v0.25.0"), "github:x/ingest#v0.25.0")).toContain("v0.25.0");
    expect(() => rewritePin("{}", "x")).toThrow();
  });
  it("never installs frozen", () => {
    expect(installArgv("/r")).toEqual(["pnpm", "-C", "/r", "install", "--no-frozen-lockfile"]);
  });
});
