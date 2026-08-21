/* Marking passages: the one a link points at, and the ones a reader kept.
 *
 * A link carrying ?h= names words, not a paragraph. This finds them and marks
 * them. When the words are gone — the report was re-ingested and that sentence
 * genuinely changed — it falls back to marking the paragraph and says so,
 * because the one thing a citation must never do is quietly resolve to
 * different words.
 *
 * Saved highlights are re-found the same way, so a reader's marks survive the
 * document being improved underneath them.
 *
 * Runs on every device: reading a shared quote is not a desktop activity, even
 * though making one currently is.
 */
// @ts-check
import { decodeAnchor, locate } from "./anchor.js";
import { buildIndex, rangeFor } from "./dom-text.js";
import { createStore } from "./highlights-store.js";

const body = document.getElementById("report-body");

if (body) {
  markSaved();
  markLinked();
}

/** The passage this link points at, if it points at one. */
function markLinked() {
  const params = new URLSearchParams(window.location.search);
  const anchor = decodeAnchor(params.get("h"));
  if (!anchor) return;

  const paragraphId = params.get("p") || window.location.hash.slice(1);
  const paragraph = paragraphId ? document.getElementById(paragraphId) : null;
  const scope = paragraph || body;
  if (!scope) return;

  const index = buildIndex(scope);
  const found = locate(index.text, anchor);
  if (found) {
    const range = rangeFor(index, found.start, found.end);
    if (range) {
      const element = mark(range, ["hl"]);
      if (element) {
        element.dataset.tier = found.tier;
        element.scrollIntoView({ block: "center" });
        return;
      }
    }
  }

  if (paragraph) {
    // The quoted words are not here any more. Show the paragraph the quote came
    // from rather than guessing which words were meant.
    paragraph.classList.add("hl-lost");
    paragraph.scrollIntoView({ block: "center" });
  }
}

/** Everything this reader has kept on this page. */
function markSaved() {
  const store = createStore(window.localStorage);
  const report = body && body.dataset.report;
  if (!report) return;

  for (const held of store.forReport(report)) {
    const paragraph = document.getElementById(held.paragraph);
    if (!paragraph) continue;

    const index = buildIndex(paragraph);
    // No anchor means the whole paragraph was kept — there were no particular
    // words to name, so the whole of it is what gets marked.
    const found = held.anchor
      ? locate(index.text, decodeAnchor(held.anchor))
      : { start: 0, end: index.text.length };
    if (!found) continue;

    const range = rangeFor(index, found.start, found.end);
    if (range) {
      const element = mark(range, ["hl", "saved"]);
      if (element) element.dataset.highlight = held.id;
    }
  }
}

/**
 * Wrap a range in a mark, tolerating a range that crosses element boundaries.
 *
 * @param {Range} range
 * @param {string[]} classes
 * @returns {HTMLElement | null}
 */
function mark(range, classes) {
  const element = document.createElement("mark");
  element.className = classes.join(" ");

  try {
    range.surroundContents(element);
  } catch (err) {
    try {
      element.appendChild(range.extractContents());
      range.insertNode(element);
    } catch (nested) {
      return null;
    }
  }

  return element;
}
