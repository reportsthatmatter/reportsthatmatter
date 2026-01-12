import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/markdown";

describe("markdown", () => {
  it("injects sequential paragraph ids", () => {
    const html = renderMarkdown("One.\n\nTwo.");
    expect(html).toContain('id="p-1"');
    expect(html).toContain('id="p-2"');
  });
});
