import { describe, expect, it } from "vitest";
import { extractPassages } from "@rtm/ingest";

describe("extractPassages", () => {
  // scripts/index-search.mjs reads whole pre-rendered *pages*, not bare
  // section html, so the layout's own markup must contribute no passages.
  it("finds nothing in the site chrome around a report", async () => {
    const { renderLayout } = await import("../src/templates/layout");
    const chromeOnly = renderLayout("A title", "<main><article></article></main>", {
      scripts: ["/assets/share.js"],
    });

    expect(extractPassages(chromeOnly)).toEqual([]);
  });


  it("pulls the plain text out of every paragraph", () => {
    const html =
      '<p id="alpha">Alpha text here.<a class="permalink" href="#alpha">¶</a></p>' +
      '<p id="beta">Beta text here.<a class="permalink" href="#beta">¶</a></p>';

    expect(extractPassages(html)).toEqual([
      { paragraphId: "alpha", text: "Alpha text here.", page: null },
      { paragraphId: "beta", text: "Beta text here.", page: null },
    ]);
  });

  it("carries the printed page from the paragraph's data-page attribute", () => {
    const html = '<p id="x" data-page="46">Body text on that page.</p>';
    expect(extractPassages(html)).toEqual([{ paragraphId: "x", text: "Body text on that page.", page: "46" }]);
  });

  it("includes top-level lists, which are citable units too (#12)", () => {
    const html = '<ul id="findings"><li>First finding.</li><li>Second finding.</li></ul>';
    expect(extractPassages(html)).toEqual([
      { paragraphId: "findings", text: "First finding.Second finding.", page: null },
    ]);
  });

  it("strips the sidenote apparatus, not just its tags", () => {
    const html =
      '<p id="x">He replied' +
      '<label class="sidenote-toggle" for="sn-1-1"><sup>1</sup></label>' +
      '<input class="sidenote-checkbox" id="sn-1-1" type="checkbox" />' +
      '<span class="sidenote"><sup>1</sup> Interview transcript at 12.</span>' +
      " so what?</p>";
    expect(extractPassages(html)).toEqual([{ paragraphId: "x", text: "He replied so what?", page: null }]);
  });

  it("skips a paragraph left empty once markup is stripped", () => {
    const html = '<p id="empty"><a class="permalink" href="#empty">¶</a></p>';
    expect(extractPassages(html)).toEqual([]);
  });

  it("decodes entities", () => {
    const html = "<p id=\"x\">Moody&#39;s &amp; Standard &amp; Poor&#39;s</p>";
    expect(extractPassages(html)).toEqual([
      { paragraphId: "x", text: "Moody's & Standard & Poor's", page: null },
    ]);
  });
});
