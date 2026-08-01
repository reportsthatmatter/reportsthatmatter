import { renderLayout } from "./layout";

/**
 * A 404 that helps rather than shrugs.
 *
 * The domain carried a different site for years, so some visitors will arrive
 * on a URL that was real until recently. Telling them what happened, and where
 * the material went, is the difference between a dead end and a redirect a
 * person can follow themselves.
 */
export function renderNotFound(wasLegacy: boolean): string {
  const body = `
<main>
  <section class="report-header wrap">
    <div class="measure">
      <p class="kicker mono">404</p>
      <h1>${wasLegacy ? "That page has moved." : "Nothing here."}</h1>
    </div>
  </section>

  <div class="prose wrap measure">
    ${
      wasLegacy
        ? `<p>This address belonged to an earlier version of Reports that Matter.
           The site has been rebuilt, and the earlier material is being migrated
           through a new ingestion pipeline rather than carried over as-is.</p>
           <p>The original pages are preserved and can still be read on the
           <a href="https://github.com/reportsthatmatter/reportsthatmatter/tree/gh-pages">archived branch</a>.</p>`
        : `<p>There is no page at this address. It may have been mistyped, or a
           report may have been renamed.</p>`
    }
    <p>Everything currently published is in <a href="/reports">the archive</a>.</p>
  </div>
</main>`;

  return renderLayout("Not found — Reports that Matter", body, {
    description: "Page not found.",
  });
}
