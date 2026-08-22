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
 *   meta.json          — words, section list (no html), paragraph→section
 *                         lookup. Small; loaded on every request.
 *   body.json           — { html, sections } with full html. Large; loaded
 *                         only for a `?p=`/`?h=` link or a marked passage.
 *   full.html            — the complete static page for /reports/<id>/full.
 *   sections/<slug>.html — the complete static page for /reports/<id>/<slug>.
 *
 * Plus sitemap-urls.json, the section-level entries /sitemap.xml no longer
 * has to render all four reports to produce.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { renderMarkdown } from "../src/lib/markdown.ts";
import { splitSections, paragraphIndex } from "../src/lib/sections.ts";
import { renderReport } from "../src/templates/report.ts";
import { renderSection } from "../src/templates/section.ts";

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
  writeJSON(join(outDir, `reports/${report.id}/body.json`), { html, sections });
  writeText(join(outDir, `reports/${report.id}/full.html`), renderReport(report, html));

  for (let i = 0; i < sections.length; i++) {
    writeText(
      join(outDir, `reports/${report.id}/sections/${sections[i].slug}.html`),
      renderSection(report, sections, i)
    );
    sitemapEntries.push({ report: report.id, slug: sections[i].slug });
  }

  console.log(
    `  ✓ ${report.id} — ${sections.length} section(s), ${meta.words.toLocaleString()} words`
  );
}

writeJSON(join(outDir, "sitemap-urls.json"), sitemapEntries);

console.log(`\nPre-rendered ${registry.reports.length} report(s) to assets/generated/`);
