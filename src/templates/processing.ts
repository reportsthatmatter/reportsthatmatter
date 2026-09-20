import { renderLayout, escapeHtml } from "./layout";
import type { ReportMeta } from "./report";

/**
 * A report's own account of how its text was made and where it falls short.
 *
 * The body is the report's PROCESSING.md, pre-rendered without a layout (see
 * `scripts/prerender.mjs`). The page supplies the title, so the file's own
 * heading never appears twice.
 */
export function renderProcessing(meta: ReportMeta, bodyHtml: string): string {
  const reportPath = `/reports/${escapeHtml(meta.id ?? "")}`;

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">About this edition</p>
        <h1>${escapeHtml(meta.title)}</h1>
        <p class="byline mono">How the text was made, and where it falls short</p>
        <p class="byline mono"><a href="${reportPath}">← Back to the report</a></p>
      </div>
    </header>
    <div class="prose wrap measure">
      ${bodyHtml}
    </div>
  </article>
</main>`;

  return renderLayout(`About this edition — ${meta.title} — Reports that Matter`, body, {
    description: `How the text of ${meta.title} was made from the published PDF, and the places where it still differs from the printed page.`,
  });
}
