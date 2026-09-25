import { escapeHtml } from "./layout";
import type { Citation, Editorial, Quotation } from "../lib/editorial";

function pageLabel(cite: Citation): string {
  return cite.page ? `p. ${cite.page}` : "¶";
}

/** A quotation that starts mid-sentence says so, as it would in print. */
function quoted(text: string): string {
  const opening = /^[a-z]/.test(text) ? "…" : "";
  return `“${opening}${escapeHtml(text)}”`;
}

/** A key quotation, set off from our words, with the way into its context. */
function pullQuote(quotation: Quotation): string {
  return `<figure class="landing-quote">
          <blockquote class="serif">${quoted(quotation.quote)}</blockquote>
          <figcaption class="mono"><a href="${escapeHtml(quotation.cite.href)}">${escapeHtml(pageLabel(quotation.cite))} · Read in context →</a></figcaption>
        </figure>`;
}

/**
 * Should this report's landing page carry our layer? Only an approved file,
 * unless a draft is being previewed with `?draft`.
 */
export function showsEditorial(editorial: Editorial | undefined, draft?: boolean): editorial is Editorial {
  return Boolean(editorial && (editorial.status === "approved" || draft));
}

/**
 * The standfirst under a report's title (reportsthatmatter-g0w.8): the one
 * paragraph that says why a reader arriving cold should care.
 */
export function renderStandfirst(editorial: Editorial): string {
  return `<p class="landing-standfirst serif">${escapeHtml(editorial.whyItMatters)}</p>`;
}

/**
 * The rest of a report's landing page, between its header and its contents
 * (reportsthatmatter-g0w.8): what the report was about, what it found, and
 * where to start reading.
 *
 * Everything here is ours, and it has to look it: a note says so up front,
 * and the report's own words appear only as marked quotations. Every finding
 * and every quotation links into the text — this is a way in, not a
 * substitute for reading it.
 */
export function renderLanding(editorial: Editorial, reportId: string): string {
  const background = editorial.background.length
    ? `
    <section class="section wrap landing-section" aria-labelledby="landing-background">
      <div class="measure">
        <h2 class="section-label mono" id="landing-background">Background</h2>
        <div class="landing-prose">${editorial.background.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>
      </div>
    </section>`
    : "";

  const findings = editorial.findings.length
    ? `
    <section class="section wrap landing-section" aria-labelledby="landing-findings">
      <div class="measure">
        <h2 class="section-label mono" id="landing-findings">What it found</h2>
        <ol class="landing-findings">${editorial.findings
          .map(
            (finding) => `
          <li>
            <p class="serif">${escapeHtml(finding.text)} <span class="landing-cites mono">${finding.cites
              .map((cite) => `<a href="${escapeHtml(cite.href)}">${escapeHtml(pageLabel(cite))}</a>`)
              .join(" ")}</span></p>
            ${finding.excerpt ? pullQuote(finding.excerpt) : ""}
          </li>`
          )
          .join("")}
        </ol>
      </div>
    </section>`
    : "";

  const guide = editorial.readingGuide.length
    ? `
    <section class="section wrap landing-section" aria-labelledby="landing-guide">
      <div class="measure">
        <h2 class="section-label mono" id="landing-guide">Where to start reading</h2>
        <p class="landing-intro">Short on time? These sections carry the report's argument. Each opens at the start of the section.</p>
        <ol class="landing-guide">${editorial.readingGuide
          .map(
            (item) => `
          <li>
            <a class="landing-guide-title" href="/reports/${escapeHtml(reportId)}/${escapeHtml(item.slug)}">
              <span class="serif">${escapeHtml(item.title)}</span>
              <span class="mono">${item.page ? `p. ${escapeHtml(item.page)} · ` : ""}Read →</span>
            </a>
            <p>${escapeHtml(item.why)}</p>
            ${item.excerpt ? pullQuote(item.excerpt) : ""}
          </li>`
          )
          .join("")}
        </ol>
      </div>
    </section>`
    : "";

  return `
    ${background}
    ${findings}
    ${guide}`;
}

/** The line that says, up front, whose words these are — and flags a draft under review. */
export function renderOurNote(editorial: Editorial): string {
  const draft =
    editorial.status !== "approved"
      ? `<p class="landing-draft mono">Draft — not yet approved. Visible only with <code>?draft</code>.</p>`
      : "";
  return `${draft}<p class="landing-note mono">Introduction by Reports that Matter. Only words in quotation marks are the report's own; every link opens them in context.</p>`;
}
