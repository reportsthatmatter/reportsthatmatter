/* Lists a report's paragraphs as the editorial check sees them, for writing
 * an introduction (docs/report-introductions.md).
 *
 *   pnpm paragraphs <report-id> [search terms]
 *
 * One line per paragraph: section, printed page, id, then the text with its
 * sidenotes removed — exactly the text `pnpm editorial` matches quotations
 * against, so a quote copied from here passes the check. Headings are shown
 * as section markers. With search terms, only paragraphs containing all of
 * them (case-insensitive) are printed. Run `pnpm prerender` first.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractParagraph } from "../src/templates/report.ts";

const [id, ...terms] = process.argv.slice(2);
if (!id) {
  console.error("usage: pnpm paragraphs <report-id> [search terms]");
  process.exit(1);
}

const dir = join(import.meta.dirname, "..", "assets/generated/reports", id);
if (!existsSync(join(dir, "full-body.html"))) {
  console.error(`No pre-rendered report "${id}" — run pnpm prerender first`);
  process.exit(1);
}

const html = readFileSync(join(dir, "full-body.html"), "utf8");
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
const wanted = terms.map((t) => t.toLowerCase());

let section = null;
for (const match of html.matchAll(/<p id="([^"]+)"(?: data-page="(\d+)")?/g)) {
  const [, pid, page] = match;
  const text = extractParagraph(html, pid);
  if (!text) continue;
  if (wanted.length && !wanted.every((t) => text.toLowerCase().includes(t))) continue;
  const slug = meta.paragraphToSection[pid];
  if (!wanted.length && slug !== section) {
    const s = meta.sections.find((x) => x.slug === slug);
    console.log(`\n## ${s ? s.title : slug}  [section: ${slug}${s?.page ? `, p. ${s.page}` : ""}]`);
    section = slug;
  }
  console.log(`${wanted.length ? `[${slug}] ` : ""}p.${page ?? "?"} ${pid}: ${text}`);
}
