/**
 * The launch-gating site fixes (decision hbnj): a source line wherever a reader can land on one
 * paragraph, and a contact and removal route (decision 63cd) linked from every page; with the AI
 * note (0ino) and the reworded promise (pbkk) on /about.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { CONTACT_PATH, REMOVAL_ISSUE_URL, TEXT_DEFECT_ISSUE_URL } from "../src/templates/site";

const get = async (path: string) => (await app.request(`http://localhost${path}`)).text();
const registry = readFileSync(join(import.meta.dirname, "../reports/registry.yaml"), "utf8");
const sourceUrl = registry.match(/id: jack-smith-vol1[\s\S]*?source_url: "([^"]+)"/)![1];

async function firstSection(id: string): Promise<string> {
  const meta = await import(`../assets/generated/reports/${id}/meta.json`);
  return (meta.default ?? meta).sections[0].slug;
}

describe("source line on the paragraph view", () => {
  it("a section page names the official document and the edition notes in its header", async () => {
    const html = await get(`/reports/jack-smith-vol1/${await firstSection("jack-smith-vol1")}`);
    const header = html.slice(html.indexOf('<header class="report-header'), html.indexOf("</header>", html.indexOf('<header class="report-header')));
    expect(header).toContain(`href="${sourceUrl}"`);
    expect(header).toContain("Original document ↗");
  });

  it("the report body carries the source for the landing panel, on /full and on a section", async () => {
    for (const path of ["/reports/jack-smith-vol1/full", `/reports/jack-smith-vol1/${await firstSection("jack-smith-vol1")}`]) {
      const html = await get(path);
      expect(html, path).toContain(`data-source-url="${sourceUrl}"`);
      expect(html, path).toMatch(/data-edition-url="(\/reports\/jack-smith-vol1\/processing)?"/);
    }
  });

  it("the edition link points at processing notes only where a report has them", async () => {
    const withNotes = existsSync(join(import.meta.dirname, "../assets/generated/reports/jack-smith-vol1/processing.html"));
    const html = await get("/reports/jack-smith-vol1/full");
    expect(html.includes('data-edition-url="/reports/jack-smith-vol1/processing"')).toBe(withNotes);
  });

  it("the landing panel builds the source line from those attributes, with the contact route", () => {
    const js = readFileSync(join(import.meta.dirname, "../assets/passage-panel.js"), "utf8");
    expect(js).toContain("dataset.sourceUrl");
    expect(js).toContain(`const CONTACT_PATH = "${CONTACT_PATH}"`);
  });
});

describe("contact and removal route", () => {
  it("every page's footer links the contact section", async () => {
    for (const path of ["/", "/about", "/reports/jack-smith-vol1/full"]) {
      expect(await get(path), path).toMatch(new RegExp(`<nav aria-label="Footer">[\\s\\S]*href="${CONTACT_PATH}"[\\s\\S]*</nav>`));
    }
  });

  it("/about#contact offers removal and error reports through templates that exist", async () => {
    const html = await get("/about");
    expect(html).toContain('id="contact"');
    expect(html).toContain(REMOVAL_ISSUE_URL);
    expect(html).toContain(TEXT_DEFECT_ISSUE_URL);
    expect(html).toContain("within a day");
    for (const url of [REMOVAL_ISSUE_URL, TEXT_DEFECT_ISSUE_URL]) {
      const template = url.match(/template=([\w.-]+)$/)![1];
      expect(existsSync(join(import.meta.dirname, "../.github/ISSUE_TEMPLATE", template)), template).toBe(true);
    }
  });
});

describe("/about copy (0ino, pbkk)", () => {
  it("says what AI did and did not touch", async () => {
    const html = await get("/about");
    expect(html).toContain('id="ai"');
    expect(html).toContain("no language model wrote, summarised or");
    expect(html).toContain("drafted with AI assistance");
  });

  it("no longer promises 'No commentary' beside our introductions", async () => {
    const html = await get("/about");
    expect(html).not.toContain("No commentary");
    expect(html).toContain("Our introductions and highlights are labelled as ours.");
  });
});
