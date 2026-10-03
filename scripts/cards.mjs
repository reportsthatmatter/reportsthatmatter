/* Renders share cards to PNG.
 *
 *   pnpm cards                        # every quote in docs/share-quotes.yaml,
 *                                      # plus the site card and one default
 *                                      # card per report (reportsthatmatter-obw)
 *   pnpm cards <report-id> <para-id>  # one curated quote, ad hoc — skips the
 *                                      # default cards, for a fast iteration loop
 *   pnpm cards --highlights [<id>…]   # only the quote cards for the editor's
 *                                      # highlights (all reports, or these)
 *   --all-highlights                  # every highlight, not only card: true
 *
 * Besides docs/share-quotes.yaml, every approved editorial highlight marked
 * `card: true` (build/editorial-highlights.json, from `pnpm editorial`) gets a
 * quote card, quantised to 64 colours (about 170 KB: WhatsApp drops images
 * much over 300 KB, and they are committed),
 * assets/cards/<report>/q-<hash>.png, named by `quoteCardId` so a shared ?h=
 * link to those words previews with a card showing exactly them
 * (reportsthatmatter-f2e). Every card's quote must be verbatim in its
 * paragraph: a card sets its words in quotation marks.
 *
 * Build-time rather than on request: feeds will not render SVG, and a runtime
 * rasteriser (satori + resvg wasm) would cost more bundle than the entire site
 * currently occupies. Cards are cheap to regenerate and rarely change.
 */
import "./lib/help.mjs";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { renderCard, renderDefaultCard } from "../src/templates/card.ts";
import { SITE_HEADLINE, SITE_STANDFIRST } from "../src/templates/site.ts";
import { renderMarkdown } from "@rtm/ingest";
import { extractParagraph } from "../src/templates/report.ts";
import { findText } from "../assets/anchor.js";
import { quoteCardId } from "../src/lib/card-key.ts";
import { statSync, readdirSync } from "node:fs";
import UPNG from "upng-js";

/** A screenshot as a 64-colour PNG: a card is grey ink, a grey plate and one off-white, so nothing visible is lost. */
function quantise(png) {
  const image = UPNG.decode(png);
  return Buffer.from(UPNG.encode(UPNG.toRGBA8(image), image.width, image.height, 64));
}

const root = join(import.meta.dirname, "..");

// setContent() renders from about:blank, so images have to travel with the HTML.
const dataUri = (path, type) => `data:${type};base64,${readFileSync(path).toString("base64")}`;

/** A report's plate (#99), or nothing for a report without one. */
function markFor(reportId) {
  const path = join(root, "assets/marks", `${reportId}.webp`);
  return existsSync(path) ? dataUri(path, "image/webp") : undefined;
}


/**
 * Fails a card whose content runs past the bottom edge. A plate in the top
 * row costs up to 190px of height, and a long quote or standfirst under it
 * would otherwise be clipped in the PNG with nothing to say so — the site
 * card did exactly that when it briefly carried the brand mark there.
 */
async function assertFits(label) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > 630) {
    console.error(`  ✗ ${label} — content is ${height}px tall, the card is 630px`);
    process.exitCode = 1;
  }
}
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
const highlightsOnly = process.argv.includes("--highlights");
const [argReport, argParagraph] = highlightsOnly ? [] : process.argv.slice(2);
const highlightReports = highlightsOnly ? process.argv.slice(2).filter((arg) => !arg.startsWith("--")) : [];

if (highlightsOnly) {
  // Quote cards only; the manifest below keeps every other card already on disk.
} else if (argReport && argParagraph) {
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

  // A card sets its words in quotation marks, so they must be the report's
  // words: two Jack Smith cards once showed paraphrases (reportsthatmatter-f2e).
  if (target.quote && !findText(resolved.quote, target.quote.trim())) {
    console.error(`  ✗ ${target.report}/${resolved.id} — quote: is not verbatim in the paragraph`);
    process.exitCode = 1;
    continue;
  }

  // An explicit quote wins. A card is curated — the notable sentence is often
  // in the middle of its paragraph, and trimming from the start would miss it.
  const html = renderCard({
    quote: target.quote ? target.quote.trim() : fitToCard(resolved.quote),
    reportTitle: resolved.report.title,
    page: resolved.page,
    markDataUri: markFor(target.report),
  });

  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  await assertFits(`${target.report}/${resolved.id}`);

  const out = join(root, "assets/cards", target.report, `${resolved.id}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });

  generated.push(`${target.report}/${resolved.id}`);
  console.log(`  ✓ ${target.report}/${resolved.id}${target.note ? ` — ${target.note}` : ""}`);
}

// Quote cards for the editor's highlights: one per (paragraph, words), so a
// shared link to exactly those words previews with them (f2e). The words are
// the verbatim selector `pnpm editorial` resolved; a card too long for one
// screen is cut at a sentence by fitToCard, never rewritten.
if (!(argReport && argParagraph)) {
  const highlightsPath = join(root, "build/editorial-highlights.json");
  if (!existsSync(highlightsPath)) {
    console.error("\nbuild/editorial-highlights.json is missing — run pnpm editorial first");
    process.exitCode = 1;
  } else {
    console.log("\nEditor's highlights:");
    const every = process.argv.includes("--all-highlights");
    const highlights = JSON.parse(readFileSync(highlightsPath, "utf8")).filter(
      (h) => (every || h.card) && (!highlightReports.length || highlightReports.includes(h.report))
    );
    for (const h of highlights) {
      const report = registry.reports.find((entry) => entry.id === h.report);
      if (!report) continue;
      const id = quoteCardId(h.paragraph, h.exact);
      const html = renderCard({
        quote: fitToCard(h.exact),
        reportTitle: report.title,
        page: h.page ? String(h.page) : undefined,
        markDataUri: markFor(h.report),
      });
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.waitForTimeout(150);
      await assertFits(`${h.report}/${id}`);
      const out = join(root, "assets/cards", h.report, `${id}.png`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, quantise(await page.screenshot()));
      generated.push(`${h.report}/${id}`);
      const kb = Math.round(statSync(out).size / 1024);
      // WhatsApp drops an og:image much over 300 KB; the rest allow megabytes.
      console.log(`  ${kb > 300 ? "!" : "✓"} ${h.report}/${id} (${kb} KB) — ${h.exact.slice(0, 60)}`);
    }
  }
}

// Default cards — a title, no quote — for everything a curated card doesn't
// cover: the site itself, and every report's contents/full/uncurated-paragraph
// pages (reportsthatmatter-obw). Skipped in the ad-hoc single-quote form so
// iterating on one curated quote stays fast.
if (!(argReport && argParagraph) && !highlightsOnly) {
  console.log("\nDefault cards:");

  const siteHtml = renderDefaultCard({
    title: SITE_HEADLINE,
    subtitle: SITE_STANDFIRST,
    // No plate: the site card is about no one report, and its standfirst
    // needs the height.
  });
  await page.setContent(siteHtml, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  await assertFits("site");
  const siteOut = join(root, "assets/cards/site.png");
  mkdirSync(dirname(siteOut), { recursive: true });
  await page.screenshot({ path: siteOut });
  console.log(`  ✓ site`);

  for (const report of registry.reports) {
    const byline = [report.authors, report.published_at].filter(Boolean).join(" · ");
    const html = renderDefaultCard({
      title: report.title,
      subtitle: byline,
      markDataUri: markFor(report.id),
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    await assertFits(`${report.id}/default`);

    const out = join(root, "assets/cards", report.id, "default.png");
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });

    generated.push(`${report.id}/default`);
    console.log(`  ✓ ${report.id}/default`);
  }
}

await browser.close();

// A typed manifest so the Worker only advertises a card that exists — an
// og:image pointing at a 404 is worse than none at all.
// The manifest lists every card on disk, so an ad hoc or --highlights run
// does not drop the cards it did not render this time.
for (const dir of readdirSync(join(root, "assets/cards"), { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const file of readdirSync(join(root, "assets/cards", dir.name))) {
    if (file.endsWith(".png")) generated.push(`${dir.name}/${file.replace(/\.png$/, "")}`);
  }
}
generated.splice(0, generated.length, ...new Set(generated));
const manifest = `/* Generated by scripts/cards.mjs — do not edit. */
export const CARDS: ReadonlySet<string> = new Set(${JSON.stringify(generated.sort(), null, 2)});
`;
writeFileSync(join(root, "src/generated/cards.ts"), manifest);
console.log(`\n${generated.length} card(s); manifest written to src/generated/cards.ts`);
