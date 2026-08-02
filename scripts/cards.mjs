/* Renders share cards to PNG.
 *
 *   pnpm cards                        # every quote in docs/share-quotes.yaml
 *   pnpm cards <report-id> <para-id>  # one, ad hoc
 *
 * Build-time rather than on request: feeds will not render SVG, and a runtime
 * rasteriser (satori + resvg wasm) would cost more bundle than the entire site
 * currently occupies. Cards are cheap to regenerate and rarely change.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { renderCard } from "../src/templates/card.ts";
import { renderMarkdown } from "../src/lib/markdown.ts";
import { extractParagraph } from "../src/templates/report.ts";

const root = join(import.meta.dirname, "..");

// setContent() renders from about:blank, so the mark has to travel with the HTML.
const logoDataUri = `data:image/png;base64,${readFileSync(
  join(root, "assets/brand/logo-64.png")
).toString("base64")}`;
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));

/** Cache: rendering a 2 MB report to HTML is slow, and one report holds many quotes. */
const rendered = new Map();
function reportHtml(report) {
  if (!rendered.has(report.id)) {
    const markdown = readFileSync(join(root, report.source_path), "utf8");
    rendered.set(report.id, renderMarkdown(markdown));
  }
  return rendered.get(report.id);
}

/**
 * Finds the paragraph a curated card points at.
 *
 * Paragraph ids are derived from the opening words, so improving the ingestion
 * can move one — a footnote block that stops leaking into the body shifts where
 * the paragraph begins. `match:` is the guard: a distinctive phrase from the
 * passage, used to re-find it and report the corrected id rather than failing.
 */
function quoteFor(reportId, paragraphId, match) {
  const report = registry.reports.find((entry) => entry.id === reportId);
  if (!report) throw new Error(`No such report: ${reportId}`);

  const html = reportHtml(report);
  let id = paragraphId;
  let quote = extractParagraph(html, id);

  if (!quote && match) {
    const at = html.indexOf(match);
    if (at !== -1) {
      const open = html.lastIndexOf('<p id="', at);
      id = html.slice(open + 7, html.indexOf('"', open + 7));
      quote = extractParagraph(html, id);
      if (quote) {
        console.warn(
          `  ! ${reportId}/${paragraphId} moved to ${id} — update docs/share-quotes.yaml`
        );
      }
    }
  }

  if (!quote) {
    throw new Error(
      `No paragraph "${paragraphId}" in ${reportId}` +
        (match ? ` and match text not found` : ` (add a match: phrase to recover)`)
    );
  }

  const page = html.match(new RegExp(`<p id="${id}"[^>]*data-page="(\\d+)"`))?.[1];

  return { quote, page, report, id };
}

/** A card has one screenful; trim to a sentence boundary rather than mid-word. */
function fitToCard(text, limit = 420) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentence > limit * 0.5) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const targets = [];
const [argReport, argParagraph] = process.argv.slice(2);

if (argReport && argParagraph) {
  targets.push({ report: argReport, paragraph: argParagraph });
} else {
  const quotesPath = join(root, "docs/share-quotes.yaml");
  if (!existsSync(quotesPath)) {
    console.error("docs/share-quotes.yaml not found, and no arguments given.");
    process.exit(1);
  }
  const quotes = parse(readFileSync(quotesPath, "utf8"));
  for (const entry of quotes.quotes ?? []) {
    targets.push({
      report: entry.report,
      paragraph: entry.paragraph,
      note: entry.note,
      quote: entry.quote,
      match: entry.match,
    });
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});

const generated = [];

for (const target of targets) {
  let resolved;
  try {
    resolved = quoteFor(target.report, target.paragraph, target.match);
  } catch (error) {
    console.error(`  ✗ ${target.report}/${target.paragraph} — ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  // An explicit quote wins. A card is curated — the notable sentence is often
  // in the middle of its paragraph, and trimming from the start would miss it.
  const html = renderCard({
    quote: target.quote ? target.quote.trim() : fitToCard(resolved.quote),
    reportTitle: resolved.report.title,
    page: resolved.page,
    logoDataUri,
  });

  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  const out = join(root, "assets/cards", target.report, `${resolved.id}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  generated.push(`${target.report}/${resolved.id}`);
  console.log(`  ✓ ${target.report}/${resolved.id}${target.note ? ` — ${target.note}` : ""}`);
}

await browser.close();

// A typed manifest so the Worker only advertises a card that exists — an
// og:image pointing at a 404 is worse than none at all.
const manifest = `/* Generated by scripts/cards.mjs — do not edit. */
export const CARDS: ReadonlySet<string> = new Set(${JSON.stringify(generated.sort(), null, 2)});
`;
writeFileSync(join(root, "src/generated/cards.ts"), manifest);
console.log(`\n${generated.length} card(s); manifest written to src/generated/cards.ts`);
