/**
 * /full is the whole report in one page: 10.9 MB of HTML for Leveson, and Bluesky's card fetcher
 * gives up on it (reportsthatmatter-te56). Whatever a crawler does with the body, the preview tags
 * must arrive in the first bytes, so a fetcher that reads only a prefix still gets a card. This holds
 * the head small and early for every report; whether to also answer crawlers with a head-only page
 * is docs/decisions/0017-full-page-for-link-previews.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { app } from "../src/index";

const ids = (parse(readFileSync(join(import.meta.dirname, "../reports/registry.yaml"), "utf8")).reports as Array<{ id: string }>).map((r) => r.id);
const PREFIX = 16 * 1024;

describe("/full puts its link-preview tags in the first 16 KB", () => {
  it.each(ids)("%s", async (id) => {
    const res = await app.request(`http://localhost/reports/${id}/full`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const prefix = html.slice(0, PREFIX);
    expect(prefix).toContain("</head>");
    for (const tag of ["og:title", "og:description", "og:image", "og:url", "twitter:card"]) {
      expect(prefix, tag).toContain(`"${tag}"`);
    }
  }, 30_000);
});
