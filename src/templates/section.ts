import { renderLayout, escapeHtml } from "./layout";
import { cardPath } from "./card";
import { CARDS } from "../generated/cards";
import type { Section } from "../lib/sections";
import type { ReportMeta } from "./report";
import { extractParagraph } from "./report";
import { reportJsonLd, breadcrumbJsonLd } from "../lib/structured-data";

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit)}…`;
}

/** Contents for a report: the spine a 169-page document needs. */
export function renderReportOverview(
  meta: ReportMeta,
  sections: Section[],
  stats: { words: number; pages?: number }
): string {
  const byline = [meta.authors, meta.published_at].filter(Boolean).join(" · ");

  const items = sections
    .map((section) => {
      const isSub = section.level === 3;
      return `<li${isSub ? ' class="sub"' : ""}>
        <a href="/reports/${escapeHtml(meta.id ?? "")}/${escapeHtml(section.slug)}">
          <span class="title serif${isSub ? " sub" : ""}">${escapeHtml(section.title)}</span>
          ${section.page ? `<span class="meta mono">p. ${escapeHtml(section.page)}</span>` : "<span></span>"}
          <span class="cue mono">Read →</span>
        </a>
      </li>`;
    })
    .join("");

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono">Report</p>
        <h1>${escapeHtml(meta.title)}</h1>
        ${byline ? `<p class="byline mono">${escapeHtml(byline)}</p>` : ""}
        <p class="byline mono">${stats.pages ? `${stats.pages} pages · ` : ""}${stats.words.toLocaleString("en-GB")} words · ${sections.length} sections</p>
        ${
          meta.source_url
            ? `<p class="byline mono"><a href="${escapeHtml(meta.source_url)}" rel="nofollow">Original document ↗</a></p>`
            : ""
        }
      </div>
    </header>

    <section class="section wrap">
      <p class="section-label mono">Contents</p>
      <ul class="report-list">${items}</ul>
      <p class="mono" style="margin-top:2rem">
        <a href="/reports/${escapeHtml(meta.id ?? "")}/full">Read the whole report on one page →</a>
      </p>
    </section>
  </article>
</main>
<script src="/assets/find-anchor.js" defer></script>`;

  const description = `${meta.title}${byline ? ` — ${byline}` : ""}. Read the full text with linkable paragraphs.`;

  return renderLayout(`${meta.title} — Reports that Matter`, body, {
    description,
    structuredData: reportJsonLd(meta, description),
  });
}

/** One section of a report. */
export function renderSection(
  meta: ReportMeta,
  sections: Section[],
  index: number,
  highlighted?: string
): string {
  const section = sections[index];
  const previous = sections[index - 1];
  const next = sections[index + 1];
  const reportPath = `/reports/${meta.id ?? ""}`;

  const quoted = highlighted ? extractParagraph(section.html, highlighted) : null;
  const description = quoted
    ? `“${truncate(quoted, 280)}” — ${meta.title}`
    : `${section.title} — ${meta.title}. Read the full text with linkable paragraphs.`;

  const cardKey = meta.id && highlighted ? `${meta.id}/${highlighted}` : null;
  const image = cardKey && CARDS.has(cardKey) ? cardPath(meta.id!, highlighted!) : undefined;

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono"><a href="${escapeHtml(reportPath)}">${escapeHtml(meta.title)}</a></p>
        <h1>${escapeHtml(section.title)}</h1>
        <p class="byline mono">Section ${index + 1} of ${sections.length}</p>
      </div>
    </header>
    <div class="prose wrap measure" id="report-body">
      ${section.html}
    </div>
    <nav class="section-nav wrap measure mono">
      ${previous ? `<a class="prev" href="${escapeHtml(reportPath)}/${escapeHtml(previous.slug)}">← ${escapeHtml(previous.title)}</a>` : "<span></span>"}
      <a class="contents" href="${escapeHtml(reportPath)}">Contents</a>
      ${next ? `<a class="next" href="${escapeHtml(reportPath)}/${escapeHtml(next.slug)}">${escapeHtml(next.title)} →</a>` : "<span></span>"}
    </nav>
  </article>
</main>
<div class="share-pop" id="share-pop" role="dialog" aria-label="Share selection">
  <button type="button" data-action="copy-link">Copy link</button>
  <button type="button" data-action="copy-quote">Copy quote</button>
</div>`;

  return renderLayout(`${section.title} — ${meta.title} — Reports that Matter`, body, {
    description,
    scripts: ["/assets/share.js"],
    image,
    structuredData: breadcrumbJsonLd([
      { name: "Reports", path: "/reports" },
      { name: meta.title, path: reportPath },
      { name: section.title, path: `${reportPath}/${section.slug}` },
    ]),
  });
}
