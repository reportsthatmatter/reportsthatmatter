/* Social proof (#96): what other readers marked.
 *
 * The server aggregates `marks` into counts per passage; this finds those
 * passages on the page the same way a saved highlight is re-found — by
 * locating the quoted text, not by trusting a stored position — and marks
 * them the same way a highlight is ever marked: the .hl wash, not a
 * different visual language. What varies is the strength of it, not a
 * printed number — readers said an underline read as a wiki link, and a
 * count in the margin fights the sidenote column for the same space.
 * The count is still there for anyone who wants it, as a hover title.
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

/** Same hue as .hl (assets/styles.css), always fainter — this is ambient, not the one thing you're looking at. */
const MIN_ALPHA = 0.16;
const MAX_ALPHA = 0.4;
/** Reader counts at or above this all read as "fully" marked; the point is a felt gradient, not a precise scale. */
const ALPHA_SATURATES_AT = 6;

/** @param {number} readers @returns {string} */
function washFor(readers) {
  const t = Math.min(Math.max(readers, 1), ALPHA_SATURATES_AT) / ALPHA_SATURATES_AT;
  const alpha = MIN_ALPHA + t * (MAX_ALPHA - MIN_ALPHA);
  return `rgba(255, 232, 138, ${alpha.toFixed(2)})`;
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
    const title = `Highlighted by ${entry.readers} reader${entry.readers === 1 ? "" : "s"}`;
    for (const element of marks) {
      element.style.background = washFor(entry.readers);
      element.title = title;
    }
  }
}
