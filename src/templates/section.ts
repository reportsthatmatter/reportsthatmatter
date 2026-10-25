import { renderLayout, escapeHtml } from "./layout";
import type { Section } from "@rtm/ingest";
import type { ReportMeta } from "./report";
import { HEAVY_FULL_WORDS } from "../lib/preview-agents";
import { quotedPassage, truncate, shareImage, shareImageAlt, sharedUrl, frontispiece, publicationYear, sourceAttributes } from "./report";
import { SITE_ORIGIN } from "./site";
import { reportJsonLd, sectionJsonLd, citationMeta } from "../lib/structured-data";
import { reportTitle, sectionTitle } from "../lib/titles";
import { renderHero, renderLanding, renderOurNote, renderStandfirst, showsEditorial } from "./editorial";
import type { Editorial } from "../lib/editorial";
import { renderSignup, SIGNUP_SCRIPT } from "./newsletter";

/** What the page shell needs of a section — not its html. */
type SectionRef = Pick<Section, "slug" | "title">;

/**
 * The title, description and share image for one section page.
 *
 * Takes the quoted text rather than deriving it, for the same reason
 * `reportPreview` does: the `?p=` path extracts it from the section it is
 * already serving, never from the whole report.
 */
export function sectionPreview(
  meta: ReportMeta,
  section: SectionRef,
  quoted: string | null,
  highlighted?: string,
  anchor?: string
): { title: string; description: string; image?: string; imageAlt: string; url: string; canonical: string; structuredData: string } {
  const reportPath = `/reports/${meta.id ?? ""}`;
  const description = quoted
    ? `“${truncate(quoted, 280)}” — ${meta.title}`
    : `${section.title} — ${meta.title}. Read the full text with linkable paragraphs.`;

  return {
    title: sectionTitle(meta, section),
    description,
    image: shareImage(meta, highlighted, anchor),
    imageAlt: shareImageAlt(meta, quoted),
    url: sharedUrl(`${reportPath}/${section.slug}`, highlighted, anchor),
    canonical: `${SITE_ORIGIN}${reportPath}/${section.slug}`,
    structuredData: sectionJsonLd(meta, section, description),
  };
}

/** A passage other readers marked, ready to show back (#96). */
export type TopPassage = {
  quote: string;
  url: string;
  readers: number;
  page: number | null;
  /** The editor highlighted it: labelled so, never counted as a reader (decision 0014). */
  editor?: boolean;
};

/** "Editor's highlight · 2 readers", "3 readers": who marked a passage, the editor named apart. */
export function markedBy(passage: Pick<TopPassage, "readers" | "editor">): string {
  const readers = passage.readers ? `${passage.readers} reader${passage.readers === 1 ? "" : "s"}` : "";
  return [passage.editor ? "Editor’s highlight" : "", readers].filter(Boolean).join(" · ");
}

function renderMostMarked(topMarked: TopPassage[]): string {
  if (!topMarked.length) return "";

  const items = topMarked
    .map(
      (passage) => `<li>
        <a href="${escapeHtml(passage.url)}">
          <blockquote class="serif">“${escapeHtml(truncate(passage.quote, 220))}”</blockquote>
          <p class="meta mono">${passage.page ? `p. ${passage.page} · ` : ""}${escapeHtml(markedBy(passage))}</p>
        </a>
      </li>`
    )
    .join("");

  return `
    <section class="section wrap marked-section">
      <p class="section-label mono">Most marked passages</p>
      <ul class="marked-list">${items}</ul>
    </section>`;
}

/** Contents for a report: the spine a 169-page document needs. */
export function renderReportOverview(
  meta: ReportMeta,
  // Only structural fields — the contents listing never reads a section's
  // html, and #115's pre-rendered path only has that much to give it.
  sections: Pick<Section, "slug" | "title" | "level" | "page">[],
  stats: { words: number; pages?: number },
  topMarked: TopPassage[] = [],
  options: { processingNotes?: boolean; editorial?: Editorial; draft?: boolean } = {}
): string {
  const byline = [meta.authors, meta.published_at].filter(Boolean).join(" · ");
  const year = publicationYear(meta);
  // Our layer turns this page into the report's landing page (g0w.8); without
  // one it is the contents page it always was.
  const editorial = showsEditorial(options.editorial, options.draft) ? options.editorial : undefined;

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

  // A hero photograph replaces the plate on the landing page: two images
  // compete (reportsthatmatter-cdp.1). The plate stays everywhere else.
  const hero = editorial?.hero;

  const body = `
<main>
  <article>
    ${hero ? renderHero(hero) : ""}
    <header class="report-header wrap${hero ? " has-hero" : ""}">
      <div class="measure">
        ${hero ? "" : frontispiece(meta.id)}
        <p class="kicker mono">Report${year ? ` · <span class="kicker-year">${escapeHtml(year)}</span>` : ""}</p>
        <h1>${escapeHtml(meta.title)}</h1>
        ${editorial ? renderStandfirst(editorial) : ""}
        ${byline ? `<p class="byline mono">${escapeHtml(byline)}</p>` : ""}
        <p class="byline mono">${stats.pages ? `${stats.pages} pages · ` : ""}${stats.words.toLocaleString("en-GB")} words · ${sections.length} sections</p>
        ${
          meta.source_url
            ? `<p class="byline mono"><a href="${escapeHtml(meta.source_url)}" rel="nofollow">Original document ↗</a></p>`
            : ""
        }
        ${
          options.processingNotes
            ? `<p class="byline mono"><a href="/reports/${escapeHtml(meta.id ?? "")}/processing">About this edition →</a></p>`
            : ""
        }
        <form class="search-form report-search" method="get" action="/search">
          <input type="hidden" name="report" value="${escapeHtml(meta.id ?? "")}" />
          <input type="search" name="q" placeholder="Search this report…" aria-label="Search this report" />
          <button type="submit">Search</button>
        </form>
        ${editorial ? renderOurNote(editorial) : ""}
      </div>
    </header>
    ${editorial ? renderLanding(editorial, meta.id ?? "") : ""}
    <section class="section wrap">
      <p class="section-label mono">Contents</p>
      <ul class="report-list">${items}</ul>
      <p class="mono" style="margin-top:2rem">
        ${
          // Decision 0019 (E): a report whose /full is several MB says so, so a phone reader does not load it by accident.
          stats.words >= HEAVY_FULL_WORDS
            ? `<a href="/reports/${escapeHtml(meta.id ?? "")}/full" data-heavy-full>Read the whole report on one page (about ${Math.round((stats.words * 10) / 1_000_000)} MB: slow on a phone, best on a computer) →</a>`
            : `<a href="/reports/${escapeHtml(meta.id ?? "")}/full">Read the whole report on one page →</a>`
        }
      </p>
    </section>
    ${
      // A landing page is our introduction and a reading guide, nothing more
      // (Rufus, 2026-09-25): marked passages show in the text itself.
      editorial ? "" : renderMostMarked(topMarked)
    }
  </article>
  ${renderSignup(`report:${meta.id ?? ""}`)}
</main>
<script src="/assets/find-anchor.js" defer></script>`;

  // An approved "why it matters" is the best one-line answer to "what is this?"
  // there is — better in a search result than a title and a byline.
  const description =
    options.editorial?.status === "approved"
      ? options.editorial.whyItMatters
      : `${meta.title}${byline ? ` — ${byline}` : ""}. Read the full text with linkable paragraphs.`;

  return renderLayout(reportTitle(meta), body, {
    description,
    image: shareImage(meta),
    imageAlt: meta.title,
    url: `${SITE_ORIGIN}/reports/${meta.id ?? ""}`,
    follow: true,
    scripts: [SIGNUP_SCRIPT],
    extraMeta: citationMeta(meta),
    structuredData: reportJsonLd(meta, description),
    // A draft shown for review must not be what a search engine keeps.
    noindex: Boolean(options.draft && options.editorial && options.editorial.status !== "approved"),
  });
}

/**
 * Where this text comes from, on every section page (decision hbnj): a reader who lands on one
 * section, or reads it without the landing panel, still sees the official document and the
 * edition notes, as the report's landing page shows them.
 */
function sectionSourceLine(meta: ReportMeta, processingNotes = false): string {
  const links = [
    meta.source_url ? `<a href="${escapeHtml(meta.source_url)}" rel="nofollow">Original document ↗</a>` : "",
    processingNotes ? `<a href="/reports/${escapeHtml(meta.id ?? "")}/processing">About this edition →</a>` : "",
  ].filter(Boolean);
  return links.length ? `<p class="byline mono">${links.join(" · ")}</p>` : "";
}

/** One section of a report. */
export function renderSection(
  meta: ReportMeta,
  /** Every section, for the contents link and prev/next — no html needed. */
  sections: SectionRef[],
  index: number,
  /** This section's body, as pre-rendered (content-publishing plan §2). */
  html: string,
  highlighted?: string,
  /** Quote anchor from `?h=`, naming the words within that paragraph. */
  anchor?: string,
  options: { processingNotes?: boolean } = {}
): string {
  const section = sections[index];
  const previous = sections[index - 1];
  const next = sections[index + 1];
  const reportPath = `/reports/${meta.id ?? ""}`;

  const quoted = highlighted ? quotedPassage(html, highlighted, anchor) : null;
  const preview = sectionPreview(meta, section, quoted, highlighted, anchor);
  const { title, description, image, structuredData } = preview;

  const body = `
<main>
  <article>
    <header class="report-header wrap">
      <div class="measure">
        <p class="kicker mono"><a href="${escapeHtml(reportPath)}">${escapeHtml(meta.title)}</a>${publicationYear(meta) ? ` · ${escapeHtml(publicationYear(meta)!)}` : ""}</p>
        <h1>${escapeHtml(section.title)}</h1>
        <p class="byline mono">Section ${index + 1} of ${sections.length}</p>
        ${sectionSourceLine(meta, options.processingNotes)}
      </div>
    </header>
    <div class="prose wrap measure" id="report-body"
      data-report="${escapeHtml(meta.id ?? "")}"
      data-report-title="${escapeHtml(meta.title)}"
      data-section="${escapeHtml(section.slug)}"
      data-section-title="${escapeHtml(section.title)}"
      ${sourceAttributes(meta, options.processingNotes)}>
      ${html}
    </div>
    <nav class="section-nav wrap measure mono">
      ${previous ? `<a class="prev" href="${escapeHtml(reportPath)}/${escapeHtml(previous.slug)}">← ${escapeHtml(previous.title)}</a>` : "<span></span>"}
      <a class="contents" href="${escapeHtml(reportPath)}">Contents</a>
      ${next ? `<a class="next" href="${escapeHtml(reportPath)}/${escapeHtml(next.slug)}">${escapeHtml(next.title)} →</a>` : "<span></span>"}
    </nav>
  </article>
  ${renderSignup(`report:${meta.id ?? ""}`, { compact: true })}
</main>
<div class="share-pop" id="share-pop" role="dialog" aria-label="Share selection">
  <button type="button" data-action="share" hidden>Share</button>
  <button type="button" data-action="copy-link">Copy link</button>
  <button type="button" data-action="copy-quote">Copy quote</button>
  <button type="button" data-action="save">Save</button>
</div>`;

  return renderLayout(title, body, {
    description,
    scripts: ["/assets/share.js", "/assets/highlight.js", "/assets/social-proof.js", SIGNUP_SCRIPT],
    image,
    imageAlt: preview.imageAlt,
    url: preview.url,
    canonical: preview.canonical,
    structuredData,
  });
}
