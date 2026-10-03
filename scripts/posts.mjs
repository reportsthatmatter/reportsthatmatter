/* Builds the Bluesky posting queue from approved excerpts (reportsthatmatter-y2t.3).
 *
 *   pnpm posts
 *
 * Sources: every `card: true` highlight in an *approved* `editorial/<id>.yaml`,
 * plus the legacy curated quotes in `docs/share-quotes.yaml`. Every quote is
 * checked verbatim and every paragraph id resolved with the same
 * `placeQuote` / `citationHref` / `pageOf` logic `scripts/editorial.mjs`
 * uses (`src/lib/editorial.ts`) — nothing here re-checks a quote a different
 * way. Checked against the pre-rendered body in assets/generated/, so run
 * `pnpm prerender` first, same requirement as `pnpm editorial`.
 *
 * Writes `marketing/queue.yaml` — idempotent: an existing item's `scheduled`
 * date and `posted_url` are never touched by a rerun (see `buildQueue` in
 * src/lib/posts.ts for exactly what "idempotent" means here). New excerpts
 * are appended, one per day, round-robin across reports.
 *
 * Also writes a static local preview, `build/posts-preview.html` — open it
 * in a browser; nothing here is served or deployed.
 *
 * Bluesky only (X dropped 2026-09-25: API credits; Rufus posts to X by hand).
 * Makes no network request of any kind — this only ever writes local files.
 */
import "./lib/help.mjs";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { resolveCandidate, buildQueue, isoDate } from "../src/lib/posts.ts";
import { CARDS } from "../src/generated/cards.ts";
import { SITE_ORIGIN } from "../src/templates/site.ts";

const root = join(import.meta.dirname, "..");

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const titleOf = Object.fromEntries(registry.reports.map((r) => [r.id, r.title]));
const reportOrder = registry.reports.map((r) => r.id);

// ---------- collect candidates ----------

const candidates = [];

const editorialDir = join(root, "editorial");
const editorialFiles = existsSync(editorialDir) ? readdirSync(editorialDir).filter((n) => n.endsWith(".yaml")).sort() : [];
for (const name of editorialFiles) {
  const source = parse(readFileSync(join(editorialDir, name), "utf8"));
  if (source.status !== "approved") continue;
  for (const h of source.highlights ?? []) {
    if (!h.card) continue;
    candidates.push({
      report: source.report,
      reportTitle: titleOf[source.report],
      paragraph: h.paragraph,
      quote: h.quote,
      origin: "editorial",
    });
  }
}

const shareQuotesPath = join(root, "docs/share-quotes.yaml");
if (existsSync(shareQuotesPath)) {
  const shareQuotes = parse(readFileSync(shareQuotesPath, "utf8"));
  for (const q of shareQuotes.quotes ?? []) {
    // Posts need an explicit verbatim excerpt, not "the start of the paragraph"
    // (share-quotes.yaml's fallback for a card with no `quote:` — fine for a
    // card image, not specific enough for a quoted post).
    if (!q.quote) continue;
    candidates.push({
      report: q.report,
      reportTitle: titleOf[q.report],
      paragraph: q.paragraph,
      quote: q.quote,
      origin: "share-quotes",
    });
  }
}

// ---------- resolve against the pre-rendered reports ----------

// Missing pre-rendered text is an environment problem (forgot `pnpm
// prerender`), not a content one — fail fast and clearly, the way
// scripts/editorial.mjs does, rather than reporting it once per candidate.
const wanted = [...new Set(candidates.map((c) => c.report).filter((r) => titleOf[r]))];
const unrendered = wanted.filter((id) => !existsSync(join(root, `assets/generated/reports/${id}/full-body.html`)));
if (unrendered.length) {
  console.error(`No pre-rendered text for ${unrendered.join(", ")} in assets/generated/reports/.`);
  console.error("Run pnpm prerender first. Nothing was written.");
  process.exit(1);
}

const htmlCache = new Map();
function htmlFor(reportId) {
  if (!htmlCache.has(reportId)) {
    htmlCache.set(reportId, readFileSync(join(root, `assets/generated/reports/${reportId}/full-body.html`), "utf8"));
  }
  return htmlCache.get(reportId);
}

// A candidate that can't be posted (too long for Bluesky, no page number, no
// card yet, or — from the legacy docs/share-quotes.yaml only — a quote that
// no longer matches the report) is skipped and reported, not a build
// failure: the queue is built from whatever *does* check out, the same way
// `pnpm cards` renders every card that fits and only flags the ones that
// don't. A quote mismatch or a missing paragraph from an *approved editorial
// file* is different — that is the citation-integrity bug this project
// never tolerates — but it is still `pnpm editorial`'s job to catch and fail
// on, in the same way `verify.sh` already does; failing the whole queue a
// second time here would only duplicate that gate less thoroughly.
const skipped = [];
const resolved = [];
const seen = new Set();
let defaultCardCount = 0;

for (const candidate of candidates) {
  if (!titleOf[candidate.report]) {
    skipped.push(`${candidate.report}/${candidate.paragraph}: not in reports/registry.yaml`);
    continue;
  }
  const html = htmlFor(candidate.report);
  const result = resolveCandidate(candidate, html, CARDS, SITE_ORIGIN);
  if (!result.ok) {
    skipped.push(result.problem);
    continue;
  }
  if (seen.has(result.item.id)) continue; // same quote reached us from both sources
  seen.add(result.item.id);
  if (result.item.cardIsDefault) defaultCardCount++;
  resolved.push(result.item);
}

if (skipped.length) {
  console.warn(`${skipped.length} candidate(s) skipped:`);
  for (const s of skipped) console.warn(`  - ${s}`);
  process.exitCode = 1;
}

// ---------- build the queue ----------

const queuePath = join(root, "marketing/queue.yaml");
const existingDoc = existsSync(queuePath) ? parse(readFileSync(queuePath, "utf8")) : null;
const existing = existingDoc?.items ?? [];

const { queue, added, staleUnposted, stalePosted } = buildQueue({
  resolved,
  existing,
  today: isoDate(new Date()),
  reportOrder,
});

if (staleUnposted.length) {
  console.error(
    `${staleUnposted.length} scheduled but not-yet-posted item(s) no longer match their source ` +
      `(a quote or paragraph moved or was withdrawn) — fix before its scheduled date arrives, or ` +
      `y2t.4's poster would ship a broken link:`
  );
  for (const id of staleUnposted) console.error(`  - ${id}`);
  process.exitCode = 1;
}

if (stalePosted.length) {
  console.warn(
    `Note: ${stalePosted.length} already-posted item(s) no longer match a current candidate (harmless — kept as history):`
  );
  for (const id of stalePosted) console.warn(`  - ${id}`);
}

mkdirSync(join(root, "marketing"), { recursive: true });
writeFileSync(
  queuePath,
  `# Generated by \`pnpm posts\` (reportsthatmatter-y2t.3) — do not hand-edit \`scheduled\`
# or \`posted_url\`. Re-running never moves an existing item's date or clears a
# posted_url a scheduled poster (y2t.4) has written back; it only appends new
# excerpts. See src/lib/posts.ts (buildQueue) for exactly what that means.
${stringify({ items: queue })}`
);

console.log(
  `${queue.length} item(s) in the queue (${added} new). ${resolved.length} candidate(s) resolved` +
    (defaultCardCount ? `, ${defaultCardCount} using a report's plain default card (no quote-specific card rendered yet)` : "") +
    "."
);

// ---------- static local preview ----------

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rows = queue
  .map((item) => {
    const posted = item.posted_url
      ? `<span class="posted">posted → <a href="${escapeHtml(item.posted_url)}">${escapeHtml(item.posted_url)}</a></span>`
      : `<span class="scheduled">scheduled</span>`;
    const cardPath = join(root, item.card);
    const img = existsSync(cardPath)
      ? `<img src="../${escapeHtml(item.card)}" alt="Share card" loading="lazy" />`
      : `<div class="missing-card">no card at ${escapeHtml(item.card)}</div>`;
    return `
      <tr>
        <td class="date">${escapeHtml(item.scheduled)}<br />${posted}</td>
        <td class="card">${img}</td>
        <td class="text">
          <pre>${escapeHtml(item.text)}</pre>
          <div class="meta">${escapeHtml(item.report)} / ${escapeHtml(item.paragraph)}</div>
          <a class="link" href="${escapeHtml(item.link)}">${escapeHtml(item.link)}</a>
        </td>
      </tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Posting queue preview</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f7f7f7; color: #252525; margin: 0; padding: 32px; }
  h1 { font-size: 20px; }
  p.summary { color: #555; }
  table { border-collapse: collapse; width: 100%; }
  td { border-top: 1px solid #ddd; padding: 12px 10px; vertical-align: top; }
  td.date { white-space: nowrap; font-family: monospace; font-size: 13px; }
  td.card img { width: 220px; height: auto; display: block; border: 1px solid #ddd; }
  .missing-card { width: 220px; height: 115px; display: flex; align-items: center; justify-content: center;
    border: 1px dashed #c33; color: #c33; font-size: 12px; text-align: center; }
  pre { white-space: pre-wrap; font-family: Georgia, serif; font-size: 15px; margin: 0 0 6px; }
  .meta { color: #888; font-size: 12px; font-family: monospace; }
  a.link { font-size: 12px; word-break: break-all; }
  .posted { color: #2a7; font-size: 12px; }
  .scheduled { color: #999; font-size: 12px; }
</style>
</head>
<body>
  <h1>Reports that Matter — posting queue</h1>
  <p class="summary">${queue.length} item(s), ${added} new this run, Bluesky only. Generated by <code>pnpm posts</code> — not deployed, not committed.</p>
  <table>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
`;

mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(join(root, "build/posts-preview.html"), html);
console.log(`Preview written to build/posts-preview.html`);
