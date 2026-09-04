/* Pre-renders reports to static assets (#115, architecture doc #107).
 *
 *   pnpm prerender
 *
 * Rendering markdown to HTML and splitting it into sections costs 15-64ms
 * per report, measured — more than a Workers Free-plan request is allowed to
 * spend in total. Doing it here, once, rather than per request (even once
 * per isolate, which is what `src/lib/prepared.ts`'s holding measure did)
 * is the actual fix. The Worker keeps doing per-request work only where it
 * has to: the OG-rewrite for a `?p=`/`?h=` link, and the D1-backed "most
 * marked passages" block, both cheap and both covered in `src/index.ts`.
 *
 * Output layout, per report:
 *   meta.json             — words, section list (no html), paragraph→section
 *                           lookup. Small; loaded on every request.
 *   fragments/<slug>.html — one section's *body*, with no layout around it.
 *   full-body.html        — the whole report's body, likewise layout-free.
 *
 * `full-body.html` duplicates the fragments, deliberately: /full for
 * us-v-philip-morris would otherwise be 129 reads per request, and 129 R2
 * GETs once content moves out (§3). One read, and storage is the cheap side
 * of that trade. It sits outside fragments/ because slugs may contain
 * underscores, so no name inside that directory is safe from collision.
 *
 * Fragments, not finished pages, because the layout belongs to the app and
 * the content belongs to the report (content-publishing plan §2). While
 * `full.html` and `sections/*.html` carried the site chrome, one CSS-class
 * change in src/templates/ dirtied all 601 artifacts, and a report could not
 * be republished without an app deploy. The Worker assembles a page from a
 * fragment per request — a string concatenation, against a request that
 * `run_worker_first = true` never let skip the Worker anyway.
 *
 * There is deliberately no `body.json` holding every section's html at once.
 * It was 55.5 MB across ten reports (19.0 MB for Leveson alone, against a
 * 25 MiB per-asset ceiling), and a `?p=` link parsed all of it to quote one
 * paragraph. `meta.paragraphToSection` names the section holding any
 * paragraph, so the section page answers the same question — see
 * docs/plans/2026-09-04-content-publishing.md §8 step 1.
 *
 * Plus sitemap-urls.json, the section-level entries /sitemap.xml no longer
 * has to render all four reports to produce.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { renderMarkdown } from "../src/lib/markdown.ts";
import { splitSections, paragraphIndex } from "../src/lib/sections.ts";

const root = join(import.meta.dirname, "..");
const outDir = join(root, "assets/generated");

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function wordCount(html) {
  return html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
}

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));

// A report dropped from the registry should not leave a stale artifact
// behind that nothing points at any more but a deploy still uploads.
rmSync(join(outDir, "reports"), { recursive: true, force: true });

const sitemapEntries = [];

for (const report of registry.reports) {
  const markdown = readFileSync(join(root, report.source_path), "utf8");
  const html = renderMarkdown(markdown);
  const sections = splitSections(html);

  const meta = {
    words: wordCount(html),
    sections: sections.map(({ html: _html, ...rest }) => rest),
    paragraphToSection: paragraphIndex(sections),
  };

  writeJSON(join(outDir, `reports/${report.id}/meta.json`), meta);
  writeText(join(outDir, `reports/${report.id}/full-body.html`), html);

  for (const section of sections) {
    writeText(join(outDir, `reports/${report.id}/fragments/${section.slug}.html`), section.html);
    sitemapEntries.push({ report: report.id, slug: section.slug });
  }

  console.log(
    `  ✓ ${report.id} — ${sections.length} section(s), ${meta.words.toLocaleString()} words`
  );
}

writeJSON(join(outDir, "sitemap-urls.json"), sitemapEntries);

console.log(`\nPre-rendered ${registry.reports.length} report(s) to assets/generated/`);
