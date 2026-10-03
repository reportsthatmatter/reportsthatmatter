/**
 * The posting queue's links, served the way a link-preview crawler sees them:
 * follow the redirect, read the head. Each unposted item that posts with a
 * quote card must preview with that same card, so a reader who shares the
 * post's link gets the quote, not the report's title card (f2e).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { app } from "../src/index";

const queue = parse(readFileSync(join(import.meta.dirname, "../marketing/queue.yaml"), "utf8")).items as Array<{
  id: string; link: string; card: string; posted_url: string | null;
}>;
const quoteCarded = queue.filter((item) => !item.posted_url && /\/q-[0-9a-f]{8}\.png$/.test(item.card));

async function crawl(link: string): Promise<string> {
  let url = link.replace("https://reportsthatmatter.org", "http://localhost");
  for (let hop = 0; hop < 3; hop++) {
    const res = await app.request(url);
    if (res.status >= 300 && res.status < 400) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    expect(res.status).toBe(200);
    return res.text();
  }
  throw new Error(`too many redirects for ${link}`);
}

describe("queue links preview with their own quote card", () => {
  it("has quote-carded items to check", () => {
    expect(quoteCarded.length).toBeGreaterThan(40);
  });

  it.each(quoteCarded.map((item) => [item.id, item] as const))("%s", async (_id, item) => {
    const html = await crawl(item.link);
    expect(html).toContain(`<meta property="og:image" content="https://reportsthatmatter.org/${item.card}" />`);
    expect(html).toMatch(/<meta property="og:url" content="https:\/\/reportsthatmatter\.org\/reports\/[^"]+\?p=[^"]+&amp;h=/);
    expect(html).toContain('<meta property="og:image:alt" content="“');
  });
});
