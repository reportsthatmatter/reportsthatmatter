import { describe, expect, it } from "vitest";
import { numericPage, pageOf } from "../src/lib/editorial";
import { formatHooked, formatPost } from "../src/lib/posts";

// reportsthatmatter-6j6q: the Stern Review's Executive Summary is folioed i-xxvii throughout, so every paragraph's
// data-page is roman; pageOf returned null for all of them, which left landing-page excerpts unlabelled and kept
// every highlight out of the posting queue ("no page number on that paragraph").
describe("page labels (6j6q)", () => {
  const html = [
    `<p id="arabic-para" data-page="12">Text.</p>`,
    `<p id="roman-para" data-page="xiv">Text.</p>`,
    `<p id="volume-para" data-page="12#2">Text.</p>`,
    `<p id="no-page">Text.</p>`,
  ].join("\n");

  it("reads an arabic page as a number and a roman one as its label", () => {
    expect(pageOf(html, "arabic-para")).toBe(12);
    expect(pageOf(html, "roman-para")).toBe("xiv");
  });

  it("gives null for a volume-qualified page or none", () => {
    expect(pageOf(html, "volume-para")).toBeNull();
    expect(pageOf(html, "no-page")).toBeNull();
  });

  it("keeps an INTEGER-only store numeric", () => {
    expect(numericPage(12)).toBe(12);
    expect(numericPage("xiv")).toBeNull();
    expect(numericPage(null)).toBeNull();
  });

  it("prints a roman page in a post's source line", () => {
    expect(formatPost("Delay would be costly and dangerous.", "Stern Review", "xxvii")).toMatch(/— Stern Review, p\. xxvii$/);
    expect(formatHooked("Twenty years ago:", "Stern Review", "i")).toMatch(/— Stern Review, p\. i$/);
  });
});
