/**
 * Decision 0019 (reportsthatmatter-te56): a very large /full (Leveson, 10.9 MB) is answered with a
 * head-only page to known link-preview user agents, and to nobody else; the landing page says how
 * big /full is.
 */
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { PREVIEW_AGENT_TOKENS, isPreviewAgent } from "../src/lib/preview-agents";

const AGENTS: Record<string, string> = {
  bluesky: "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  twitter: "Twitterbot/1.0",
  slack: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  mastodon: "http.rb/5.1.1 (Mastodon/4.3.0; +https://mastodon.social/)",
  linkedin: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  whatsapp: "WhatsApp/2.23.20.0",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  telegram: "TelegramBot (like TwitterBot)",
};
const LEVESON = "http://localhost/reports/uk-leveson-inquiry/full";
const get = (url: string, ua?: string) => app.request(url, ua ? { headers: { "user-agent": ua } } : {});

describe("preview agents", () => {
  it("recognises each, ignores browsers and search engines", () => {
    for (const ua of Object.values(AGENTS)) expect(isPreviewAgent(ua), ua).toBe(true);
    for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)", "", undefined]) {
      expect(isPreviewAgent(ua)).toBe(false);
    }
    expect(PREVIEW_AGENT_TOKENS.length).toBeGreaterThan(8);
  });
});

describe("Leveson /full", () => {
  it.each(Object.entries(AGENTS))("answers %s with a head-only page", async (_name, ua) => {
    const res = await get(LEVESON, ua);
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toMatch(/user-agent/i);
    const html = await res.text();
    expect(html.length).toBeLessThan(60_000);
    for (const tag of ["og:title", "og:description", "og:image", "og:url", "twitter:card"]) expect(html, tag).toContain(`"${tag}"`);
    expect(html).toContain('rel="canonical" href="https://reportsthatmatter.org/reports/uk-leveson-inquiry/full"');
    expect(html).toContain('href="/reports/uk-leveson-inquiry"');
    expect(html).not.toContain('id="report-body"');
  }, 30_000);

  it("gives a browser and a search engine the whole report, with Vary: User-Agent", async () => {
    for (const ua of ["Mozilla/5.0 (iPhone) Safari/604.1", "Mozilla/5.0 (compatible; Googlebot/2.1)", undefined]) {
      const res = await get(LEVESON, ua);
      expect(res.headers.get("vary")).toMatch(/user-agent/i);
      const html = await res.text();
      expect(html.length).toBeGreaterThan(5_000_000);
      expect(html).toContain('id="report-body"');
    }
  }, 60_000);

  it("a ?p= link previews the passage for a preview agent", async () => {
    const full = await (await get(LEVESON, "Mozilla/5.0 (X11) Firefox/120.0")).text();
    const id = full.match(/<p id="([a-z0-9-]+)"/)?.[1];
    const html = await (await get(`${LEVESON}?p=${id}`, AGENTS.bluesky)).text();
    expect(html.length).toBeLessThan(60_000);
    expect(html).toMatch(/property="og:description" content="“/);
    expect(html).toContain(`?p=${id}`);
  }, 60_000);

  it("the landing page says /full is big", async () => {
    const html = await (await get("http://localhost/reports/uk-leveson-inquiry")).text();
    expect(html).toMatch(/data-heavy-full>Read the whole report on one page \(about \d+ MB/);
  });
});

describe("other reports keep their /full for every agent", () => {
  it("Philip Morris (4.4 MB) is served whole to Bluesky", async () => {
    const html = await (await get("http://localhost/reports/us-v-philip-morris/full", AGENTS.bluesky)).text();
    expect(html).toContain('id="report-body"');
    const landing = await (await get("http://localhost/reports/us-v-philip-morris")).text();
    expect(landing).not.toContain("data-heavy-full");
    expect(landing).toContain("Read the whole report on one page →");
  }, 30_000);
});
