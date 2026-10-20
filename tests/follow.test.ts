/**
 * The quiet "Follow on Bluesky" footer line (reportsthatmatter-y2t.8): on the pages launch
 * traffic lands on (/about, /press, a report's landing page), and nowhere that people read.
 */
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { BLUESKY_PROFILE_URL } from "../src/templates/site";

const get = async (path: string) => (await app.request(`http://localhost${path}`)).text();
const followLinks = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>Follow on Bluesky<\/a>/g)].map((m) => m[1]);

describe("follow on Bluesky", () => {
  it("links the project's Bluesky profile on /about, /press and a report landing page", async () => {
    for (const path of ["/about", "/press", "/reports/jack-smith-vol1"]) {
      expect(followLinks(await get(path)), path).toEqual([BLUESKY_PROFILE_URL]);
    }
  });

  it("is a plain link: no third-party script, and the profile is a bsky.app URL", async () => {
    expect(BLUESKY_PROFILE_URL).toMatch(/^https:\/\/bsky\.app\/profile\/did:plc:[a-z0-9]+$/);
    // The one third-party script allowed is our self-hosted, cookie-free Umami analytics.
    expect(await get("/about")).not.toMatch(/<script[^>]+src="https?:\/\/(?!reportsthatmatter\.org|umami\.lifeitself\.org\/script\.js)/);
  });

  it("is left off the home page and the reading pages", async () => {
    for (const path of ["/", "/reports/jack-smith-vol1/full"]) {
      expect(followLinks(await get(path)), path).toEqual([]);
    }
  });
});
