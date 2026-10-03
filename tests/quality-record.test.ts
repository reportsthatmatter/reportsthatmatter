import { describe, expect, it } from "vitest";
import { staleRecord } from "../src/lib/quality/diff";

describe("staleRecord", () => {
  it("is silent when the record was made at the installed version, with or without the v", () => {
    expect(staleRecord("v0.18.1", "0.18.1")).toBeNull();
    expect(staleRecord("0.18.1", "0.18.1")).toBeNull();
  });
  it("is silent when nothing was recorded", () => {
    expect(staleRecord(undefined, "0.18.1")).toBeNull();
  });
  it("names both versions and the release step when they differ", () => {
    const warning = staleRecord("v0.17.0", "0.18.1")!;
    expect(warning).toMatch(/v0\.17\.0/);
    expect(warning).toMatch(/v0\.18\.1/);
    expect(warning).toMatch(/ratchet --record/);
  });
});
