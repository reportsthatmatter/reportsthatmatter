import { renderLayout } from "./layout";

/**
 * The reader's own highlights.
 *
 * Rendered by the browser, not here, because the server has never been told
 * what anyone highlighted — that is the point of the feature, not a limitation
 * of it. This page is the shell and the empty state; `highlights-page.js`
 * fills it from local storage.
 */
export function renderHighlights(): string {
  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">Yours</p>
        <h1>Highlights</h1>
        <p class="byline mono">Kept in this browser · never sent to us</p>
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
  </article>
</main>`;

  return renderLayout("Highlights — Reports that Matter", body, {
    description:
      "Passages you have kept from the reports, with their printed pages and links back to the exact words.",
    scripts: ["/assets/highlights-page.js"],
  });
}
