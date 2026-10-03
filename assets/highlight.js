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
 * Runs on every device: reading a shared quote is not a desktop activity.
 * A link that names words also gets a landing panel (passage-panel.js).
 */
// @ts-check
import { decodeAnchor, locate } from "./anchor.js";
import { buildIndex, mark, rangeFor } from "./dom-text.js";
import { createStore } from "./highlights-store.js";
import { showPassagePanel } from "./passage-panel.js";

/** Where the linked words land on screen: high enough to clear the panel below them. */
const LAND_AT = 0.3;

const body = document.getElementById("report-body");

if (body) {
  markSaved();
  markLinked();
}

/**
 * Find anchored text, looking in the paragraph it was made in before looking
 * at the whole page.
 *
 * Paragraph first because it is the precise answer and a small haystack. Page
 * second because a selection can span a paragraph break, and because a
 * paragraph may have been renamed since the link was made.
 *
 * @param {import("./anchor.js").Selector | null} anchor
 * @param {string | null} paragraphId
 * @returns {Range | null}
 */
function findAnchored(anchor, paragraphId) {
  const paragraph = paragraphId ? document.getElementById(paragraphId) : null;

  for (const scope of [paragraph, body]) {
    if (!scope) continue;
    const index = buildIndex(scope);
    const found = locate(index.text, anchor);
    if (found) return rangeFor(index, found.start, found.end);
  }

  return null;
}

/** The passage this link points at, if it points at one. */
function markLinked() {
  const params = new URLSearchParams(window.location.search);
  const anchor = decodeAnchor(params.get("h"));
  if (!anchor) return;

  const paragraphId = params.get("p") || window.location.hash.slice(1);
  const range = findAnchored(anchor, paragraphId);

  if (range) {
    const marks = mark(range, ["hl"]);
    if (marks.length) {
      // The link named words, so the paragraph-wide wash is redundant — and
      // two overlapping highlights read as one smudge.
      body?.setAttribute("data-quote-marked", "true");
      // Room below the last line, so words near the end of a section can
      // still scroll clear of the landing panel. Added below everything, so
      // nothing on screen moves.
      document.documentElement.classList.add("passage-landing");
      // WebKit scrolls back to the link's #fragment (the paragraph's top)
      // whenever the viewport resizes, e.g. as Safari's toolbars come and go,
      // which would put the words under the panel. The query names them; the
      // fragment has done its work.
      if (window.location.hash) {
        history.replaceState(history.state, "", window.location.pathname + window.location.search);
      }
      landOn(marks[0]);
      if (body) {
        showPassagePanel({
          body,
          marks,
          paragraph: marks[0].closest("p[id]"),
          exact: /** @type {import("./anchor.js").Selector} */ (anchor).exact,
        });
      }
      return;
    }
  }

  // The quoted words are not here any more. Show the paragraph the quote came
  // from rather than guessing which words were meant.
  const paragraph = paragraphId ? document.getElementById(paragraphId) : null;
  if (paragraph) {
    paragraph.classList.add("hl-lost");
    paragraph.scrollIntoView({ block: "center" });
  }
}

/**
 * Bring the marked words into view a third of the way down the screen, so the
 * landing panel fixed to the bottom does not cover them. The page is scrolled,
 * never shifted: nothing is inserted into the text to make room.
 * @param {HTMLElement} element
 */
function landOn(element) {
  const go = () => {
    const rect = element.getBoundingClientRect();
    const top = rect.top + window.scrollY - window.innerHeight * LAND_AT;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  };
  go();
  // WebKit scrolls to the link's #fragment at load, after this has run, and
  // web fonts arriving reflow the text: land again then, unless the reader
  // has already started moving about the page.
  let moved = false;
  const stop = () => {
    moved = true;
  };
  for (const type of ["touchstart", "wheel", "keydown", "mousedown"]) {
    window.addEventListener(type, stop, { once: true, passive: true });
  }
  const again = () => {
    if (!moved) go();
  };
  if (document.readyState === "complete") requestAnimationFrame(again);
  else window.addEventListener("load", () => requestAnimationFrame(again), { once: true });
  document.fonts?.ready.then(again);
}

/** Everything this reader has kept on this page. */
function markSaved() {
  const store = createStore(window.localStorage);
  const report = body && body.dataset.report;
  if (!report) return;

  for (const held of store.forReport(report)) {
    const paragraph = document.getElementById(held.paragraph);
    if (!paragraph) continue;

    let range;
    if (held.anchor) {
      range = findAnchored(decodeAnchor(held.anchor), held.paragraph);
    } else {
      // No anchor means the whole paragraph was kept — there were no
      // particular words to name, so the whole of it is what gets marked.
      const index = buildIndex(paragraph);
      range = rangeFor(index, 0, index.text.length);
    }
    if (!range) continue;

    for (const element of mark(range, ["hl", "saved"])) {
      element.dataset.highlight = held.id;
    }
  }
}
