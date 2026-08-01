import { renderLayout, escapeHtml } from "./layout";

export type ReportMeta = {
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
};

export function renderReport(meta: ReportMeta, html: string): string {
  const byline = [meta.authors, meta.published_at].filter(Boolean).join(" · ");

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">Report</p>
        <h1>${escapeHtml(meta.title)}</h1>
        ${byline ? `<p class="byline mono">${escapeHtml(byline)}</p>` : ""}
      </div>
    </header>
    <div class="prose wrap measure" id="report-body">
      ${html}
    </div>
  </article>
</main>
<div class="share-pop" id="share-pop" role="dialog" aria-label="Share selection">
  <button type="button" data-action="copy-link">Copy link</button>
  <button type="button" data-action="copy-quote">Copy quote</button>
</div>`;

  return renderLayout(`${meta.title} — Reports that Matter`, body, {
    description: `${meta.title}${byline ? ` — ${byline}` : ""}. Read the full text with linkable paragraphs.`,
    scripts: ["/assets/share.js"],
  });
}
