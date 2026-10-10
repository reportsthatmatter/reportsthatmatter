/**
 * Defects the 2026-10-09 launch audit found by eye and axe, held as tests
 * (docs/research/2026-10-09-launch-audit.md): contrast of the muted text colour, labelled landmarks,
 * heading order on /about, and a search form that cannot push a phone's page sideways.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";

const css = readFileSync(join(import.meta.dirname, "../assets/styles.css"), "utf8");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))![1];

describe("launch audit", () => {
  it("the muted text colour meets WCAG AA on the canvas and the surface (axe color-contrast)", () => {
    expect(contrast(token("muted"), token("canvas"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("muted"), token("surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the header and footer navigation are distinct, labelled landmarks", async () => {
    const html = await (await app.request("http://localhost/")).text();
    const navs = [...html.matchAll(/<nav\b[^>]*>/g)].map((m) => m[0]);
    expect(navs).toHaveLength(2);
    const labels = navs.map((n) => n.match(/aria-label="([^"]+)"/)?.[1]);
    expect(labels.every(Boolean)).toBe(true);
    expect(new Set(labels).size).toBe(2);
  });

  it("/about has no heading level skipped", async () => {
    const html = await (await app.request("http://localhost/about")).text();
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1]).toBeLessThanOrEqual(1);
    });
  });

  it("the search form's select is bounded by the screen", () => {
    const rule = css.match(/\.search-form select\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/max-width:\s*100%/);
  });
});
