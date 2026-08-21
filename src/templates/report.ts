import { renderLayout, escapeHtml } from "./layout";
import { decodeAnchor, locate } from "../../assets/anchor.js";
import { cardPath } from "./card";
import { CARDS } from "../generated/cards";

export type ReportMeta = {
  id?: string;
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

/**
 * The passage a share link points at: the words it names if it names words,
 * and the paragraph holding them otherwise.
 *
 * A quote whose words are no longer in the paragraph falls back to the
 * paragraph. Previewing text we could not show the reader would be the same
 * failure as a citation resolving to something else, one step earlier.
 */
export function quotedPassage(
  html: string,
  paragraphId: string,
  anchor?: string
): string | null {
  const paragraph = extractParagraph(html, paragraphId);
  if (!paragraph) return null;

  const selector = decodeAnchor(anchor);
  if (!selector) return paragraph;

  const found = locate(paragraph, selector);
  return found ? paragraph.slice(found.start, found.end) : paragraph;
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
  highlighted?: string,
  /** Quote anchor from `?h=`, naming the words within that paragraph. */
  anchor?: string
): string {
  const byline = [meta.authors, meta.published_at].filter(Boolean).join(" · ");

  // A link shared into a feed is judged entirely on its preview. When the link
  // points at a passage, the preview should be that passage — not boilerplate
  // about the site.
  const quoted = highlighted ? quotedPassage(html, highlighted, anchor) : null;
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
    <div class="prose wrap measure" id="report-body"
      data-report="${escapeHtml(meta.id ?? "")}"
      data-report-title="${escapeHtml(meta.title)}"
      data-section=""
      data-section-title="">
      ${html}
    </div>
  </article>
</main>
<div class="share-pop" id="share-pop" role="dialog" aria-label="Share selection">
  <button type="button" data-action="copy-link">Copy link</button>
  <button type="button" data-action="copy-quote">Copy quote</button>
  <button type="button" data-action="save">Save</button>
</div>`;

  // Only advertise a card that exists — an og:image pointing at a 404 is worse
  // than no image at all.
  const cardKey = meta.id && highlighted ? `${meta.id}/${highlighted}` : null;
  const image = cardKey && CARDS.has(cardKey) ? cardPath(meta.id!, highlighted!) : undefined;

  return renderLayout(`${meta.title} — Reports that Matter`, body, {
    description,
    scripts: ["/assets/share.js", "/assets/highlight.js", "/assets/social-proof.js"],
    image,
  });
}
