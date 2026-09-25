import { escapeHtml } from "./layout";
import type { Citation, Editorial } from "../lib/editorial";

function pageLabel(cite: Citation): string {
  return cite.page ? `p. ${cite.page}` : "¶";
}

/** Shown before the rest fold away: enough to give the report's voice, not so many that its contents drop out of sight. */
const PASSAGES_SHOWN = 6;

/** An excerpt that starts mid-sentence says so, as a quotation in print would. */
function quoted(text: string): string {
  const opening = /^[a-z]/.test(text) ? "…" : "";
  return `“${opening}${escapeHtml(text)}”`;
}

function renderPassage(excerpt: Editorial["excerpts"][number]): string {
  return `<li>
        <a href="${escapeHtml(excerpt.cite.href)}">
          <blockquote class="serif">${quoted(excerpt.quote)}</blockquote>
          <p class="meta mono">${escapeHtml(pageLabel(excerpt.cite))}${excerpt.context ? ` · ${escapeHtml(excerpt.context)}` : ""}</p>
        </a>
      </li>`;
}

/**
 * Our layer on a report, above its contents (reportsthatmatter-g0w.4).
 *
 * Everything here is ours, and it has to look it: a kicker that says so, and a
 * note at the end that says only words in quotation marks are the report's.
 * Every finding and passage links into the text — this is a way in, not a
 * substitute for reading it.
 *
 * A draft renders only when asked for (`?draft` on the contents page), under
 * a banner, so a file can be reviewed on the real page before it is approved.
 */
export function renderEditorial(editorial: Editorial | undefined, options: { draft?: boolean } = {}): string {
  if (!editorial) return "";
  const isDraft = editorial.status !== "approved";
  if (isDraft && !options.draft) return "";

  const findings = editorial.findings
    .map(
      (finding) => `<li>
        <span class="serif">${escapeHtml(finding.text)}</span>
        <span class="finding-cites mono">${finding.cites
          .map((cite) => `<a href="${escapeHtml(cite.href)}">${escapeHtml(pageLabel(cite))}</a>`)
          .join(" ")}</span>
      </li>`
    )
    .join("");

  // Picks lead; the file's own order holds within picks and within the rest.
  const ordered = [...editorial.excerpts.filter((e) => e.pick), ...editorial.excerpts.filter((e) => !e.pick)];
  const shown = ordered.slice(0, PASSAGES_SHOWN).map(renderPassage).join("");
  const folded = ordered.slice(PASSAGES_SHOWN);
  const passages = shown
    ? `<ul class="marked-list">${shown}</ul>${
        folded.length
          ? `<details class="more-passages">
        <summary class="mono">${folded.length} more passage${folded.length === 1 ? "" : "s"}</summary>
        <ul class="marked-list">${folded.map(renderPassage).join("")}</ul>
      </details>`
          : ""
      }`
    : "";

  return `
    <section class="section wrap editorial" aria-labelledby="editorial-label">
      ${
        isDraft
          ? `<p class="editorial-draft mono">Draft — not yet approved. Visible only with <code>?draft</code>.</p>`
          : ""
      }
      <p class="section-label mono" id="editorial-label">Why it matters · Our note</p>
      <p class="editorial-lede serif">${escapeHtml(editorial.whyItMatters)}</p>
      ${
        findings
          ? `<p class="section-label mono">What it found</p>
      <ol class="findings">${findings}</ol>`
          : ""
      }
      ${
        passages
          ? `<p class="section-label mono">Passages</p>
      ${passages}`
          : ""
      }
      <p class="editorial-note mono">Summary and selection by Reports that Matter. Only the words in quotation marks are the report's; every link opens them in context.</p>
    </section>`;
}
