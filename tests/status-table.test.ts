import { describe, expect, it } from "vitest";
import { classify, formatTable } from "../scripts/lib/status-table";

describe("classify", () => {
  it("is current when the served hash is the local one", () => {
    expect(classify("a", "abc123abc123abc1", { version: "abc123abc123abc1" }).state).toBe("current");
  });
  it("is drift when it differs", () => {
    expect(classify("a", "abc123abc123abc1", { version: "ffffffffffffffff" }).state).toBe("drift");
  });
  it("is unpublished when the deploy's own copy is served", () => {
    expect(classify("a", "abc123abc123abc1", { version: "assets" }).state).toBe("unpublished");
  });
  it("is an error, with the reason, when the site could not be read", () => {
    const row = classify("a", "abc123abc123abc1", { error: "unreachable: ECONNREFUSED" });
    expect(row.state).toBe("error");
    expect(row.detail).toMatch(/ECONNREFUSED/);
  });
});

describe("formatTable", () => {
  const rows = [
    classify("alpha", "1111111111111111", { version: "1111111111111111" }),
    classify("beta-report", "2222222222222222", { version: "3333333333333333" }),
    classify("gamma", "4444444444444444", { version: "assets" }),
  ];

  it("lists each report with short hashes and a state", () => {
    const text = formatTable(rows, "https://example.org");
    expect(text).toMatch(/alpha\s+111111111111\s+111111111111\s+current/);
    expect(text).toMatch(/beta-report\s+222222222222\s+333333333333\s+DRIFT: republish/);
    expect(text).toMatch(/gamma\s+444444444444\s+assets\s+not published/);
  });

  it("names the reports to publish, with the command", () => {
    const text = formatTable(rows, "https://example.org");
    expect(text).toMatch(/2 of 3 report\(s\) need publishing: beta-report, gamma/);
    expect(text).toMatch(/pnpm publish-report <id> --base https:\/\/example.org/);
  });

  it("says so when nothing needs publishing", () => {
    expect(formatTable([rows[0]], "x")).toMatch(/all 1 report\(s\) are serving what this checkout would publish/);
  });
});
