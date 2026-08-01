import { renderLayout, escapeHtml } from "./layout";

export type ReportMeta = {
  title: string;
  authors?: string;
  published_at?: string;
  source_url?: string;
};

/**
 * Pulls a paragraph's plain text out of the rendered HTML.
 *
 * Reading it back off the render rather than recomputing it from the markdown
 * means the preview can never disagree with the page — one source of ids.
 */
export function extractParagraph(html: string, id: string): string | null {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<p id="${escaped}"[^>]*>([\\s\\S]*?)</p>`));
  if (!match) return null;

  return match[1]
    // Drop the whole sidenote apparatus — the citation text and the superscript
    // marker. Left in, a quoted passage reads "…delay it.4 In service of…".
    .replace(/<span class="sidenote">[\s\S]*?<\/span>/g, "")
    .replace(/<label class="sidenote-toggle"[\s\S]*?<\/label>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit)}…`;
}

export function renderReport(
  meta: ReportMeta,
  html: string,
  /** Paragraph id from `?p=`, used to preview the quoted passage when shared. */
  highlighted?: string
): string {
  const byline = [meta.authors, meta.published_at].filter(Boolean).join(" · ");

  // A link shared into a feed is judged entirely on its preview. When the link
  // points at a passage, the preview should be that passage — not boilerplate
  // about the site.
  const quoted = highlighted ? extractParagraph(html, highlighted) : null;
  const description = quoted
    ? `“${truncate(quoted, 280)}” — ${meta.title}`
    : `${meta.title}${byline ? ` — ${byline}` : ""}. Read the full text with linkable paragraphs.`;

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">Report</p>
        <h1>${escapeHtml(meta.title)}</h1>
        ${byline ? `<p class="byline mono">${escapeHtml(byline)}</p>` : ""}
        ${
          meta.source_url
            ? `<p class="byline mono"><a href="${escapeHtml(meta.source_url)}" rel="nofollow">Original document ↗</a></p>`
            : ""
        }
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
    description,
    scripts: ["/assets/share.js"],
  });
}
