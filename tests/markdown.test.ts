import { describe, expect, it } from "vitest";
import { renderMarkdown, splitFrontMatter, slugify } from "../src/lib/markdown";

describe("markdown", () => {
  it("injects sequential paragraph ids", () => {
    const html = renderMarkdown("One.\n\nTwo.");
    expect(html).toContain('id="p-1"');
    expect(html).toContain('id="p-2"');
  });

  it("adds a permalink anchor to each paragraph", () => {
    const html = renderMarkdown("One.\n\nTwo.");
    expect(html).toContain('<a class="permalink" href="#p-1"');
    expect(html).toContain('<a class="permalink" href="#p-2"');
  });

  it("does not render front matter as body text", () => {
    const html = renderMarkdown('---\ntitle: "A Report"\n---\n\nBody text.');
    expect(html).not.toContain("title:");
    expect(html).not.toContain("A Report");
    expect(html).toContain("Body text.");
  });

  it("numbers paragraphs from the body, not the front matter", () => {
    const html = renderMarkdown('---\ntitle: "X"\n---\n\nFirst.\n\nSecond.');
    expect(html).toContain('id="p-1"');
    expect(html).toContain("First.");
  });
});

describe("splitFrontMatter", () => {
  it("parses metadata and strips it from the content", () => {
    const { data, content } = splitFrontMatter('---\ntitle: "A"\npages: 12\n---\nBody.');
    expect(data).toEqual({ title: "A", pages: 12 });
    expect(content.trim()).toBe("Body.");
  });

  it("passes documents without front matter through untouched", () => {
    const { data, content } = splitFrontMatter("Just body.");
    expect(data).toEqual({});
    expect(content).toBe("Just body.");
  });

  it("survives malformed front matter without throwing", () => {
    const { data, content } = splitFrontMatter("---\n: : :\n---\nBody.");
    expect(data).toEqual({});
    expect(content.trim()).toBe("Body.");
  });

  it("does not treat a horizontal rule as front matter", () => {
    const { content } = splitFrontMatter("Intro.\n\n---\n\nMore.");
    expect(content).toContain("Intro.");
    expect(content).toContain("More.");
  });
});

describe("slugify", () => {
  it("makes url-safe heading ids", () => {
    expect(slugify("Section 1: The Findings!")).toBe("section-1-the-findings");
  });
});

describe("permalink placement", () => {
  const between = (html: string, open: string, close: string) =>
    html.slice(html.indexOf(open), html.indexOf(close) + close.length);

  it("does not put a permalink inside a list item", () => {
    const html = renderMarkdown("- One item\n\n- Two item\n\nA real paragraph.");
    expect(between(html, "<ul>", "</ul>")).not.toContain("permalink");
  });

  it("still numbers top-level paragraphs around a list", () => {
    const html = renderMarkdown("First.\n\n- item\n\nSecond.");
    expect(html).toContain('id="p-1"');
    expect(html).toContain('id="p-2"');
    expect(html).not.toContain('id="p-3"');
  });

  it("does not put a permalink inside a block quote", () => {
    const html = renderMarkdown("> Quoted text.\n\nBody.");
    expect(between(html, "<blockquote>", "</blockquote>")).not.toContain("permalink");
  });
});
