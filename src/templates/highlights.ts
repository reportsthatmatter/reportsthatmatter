import { SITE_ORIGIN } from "./site";
import { escapeHtml, renderLayout } from "./layout";
import { truncate } from "./report";
import { coarseTime, type EditorPick, type FeedPassage } from "../lib/feed";

/** Longest excerpt shown; the full words are one click away (design §3.2). */
const EXCERPT = 300;

export type ReadersPage = {
  /** The readers' passages, newest first; null when the feed is off or could not be read (picks only). */
  recent: FeedPassage[] | null;
  picks: readonly EditorPick[];
  /** Report id -> the name people call it (registry `common_name`, else `title`). */
  names: Record<string, string>;
  now: number;
};

/** A link that lands on the exact words: the report's ?p= route resolves moved ids and sections through the aliases. */
function placeUrl(report: string, paragraph: string, anchor: string | null): string {
  return `/reports/${report}?p=${encodeURIComponent(paragraph)}${anchor ? `&h=${anchor}` : ""}`;
}

function tabs(current: "readers" | "yours"): string {
  const tab = (id: "readers" | "yours", label: string, href: string) =>
    id === current
      ? `<span aria-current="page">${label}</span>`
      : `<a href="${href}">${label}</a>`;
  return `<nav class="highlights-tabs mono" aria-label="Highlights">${tab("readers", "Readers", "/highlights")}${tab("yours", "Yours", "/highlights/yours")}</nav>`;
}

function header(kicker: string, title: string, byline: string, current: "readers" | "yours"): string {
  return `
  <header class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">${kicker}</p>
      <h1>${title}</h1>
      <p class="byline mono">${byline}</p>
      ${tabs(current)}
    </div>
  </header>`;
}

/** One passage: the words, then a mono line saying where they are from, how often and when, and a link to them. */
function entry(
  item: { report: string; paragraph: string; sectionTitle: string; words: string; anchor: string | null; page: number | null },
  name: string,
  extra: string[]
): string {
  const url = placeUrl(item.report, item.paragraph, item.anchor);
  const where = [escapeHtml(name), escapeHtml(item.sectionTitle), item.page !== null ? `p. ${item.page}` : null]
    .filter(Boolean)
    .join(" · ");
  return `<article class="highlight-entry">
          <blockquote cite="${escapeHtml(`${SITE_ORIGIN}${url}`)}"><p>${escapeHtml(truncate(item.words, EXCERPT))}</p></blockquote>
          <p class="highlight-meta mono">${[where, ...extra].join(" · ")}</p>
          <p class="highlight-meta mono"><a class="highlight-place" href="${escapeHtml(url)}">Read in place<span class="visually-hidden"> in the ${escapeHtml(name)}</span></a></p>
        </article>`;
}

function recentBlock(recent: FeedPassage[], names: Record<string, string>, now: number): string {
  const body = recent.length
    ? `<ol class="highlights-stream">
      ${recent
        .map((item) => {
          const extra = [
            ...(item.times >= 2 ? [`highlighted ${item.times} times`] : []),
            `<time datetime="${new Date(item.lastSeenHour).toISOString()}">${coarseTime(item.lastSeenHour, now)}</time>`,
          ];
          return `<li>${entry(item, names[item.report] ?? item.report, extra)}</li>`;
        })
        .join("\n      ")}
    </ol>`
    : `<p class="highlights-empty">Passages readers save or share appear here about half an hour later. Select any passage in a report and choose <strong>Save</strong>.</p>`;

  return `
    <section class="highlights-block" aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recently highlighted</h2>
      ${body}
    </section>`;
}

function picksBlock(picks: readonly EditorPick[], names: Record<string, string>): string {
  if (!picks.length) return "";
  return `
    <section class="highlights-block" aria-labelledby="picks-heading">
      <h2 id="picks-heading">Editor’s picks</h2>
      <p class="highlights-note">Chosen by Reports that Matter: one passage from each of several reports. Not counted as readers’ highlights.</p>
      <ul class="highlights-stream">
      ${picks.map((pick) => `<li>${entry(pick, names[pick.report] ?? pick.report, ["Editor’s pick"])}</li>`).join("\n      ")}
      </ul>
    </section>`;
}

/**
 * /highlights: what readers are highlighting, for everyone (decision 0023, bght.10.3). Server-rendered and never
 * empty: Recently highlighted (from public_marks, src/lib/feed.ts), then Editor's picks in their own labelled
 * block, never interleaved and never with a time or a count (decision 0014). No JavaScript is needed to read it.
 */
export function renderReadersHighlights(page: ReadersPage): string {
  const body = `
<main>
  ${header("Highlights", "What readers are highlighting", "Passages readers have saved or shared, counted anonymously · updated every few minutes", "readers")}

  <div class="wrap measure highlights-page">
    ${page.recent ? recentBlock(page.recent, page.names, page.now) : ""}
    ${picksBlock(page.picks, page.names)}
    <p class="highlights-how">When you save or share a passage, its words are counted anonymously: no account, no cookie, nothing that identifies you. Your own saved passages are under <a href="/highlights/yours">Yours</a>.</p>
  </div>
</main>`;

  return renderLayout("Highlights — Reports that Matter", body, {
    description: "What readers are highlighting in the reports: passages saved or shared, counted anonymously, with links to the exact words.",
    url: `${SITE_ORIGIN}/highlights`,
  });
}

/**
 * /highlights/yours: the reader's own highlights.
 *
 * Rendered by the browser, not here: the list itself lives only in this browser's local storage, and
 * `highlights-page.js` fills this shell from it. (What the server does record when someone saves or shares is
 * the words, counted anonymously; see /highlights.)
 */
export function renderYourHighlights(): string {
  const body = `
<main>
  ${header("Highlights", "Your highlights", "Kept in this browser", "yours")}

  <div class="wrap measure" id="highlights">
    <p class="highlights-empty">
      Nothing kept yet. Select a passage in any report and choose
      <strong>Save</strong>, and it will be here — with its printed page and a
      link back to the exact words.
    </p>
  </div>

  <div class="wrap measure highlights-actions mono" id="highlights-actions" hidden>
    <button type="button" data-export="markdown">Copy as Markdown</button>
    <button type="button" data-export="json">Copy as JSON</button>
  </div>

  <div class="wrap measure">
    <p class="byline mono">Your list stays in this browser. When you save or share a passage, its words are also sent to us, with no account, no cookie and nothing that names you, so we can count which passages readers mark.</p>
  </div>
</main>`;

  return renderLayout("Your highlights — Reports that Matter", body, {
    description: "Passages you have kept from the reports, with their printed pages and links back to the exact words.",
    scripts: ["/assets/highlights-page.js"],
    url: `${SITE_ORIGIN}/highlights/yours`,
    noindex: true,
  });
}
