import { SITE_ORIGIN } from "./site";
import { renderLayout } from "./layout";

/**
 * The reader's own highlights.
 *
 * Rendered by the browser, not here: the list itself lives only in the
 * reader's local storage. (The words of each Save, Copy link, Copy quote or
 * Share are separately recorded anonymously in `marks` by /api/mark, to count
 * what readers find important; the page says so.) This page is the shell and
 * the empty state; `highlights-page.js` fills it from local storage.
 */
export function renderHighlights(): string {
  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">Yours</p>
        <h1>Highlights</h1>
        <p class="byline mono">Kept in this browser</p>
      </div>
    </header>

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
  </article>
</main>`;

  return renderLayout("Highlights — Reports that Matter", body, {
    description:
      "Passages you have kept from the reports, with their printed pages and links back to the exact words.",
    scripts: ["/assets/highlights-page.js"],
    url: `${SITE_ORIGIN}/highlights`,
  });
}
