/* Add an editor's highlight from a share link (decision 0013).
 *
 *   pnpm highlight add '<share link>' [--card]
 *
 * On the site, select the words and choose Copy link in the share popover.
 * Paste that link here: the highlight is appended to editorial/<id>.yaml under
 * `highlights:` with the verbatim words, read off the pre-rendered paragraph
 * (run `pnpm prerender` first). `--card` also marks it `card: true`, which puts
 * it in the posting queue (`pnpm posts`).
 *
 * Then: `pnpm editorial` (checks it), commit, and the integrator runs
 * `pnpm seed-highlights --remote` after the deploy, which writes only the new
 * highlight (one row).
 */
import "./lib/help.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseShareLink, resolveShareLink, addHighlight } from "../src/lib/highlight-add.ts";

const root = join(import.meta.dirname, "..");
const [command, link] = process.argv.slice(2);
if (command !== "add" || !link) {
  console.error("usage: pnpm highlight add '<share link>' [--card]");
  process.exit(1);
}

const parsed = parseShareLink(link);
if (typeof parsed === "string") {
  console.error(`✗ ${parsed}`);
  process.exit(1);
}

const generated = join(root, "assets/generated/reports", parsed.report);
const editorialPath = join(root, "editorial", `${parsed.report}.yaml`);
if (!existsSync(join(generated, "full-body.html"))) {
  console.error(`✗ no pre-rendered text for ${parsed.report}: run pnpm prerender`);
  process.exit(1);
}
if (!existsSync(editorialPath)) {
  console.error(`✗ no editorial/${parsed.report}.yaml: a report needs an editorial file before it can carry highlights`);
  process.exit(1);
}

const resolved = resolveShareLink(
  parsed,
  readFileSync(join(generated, "full-body.html"), "utf8"),
  JSON.parse(readFileSync(join(generated, "meta.json"), "utf8"))
);
if (typeof resolved === "string") {
  console.error(`✗ ${resolved}`);
  process.exit(1);
}

const { text, added } = addHighlight(readFileSync(editorialPath, "utf8"), {
  ...resolved,
  card: process.argv.includes("--card"),
});
if (!added) {
  console.log(`= already a highlight in editorial/${parsed.report}.yaml`);
  process.exit(0);
}
writeFileSync(editorialPath, text);
console.log(`+ editorial/${parsed.report}.yaml: ${resolved.paragraph}\n  “${resolved.quote}”`);
console.log("\nNext: pnpm editorial, commit; after deploy the integrator runs pnpm seed-highlights --remote.");
