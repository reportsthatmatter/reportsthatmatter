/* Marking the passage a link points at.
 *
 * A link carrying ?h= names words, not a paragraph. This finds them and marks
 * them. When the words are gone — the report was re-ingested and that sentence
 * genuinely changed — it falls back to marking the paragraph and says so,
 * because the one thing a citation must never do is quietly resolve to
 * different words.
 *
 * Runs on every device: reading a shared quote is not a desktop activity, even
 * though making one currently is.
 */
// @ts-check
import { decodeAnchor, locate } from "./anchor.js";
import { buildIndex, rangeFor } from "./dom-text.js";

const params = new URLSearchParams(window.location.search);
const anchor = decodeAnchor(params.get("h"));
const paragraphId = params.get("p") || window.location.hash.slice(1);

if (anchor) {
  const body = document.getElementById("report-body");
  const paragraph = paragraphId ? document.getElementById(paragraphId) : null;
  const scope = paragraph || body;

  if (scope) {
    const index = buildIndex(scope);
    const found = locate(index.text, anchor);

    if (found) {
      const range = rangeFor(index, found.start, found.end);
      if (range) mark(range, found.tier);
    } else if (paragraph) {
      // The quoted words are not here any more. Show the paragraph the quote
      // came from rather than guessing which words were meant.
      paragraph.classList.add("hl-lost");
      paragraph.scrollIntoView({ block: "center" });
    }
  }
}

/**
 * @param {Range} range
 * @param {string} tier
 */
function mark(range, tier) {
  const element = document.createElement("mark");
  element.className = "hl";
  // A quote found only by its own words, its surroundings having changed, is
  // still the right words — but worth recording for anyone debugging a link.
  element.dataset.tier = tier;

  try {
    range.surroundContents(element);
  } catch (err) {
    // The selection crosses an element boundary, so it cannot be wrapped in
    // one node. Extracting and re-inserting handles it.
    element.appendChild(range.extractContents());
    range.insertNode(element);
  }

  element.scrollIntoView({ block: "center" });
}
