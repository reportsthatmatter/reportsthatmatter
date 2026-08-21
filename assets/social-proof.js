/* Social proof (#96): what other readers marked.
 *
 * The server aggregates `marks` into counts per passage; this finds those
 * passages on the page the same way a saved highlight is re-found — by
 * locating the quoted text, not by trusting a stored position — and marks
 * them with a hairline underline and a count in the margin.
 *
 * Best-effort throughout: a slow or failing fetch must never cost a reader
 * the document, only the (optional) signal about what other readers marked.
 */
// @ts-check
import { locate } from "./anchor.js";
import { buildIndex, mark, rangeFor } from "./dom-text.js";

const body = document.getElementById("report-body");

if (body) {
  const report = body.dataset.report;
  if (report) markCounts(report);
}

/**
 * @typedef {{
 *   paragraph: string, exact: string, prefix: string, suffix: string,
 *   page: number | null, readers: number
 * }} MarkCount
 */

/** @param {string} report */
async function markCounts(report) {
  /** @type {MarkCount[]} */
  let entries;
  try {
    const res = await fetch(`/reports/${encodeURIComponent(report)}/marks`);
    if (!res.ok) return;
    entries = await res.json();
  } catch (err) {
    return;
  }

  for (const entry of entries) {
    const paragraph = document.getElementById(entry.paragraph);
    if (!paragraph) continue; // a different section's paragraph, or gone since re-ingestion

    const index = buildIndex(paragraph);
    const found = locate(index.text, {
      prefix: entry.prefix,
      exact: entry.exact,
      suffix: entry.suffix,
    });
    if (!found) continue; // the quoted words are no longer here; say nothing rather than guess

    const range = rangeFor(index, found.start, found.end);
    if (!range) continue;

    const marks = mark(range, ["social-proof"]);
    if (!marks.length) continue;

    const note = document.createElement("span");
    note.className = "social-note mono";
    note.textContent = `Underlined by ${entry.readers} reader${entry.readers === 1 ? "" : "s"}`;
    marks[marks.length - 1].after(note);
  }
}
