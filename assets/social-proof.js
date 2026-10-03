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

/** Set once an editor's highlight is marked, so the page can say what the shading is. */
let editorOnPage = false;

/** Same hue as .hl (assets/styles.css), always fainter — this is ambient, not the one thing you're looking at. */
const MIN_ALPHA = 0.16;
const MAX_ALPHA = 0.4;
/** Reader counts at or above this all read as "fully" marked; the point is a felt gradient, not a precise scale. */
const ALPHA_SATURATES_AT = 6;

/**
 * What the server said was marked on this report, once it has said it ([] if
 * it could not). The landing panel (passage-panel.js) reads it to tell the
 * editor's highlight from a reader's, rather than asking again.
 * @type {Promise<MarkCount[]>}
 */
export const marksLoaded = body && body.dataset.report ? markCounts(body.dataset.report) : Promise.resolve([]);

/** @param {number} readers @returns {string} */
function washFor(readers) {
  const t = Math.min(Math.max(readers, 1), ALPHA_SATURATES_AT) / ALPHA_SATURATES_AT;
  const alpha = MIN_ALPHA + t * (MAX_ALPHA - MIN_ALPHA);
  return `rgba(255, 232, 138, ${alpha.toFixed(2)})`;
}

/**
 * @typedef {{
 *   paragraph: string, exact: string, prefix: string, suffix: string,
 *   page: number | null, readers: number, editor?: boolean
 * }} MarkCount
 */

/** @param {string} report @returns {Promise<MarkCount[]>} */
async function markCounts(report) {
  /** @type {MarkCount[]} */
  let entries;
  try {
    const res = await fetch(`/reports/${encodeURIComponent(report)}/marks`);
    if (!res.ok) return [];
    entries = await res.json();
  } catch (err) {
    return [];
  }
  if (!Array.isArray(entries)) return [];

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

    const marks = mark(range, entry.editor ? ["social-proof", "editor"] : ["social-proof"]);
    const title = markedTitle(entry);
    for (const element of marks) {
      // The editor's own highlight reads at the weight of one reader: it is a
      // pointer, not a crowd (decision 0014).
      element.style.background = washFor(Math.max(entry.readers, 1));
      element.title = title;
    }
    if (entry.editor) editorOnPage = true;
  }

  if (editorOnPage) addKey();
  return entries;
}


/**
 * Who marked a passage, in words. The editor's highlights are never counted as
 * readers and never pose as one (decision 0014).
 * @param {MarkCount} entry @returns {string}
 */
export function markedTitle(entry) {
  const readers = entry.readers
    ? `${entry.readers} reader${entry.readers === 1 ? "" : "s"}`
    : "";
  if (entry.editor) return readers ? `Editor’s highlight · also marked by ${readers}` : "Editor’s highlight";
  return `Highlighted by ${readers}`;
}

/** One line under the page header saying what the shading is, once a page has an editor's highlight. */
function addKey() {
  const header = document.querySelector(".report-header .measure");
  if (!header || header.querySelector(".marks-key")) return;
  const key = document.createElement("p");
  key.className = "byline mono marks-key";
  key.innerHTML = '<span class="marks-key-swatch" aria-hidden="true"></span>Shaded: the editor’s highlights and passages readers marked';
  header.appendChild(key);
}
