/**
 * Every page's meta description and og:description fits a link card (reportsthatmatter-ntjx):
 * at most 200 characters, and the two tags say the same thing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { app } from "../src/index";
import { capDescription, firstSentence, quoteDescription } from "../src/templates/report";

const ids = (parse(readFileSync(join(import.meta.dirname, "../reports/registry.yaml"), "utf8")).reports as Array<{ id: string }>).map((r) => r.id);

function descriptions(html: string) {
  const grab = (re: RegExp) => html.match(re)?.[1];
  return {
    meta: grab(/<meta name="description" content="([^"]*)"/),
    og: grab(/<meta property="og:description" content="([^"]*)"/),
  };
}

describe("description helpers", () => {
  it("firstSentence takes the first sentence, or cuts a long one at a word", () => {
    expect(firstSentence("One short sentence. And a second one that is dropped.")).toBe("One short sentence.");
    const long = firstSentence(`${"word ".repeat(80)}end. Next.`);
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith("…")).toBe(true);
  });

  it("quoteDescription keeps the title suffix and fits, even for a long title", () => {
    const title = "A Very Long Official Report Title ".repeat(4).trim();
    for (const t of ["Short title", title]) {
      const d = quoteDescription("quoted words ".repeat(100), t);
      expect(d.length).toBeLessThanOrEqual(200);
    }
    expect(quoteDescription("quoted words ".repeat(100), "Short title").endsWith("” — Short title")).toBe(true);
    expect(capDescription("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe.each(ids)("descriptions of %s", (id) => {
  const check = async (path: string) => {
    const res = await app.request(`http://localhost${path}`);
    expect(res.status, path).toBe(200);
    const { meta, og } = descriptions(await res.text());
    expect(og, path).toBeTruthy();
    expect(og, `${path}: og:description equals meta description`).toBe(meta);
    expect(og!.length, path).toBeLessThanOrEqual(200);
    return res;
  };

  it("landing, /full, a section, and a quoted passage", async () => {
    await check(`/reports/${id}`);
    const full = await check(`/reports/${id}/full`);
    void full;
    const meta = JSON.parse(readFileSync(join(import.meta.dirname, `../assets/generated/reports/${id}/meta.json`), "utf8"));
    const slug = meta.sections[1].slug;
    const section = await app.request(`http://localhost/reports/${id}/${slug}`);
    const html = await section.text();
    expect(descriptions(html).og!.length).toBeLessThanOrEqual(200);
    const paragraph = html.match(/<p id="([a-z0-9-]+)"/)?.[1];
    await check(`/reports/${id}/${slug}?p=${paragraph}`);
  }, 60_000);
});
