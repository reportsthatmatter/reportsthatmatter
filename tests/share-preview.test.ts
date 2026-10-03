/**
 * What a shared link previews as on Bluesky, X, Facebook, LinkedIn, Reddit,
 * Slack and WhatsApp: the tags in its head (reportsthatmatter-f2e, decision 0014's
 * audit). They read og:title/description/image; Facebook and LinkedIn want
 * og:url and the image's size; X shows only the image, so for a quote the
 * image has to be the quote.
 */
import { describe, expect, it, vi } from "vitest";
import { quoteCardId, linkExact } from "../src/lib/card-key";
import { encodeAnchor, selectorFor } from "../assets/anchor.js";

vi.mock("../src/generated/cards", async () => {
  const { quoteCardId } = await import("../src/lib/card-key");
  return {
    CARDS: new Set([
      "demo/default",
      "demo/whole-para",
      `demo/${quoteCardId("whole-para", "the exact words")}`,
    ]),
  };
});

const { shareImage, sharedUrl } = await import("../src/templates/report");
const { renderHead } = await import("../src/templates/layout");
const meta = { id: "demo", title: "The Demo Report" };
const anchor = (exact: string) => encodeAnchor({ prefix: "a ", exact, suffix: " b" })!;

describe("quoteCardId", () => {
  it("is the same for the same words however a link spells them", () => {
    expect(quoteCardId("p", "the “exact”  words")).toBe(quoteCardId("p", 'the "exact" words'));
    expect(quoteCardId("p", "the words")).not.toBe(quoteCardId("q", "the words"));
  });

  it("keys a long passage by the abbreviated form a link carries", () => {
    const long = "word ".repeat(100).trim();
    const sent = decodeURIComponent(encodeAnchor(selectorFor(long, 0, long.length))!.split("|")[1]);
    expect(sent).not.toBe(long);
    expect(quoteCardId("p", sent)).toBe(quoteCardId("p", long));
    expect(linkExact(long)).toBe(sent);
  });
});

describe("shareImage", () => {
  it("gives a ?h= link the card for exactly its words", () => {
    expect(shareImage(meta, "whole-para", anchor("the exact words"))).toBe(
      `https://reportsthatmatter.org/assets/cards/demo/${quoteCardId("whole-para", "the exact words")}.png`
    );
  });

  it("never gives a ?h= link a paragraph card that may show other words", () => {
    expect(shareImage(meta, "whole-para", anchor("some other words"))).toBe(
      "https://reportsthatmatter.org/assets/cards/demo/default.png"
    );
  });

  it("gives a whole-paragraph link the paragraph's card", () => {
    expect(shareImage(meta, "whole-para")).toBe("https://reportsthatmatter.org/assets/cards/demo/whole-para.png");
  });
});

describe("renderHead for a shared quote", () => {
  const head = renderHead("T", {
    image: "https://reportsthatmatter.org/assets/cards/demo/default.png",
    imageAlt: "“the exact words” — The Demo Report",
    url: sharedUrl("/reports/demo/sec", "whole-para", "a|b|c"),
    canonical: "https://reportsthatmatter.org/reports/demo/sec",
  });

  it("previews as itself (og:url keeps ?p= and ?h=) but ranks as its page", () => {
    expect(head).toContain('<meta property="og:url" content="https://reportsthatmatter.org/reports/demo/sec?p=whole-para&amp;h=a%7Cb%7Cc" />');
    expect(head).toContain('<link rel="canonical" href="https://reportsthatmatter.org/reports/demo/sec" />');
  });

  it("states the site, the card's size and its words", () => {
    expect(head).toContain('<meta property="og:site_name" content="Reports that Matter" />');
    expect(head).toContain('<meta property="og:image:width" content="2400" />');
    expect(head).toContain('<meta property="og:image:height" content="1260" />');
    expect(head).toContain('<meta property="og:image:alt" content="“the exact words” — The Demo Report" />');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});
