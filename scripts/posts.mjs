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
 * A card: true highlight whose quote-form post is over Bluesky's limit is still queued when a quote card carries the whole
 * quote (reportsthatmatter-f9we): as an item flagged `needs_hook: true`, which cannot post until a person writes its `hook:`;
 * `--check` fails it once its date arrives with none.
 *
 * Prints every card: true highlight in an affected-community report (the registry's affected_community: true) with
 * what became of it: queued, skipped and why, and whether it is Tier C (src/lib/tier-c.ts; reportsthatmatter-zh1w).
 *
 * Flags (all explicit; a plain run never does any of this):
 *   --check            write nothing; exit 1 if a not-yet-posted item is stale. The
 *                      scheduled poster's workflow runs this before every post.
 *   --verify           write nothing; exit 1 if a plain run would change marketing/queue.yaml at all
 *                      (a stale item, a new excerpt, a moved link or card). pnpm ship runs it after a
 *                      re-ingest: the queue is committed, so a clean checkout must already be up to date.
 *   --drop-stale       remove not-yet-posted items whose quote or paragraph no longer
 *                      resolves (e.g. after a re-ingest moved ids). Posted ones stay.
 *   --report <id>      (repeatable, or a comma list) only the named reports' problems decide the exit status
 *                      and are listed in full: a skipped candidate, a stale not-yet-posted item. The queue is still
 *                      built from every report (a subset would drop the others' items), and other reports'
 *                      problems are counted in one line. Without it, any problem anywhere exits 1, which on main
 *                      is the other reports' business (reportsthatmatter-5qmm).
 *   --start YYYY-MM-DD re-date every not-yet-posted item, one per day from that date,
 *                      in its current order, under the scheduling rules in src/lib/posts.ts: a
 *                      Challenger excerpt first (on that date), no two Post Office or two Grenfell
 *                      items within 14 days, nothing 18 Dec to 2 Jan. Posted items never move.
 *
 * Bluesky only (X dropped 2026-09-25: API credits; Rufus posts to X by hand).
 * Makes no network request of any kind — this only ever writes local files.
 */
import "./lib/help.mjs";
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { resolveCandidate, buildQueue, isoDate, BLUESKY_GRAPHEME_LIMIT, queueViolations, needsHookViolations, reportPolicies, posterEligibility, QUEUE_HEADER } from "../src/lib/posts.ts";
import { CARDS } from "../src/generated/cards.ts";
import { SITE_ORIGIN } from "../src/templates/site.ts";
import { inScope, reportScope } from "./lib/posts-scope.ts";
import { affectedCommunityIds, tierCMatch, TIER_C_IS_FAILURE } from "../src/lib/tier-c.ts";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flagCheck = args.includes("--check");
const flagVerify = args.includes("--verify");
const scope = reportScope(args);
const flagDropStale = args.includes("--drop-stale");
const startIdx = args.indexOf("--start");
const flagStart = startIdx >= 0 ? args[startIdx + 1] : undefined;
if (startIdx >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(flagStart ?? "")) {
  console.error("--start needs a date, e.g. --start 2026-10-13");
  process.exit(2);
}

const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8"));
const titleOf = Object.fromEntries(registry.reports.map((r) => [r.id, r.title]));
const shortTitleOf = Object.fromEntries(registry.reports.map((r) => [r.id, r.common_name ?? r.title]));
const reportOrder = registry.reports.map((r) => r.id);
const policies = reportPolicies(registry);
const newsDayOnly = registry.reports.filter((r) => r.news_day_only === true).map((r) => r.id);
const affected = affectedCommunityIds(registry); // the registry's affected_community flag (zh1w)
const unknownScope = scope.filter((id) => !titleOf[id]);
if (unknownScope.length) {
  console.error(`--report: not in reports/registry.yaml: ${unknownScope.join(", ")}`);
  process.exit(2);
}

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
      privatePeople: source.private_people ?? [],
      report: source.report,
      reportTitle: titleOf[source.report],
      sourceTitle: shortTitleOf[source.report],
      paragraph: h.paragraph,
      quote: h.quote,
      tier: h.tier,
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
      sourceTitle: shortTitleOf[q.report],
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
// Policy exclusions (63cd Tier B, 80qf news-day-only): not defects, so they are listed and never fail the run.
const excluded = [];
const resolved = [];
const seen = new Set();
let defaultCardCount = 0;
// Every card in an affected-community report with what became of it (zh1w): the reviewer found ten Tier C ones that
// escaped the queue only by length or page number.
const affectedCards = [];

for (const candidate of candidates) {
  if (!titleOf[candidate.report]) {
    skipped.push({ report: candidate.report, text: `${candidate.report}/${candidate.paragraph}: not in reports/registry.yaml` });
    continue;
  }
  const inAffected = affected.includes(candidate.report);
  const tierC = inAffected ? tierCMatch(candidate.quote, candidate.privatePeople) : null;
  const tierCNote = tierC ? `Tier C (${tierC.kind === "word" ? `word "${tierC.matched}"` : `names ${tierC.matched}`})` : null;
  const note = (status) => inAffected && affectedCards.push({ report: candidate.report, paragraph: candidate.paragraph, origin: candidate.origin, status, tierC: tierCNote });
  if (tierC && TIER_C_IS_FAILURE) {
    const text = `${candidate.report}/${candidate.paragraph}: ${tierCNote} in an affected-community report, refused (strategy section 8, decision 63cd)`;
    skipped.push({ report: candidate.report, text });
    note(`skipped: ${text.split(": ").slice(1).join(": ")}`);
    continue;
  }
  const eligible = posterEligibility(candidate, policies);
  if (!eligible.ok) {
    excluded.push({ report: candidate.report, paragraph: candidate.paragraph, kind: eligible.kind, reason: eligible.reason, candidate });
    note(`excluded: ${eligible.reason}`);
    continue;
  }
  const html = htmlFor(candidate.report);
  const result = resolveCandidate({ ...candidate, contextLine: policies.get(candidate.report)?.contextLine }, html, CARDS, SITE_ORIGIN);
  if (!result.ok) {
    skipped.push({ report: candidate.report, text: result.problem });
    note(`skipped: ${result.problem.replace(`${candidate.report}/${candidate.paragraph}: `, "")}`);
    continue;
  }
  if (seen.has(result.item.id)) {
    note("duplicate of an item already in the queue");
    continue; // same quote reached us from both sources
  }
  seen.add(result.item.id);
  if (result.item.cardIsDefault) defaultCardCount++;
  resolved.push(result.item);
  note("would be queued");
}

if (affectedCards.length) {
  const tierCCount = affectedCards.filter((c) => c.tierC).length;
  console.log(`${affectedCards.length} card: true highlight(s) in affected-community reports, ${tierCCount} Tier C${tierCCount && !TIER_C_IS_FAILURE ? " (queued today: Tier C is a warning)" : ""}:`);
  for (const c of affectedCards) console.log(`  ${c.tierC ? "!" : "-"} ${c.report}/${c.paragraph} [${c.origin}]: ${c.status}${c.tierC ? `; ${c.tierC}` : ""}`);
}

const tierB = excluded.filter((e) => e.kind === "tier-b");
const newsDay = excluded.filter((e) => e.kind === "news-day");
if (tierB.length) console.log(`${tierB.length} candidate(s) kept out of the queue as Tier B (affected-community reports need \`tier: A\` on the highlight; 63cd).`);
if (newsDay.length) {
  const reports = [...new Set(newsDay.map((e) => e.report))];
  console.log(`${newsDay.length} candidate(s) held for news days (${reports.join(", ")}; 80qf). Pass --report <id> to list them.`);
  for (const e of newsDay.filter((e) => scope.includes(e.report))) {
    const r = resolveCandidate(e.candidate, htmlFor(e.report), CARDS, SITE_ORIGIN);
    console.log(`  - ${e.report}/${e.paragraph}: ${r.ok ? `${r.item.link}\n${r.item.text.replace(/^/gm, "      ")}` : `not postable: ${r.problem}`}`);
  }
}

const mine = inScope(skipped, scope);
if (mine.length) {
  console.warn(`${mine.length} candidate(s) skipped${scope.length ? ` (${scope.join(", ")})` : ""}:`);
  for (const s of mine) console.warn(`  - ${s.text}`);
  process.exitCode = 1;
}
if (skipped.length > mine.length) console.warn(`${skipped.length - mine.length} candidate(s) of other reports skipped (not listed: --report ${scope.join(",")}).`);

// ---------- build the queue ----------

const queuePath = join(root, "marketing/queue.yaml");
const existingDoc = existsSync(queuePath) ? parse(readFileSync(queuePath, "utf8")) : null;
const existing = existingDoc?.items ?? [];

const { queue, added, staleUnposted: staleAll, stalePosted, heldBack, overLength } = buildQueue({
  resolved,
  existing,
  today: isoDate(new Date()),
  reportOrder,
  dropStale: flagDropStale,
  restartFrom: flagStart,
  newsDayOnly,
});
if (heldBack.length) {
  console.warn(`Took ${heldBack.length} not-yet-posted news-day-only item(s) out of the queue (80qf):`);
  for (const i of heldBack) console.warn(`  - ${i.scheduled} ${i.id}`);
}

// A stale item belongs to the report its queue entry names; --report scopes which ones fail this run.
const reportOfItem = new Map(existing.map((item) => [item.id, item.report]));
const staleUnposted = flagDropStale || !scope.length ? staleAll : staleAll.filter((id) => scope.includes(reportOfItem.get(id)));
if (staleAll.length > staleUnposted.length) console.warn(`${staleAll.length - staleUnposted.length} stale not-yet-posted item(s) of other reports (not listed: --report ${scope.join(",")}).`);

if (flagDropStale && staleUnposted.length) {
  console.warn(`Dropped ${staleUnposted.length} stale not-yet-posted item(s) (--drop-stale):`);
  for (const id of staleUnposted) console.warn(`  - ${id}`);
} else if (staleUnposted.length) {
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

// The scheduling rules (src/lib/posts.ts: opening report, Post Office / Grenfell spacing, kept-clear dates).
const violations = queueViolations(queue, newsDayOnly);
if (violations.length) {
  console.error(`${violations.length} scheduling rule break(s) in the queue (re-date with pnpm posts --start YYYY-MM-DD):`);
  for (const v of violations) console.error(`  - ${v}`);
}

// A hook (post-writing skill) whose post is over Bluesky's limit, or whose `text` was not rebuilt after the hook was
// edited: the poster posts `text`, so either would post the wrong words.
if (overLength.length) {
  console.error(`${overLength.length} hooked item(s) too long (shorten the hook):`);
  for (const o of overLength) console.error(`  - ${o}`);
  process.exitCode = 1;
}
// An item queued only because it can carry a hook (its quote form is over the limit): listed always, a failure once
// its date arrives with no hook (reportsthatmatter-f9we).
const needsHook = needsHookViolations(queue, isoDate(new Date()));
if (needsHook.waiting.length) {
  console.warn(`${needsHook.waiting.length} queued item(s) need a hook before they can post (quote form over ${BLUESKY_GRAPHEME_LIMIT} graphemes; the card carries the quote):`);
  for (const i of needsHook.waiting) console.warn(`  - ${i.scheduled} ${i.id}`);
}
if (needsHook.due.length) {
  console.error(`${needsHook.due.length} item(s) due with no hook:`);
  for (const d of needsHook.due) console.error(`  - ${d}`);
}
const before = new Map(existing.map((i) => [i.id, i]));
const hookDrift = queue.filter((i) => !i.posted_url && i.hook?.trim() && before.get(i.id)?.text !== i.text).map((i) => i.id);
if (flagCheck && hookDrift.length) {
  console.error(`${hookDrift.length} hooked item(s) whose text is not built from the hook (run pnpm posts and commit):`);
  for (const id of hookDrift) console.error(`  - ${id}`);
}

if (flagCheck) {
  // Read-only gate for the scheduled poster: a stale not-yet-posted item, a scheduling rule break, or a hooked item
  // that is too long or whose text is out of date fails it. Skipped candidates and new additions are not its business.
  const failed = staleUnposted.length || violations.length || overLength.length || hookDrift.length || needsHook.due.length;
  console.log(failed ? "Queue check failed." : "Queue check passed: every not-yet-posted item still resolves.");
  process.exit(failed ? 1 : 0);
}

const queueText = `${QUEUE_HEADER}${stringify({ items: queue })}`;
if (flagVerify) {
  const current = existsSync(queuePath) ? readFileSync(queuePath, "utf8") : "";
  if (current !== queueText) {
    console.error(`marketing/queue.yaml is out of date (${added} new item(s), ${staleUnposted.length} stale): run pnpm posts and commit it.`);
    process.exit(1);
  }
  console.log("marketing/queue.yaml is up to date.");
  process.exit(0); // candidates skipped above (too long for Bluesky, ...) are not queue changes
}

mkdirSync(join(root, "marketing"), { recursive: true });
writeFileSync(queuePath, queueText);

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
