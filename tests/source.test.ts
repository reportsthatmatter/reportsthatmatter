import { describe, expect, it } from "vitest";
import { loadReportMarkdown } from "../src/lib/source";

describe("source", () => {
  it("loads markdown from source_path", async () => {
    const markdown = await loadReportMarkdown(
      "reports/samples/us-senate-wall-street-and-financial-crisis/full.md"
    );
    expect(markdown).toContain("#");
  });
});
