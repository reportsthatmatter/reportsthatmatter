import { renderLayout, escapeHtml } from "./layout";

/**
 * A window of `body` around `[start, end)`, the matched span wrapped in
 * `<mark>`, everything else escaped. Safe HTML — the only unescaped markup
 * is the `<mark>` this function adds itself.
 */
export function renderSnippet(body: string, start: number, end: number, window = 100): string {
  let from = Math.max(0, start - window);
  let to = Math.min(body.length, end + window);

  // Snap to a word boundary rather than cutting mid-word — the same
  // treatment truncate() gives excerpts elsewhere (report.ts, section.ts).
  if (from > 0) {
    const boundary = body.lastIndexOf(" ", from);
    from = boundary === -1 ? from : Math.min(boundary + 1, start);
  }
  if (to < body.length) {
    const boundary = body.indexOf(" ", to);
    to = boundary === -1 ? to : Math.max(boundary, end);
  }

  const before = escapeHtml(body.slice(from, start));
  const matched = escapeHtml(body.slice(start, end));
  const after = escapeHtml(body.slice(end, to));

  return `${from > 0 ? "…" : ""}${before}<mark>${matched}</mark>${after}${to < body.length ? "…" : ""}`;
}

export type SearchResultView = {
  url: string;
  reportTitle: string;
  sectionTitle: string;
  page: string | null;
  snippetHtml: string;
};

export type SearchScope = { id: string; title: string };

function truncateQuery(q: string, limit = 200): string {
  return q.length > limit ? q.slice(0, limit) : q;
}

export function renderSearch(input: {
  q: string;
  scope: string | null;
  scopeTitle: string | null;
  results: SearchResultView[];
  reports: SearchScope[];
  searched: boolean;
  failed: boolean;
}): string {
  const { q, scope, scopeTitle, results, reports, searched, failed } = input;
  const query = truncateQuery(q);

  const scopeOptions = reports
    .map(
      (report) =>
        `<option value="${escapeHtml(report.id)}"${report.id === scope ? " selected" : ""}>${escapeHtml(report.title)}</option>`
    )
    .join("");

  const form = `
    <form class="search-form" method="get" action="/search">
      <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search every report…" aria-label="Search" autofocus />
      <select name="report" aria-label="Limit to a report">
        <option value=""${scope ? "" : " selected"}>All reports</option>
        ${scopeOptions}
      </select>
      <button type="submit">Search</button>
    </form>`;

  let resultsHtml: string;
  if (!searched) {
    resultsHtml = "";
  } else if (failed) {
    resultsHtml = `<p class="mono search-status">Search is unavailable right now. Try again shortly.</p>`;
  } else if (!results.length) {
    resultsHtml = `<p class="mono search-status">No matches${scopeTitle ? ` in ${escapeHtml(scopeTitle)}` : ""} for "${escapeHtml(query)}".</p>`;
  } else {
    const items = results
      .map(
        (result) => `<li>
          <a href="${escapeHtml(result.url)}">
            <blockquote class="serif">“${result.snippetHtml}”</blockquote>
            <p class="meta mono">${escapeHtml(result.reportTitle)} · ${escapeHtml(result.sectionTitle)}${result.page ? ` · p. ${escapeHtml(result.page)}` : ""}</p>
          </a>
        </li>`
      )
      .join("");
    resultsHtml = `<ul class="marked-list search-results">${items}</ul>`;
  }

  const body = `
<main>
  <header class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">Search</p>
      <h1>${scopeTitle ? `Search ${escapeHtml(scopeTitle)}` : "Search every report"}</h1>
      ${scopeTitle ? `<p class="byline mono"><a href="/search${q ? `?q=${encodeURIComponent(q)}` : ""}">Search everything instead →</a></p>` : ""}
    </div>
  </header>
  <section class="section wrap">
    ${form}
    ${resultsHtml}
  </section>
</main>`;

  const title = query ? `“${query}” — Search — Reports that Matter` : "Search — Reports that Matter";
  return renderLayout(title, body, {
    description: "Search across every report — a result is the exact matched passage, not a page to hunt through.",
  });
}
