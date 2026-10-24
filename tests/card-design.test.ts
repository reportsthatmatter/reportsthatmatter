/**
 * The split share card (share-cards-1024): plate left, quote right, rendered at 1200x630 and small enough to travel.
 * A card over ~300 KB is dropped by WhatsApp; Bluesky refuses a link-card thumb over 1,000,000 bytes, which would
 * fail the scheduled poster on that day's post.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cardSourceName, quoteSize, renderCard, renderDefaultCard } from "../src/templates/card";

const root = join(import.meta.dirname, "..");

describe("card text", () => {
  it("never grows the type as the quote gets longer, and keeps short quotes large for feeds", () => {
    let last = Infinity;
    for (let n = 10; n < 450; n += 5) {
      expect(quoteSize(n)).toBeLessThanOrEqual(last);
      last = quoteSize(n);
    }
    expect(quoteSize(60)).toBeGreaterThanOrEqual(60);
    expect(quoteSize(170)).toBeGreaterThanOrEqual(48);
  });

  it("prints a report's short name without its parenthetical", () => {
    expect(cardSourceName("Challenger Accident Report (House Science Committee)")).toBe("Challenger Accident Report");
    expect(cardSourceName("Leveson Report")).toBe("Leveson Report");
    expect(cardSourceName("(Odd)")).toBe("(Odd)");
  });

  it("puts page and source in the footer of a quote card, the domain opposite the wordmark", () => {
    const html = renderCard({ quote: "Words.", reportTitle: "Long Title", sourceName: "Short (Detail)", page: "7" });
    expect(html).toContain("<footer>p. 7 · Short</footer>");
    expect(html).toContain("reportsthatmatter.org");
    expect(html).toContain("“Words.”");
  });

  it("gives the default card the same frame, with the title where the quote goes", () => {
    const html = renderDefaultCard({ title: "A <Report>", subtitle: "Authors · 2020", footer: "Short", markDataUri: "data:x" });
    expect(html).toContain("<h1");
    expect(html).toContain("A &lt;Report&gt;");
    expect(html).toContain('<div class="imprint"><img src="data:x"');
    expect(html).toContain("<footer>Short</footer>");
  });
});

describe("committed cards", () => {
  const files: string[] = [];
  for (const dir of readdirSync(join(root, "assets/cards"), { withFileTypes: true })) {
    if (dir.isDirectory()) {
      for (const f of readdirSync(join(root, "assets/cards", dir.name))) if (f.endsWith(".png")) files.push(join(dir.name, f));
    } else if (dir.name.endsWith(".png")) files.push(dir.name);
  }

  it("are 1200x630, as the page head says", () => {
    for (const f of files) {
      const png = readFileSync(join(root, "assets/cards", f));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], f).toEqual([1200, 630]);
    }
  });

  it("are under 300 KB, so WhatsApp shows them and Bluesky accepts them as a link-card thumb", () => {
    const over = files.filter((f) => statSync(join(root, "assets/cards", f)).size > 300 * 1024);
    expect(over).toEqual([]);
  });
});
