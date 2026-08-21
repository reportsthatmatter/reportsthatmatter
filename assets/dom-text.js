/* Mapping between a paragraph's readable text and its DOM.
 *
 * Anchors are expressed against the text a reader sees: one space between
 * words, no sidenote numbers, no permalink glyph. The DOM holds something
 * else — the same prose broken across text nodes by that markup, with the
 * line breaks the PDF left behind. This module is the map between the two, so
 * a selection can become an anchor and an anchor can become a selection.
 *
 * Not unit-tested here: every function needs a real DOM, and the suite runs in
 * node. The browser checks in scripts/e2e.mjs cover it end to end, which is
 * the behaviour that matters anyway — select part of a paragraph, follow the
 * link, land on those exact words.
 */
// @ts-check

/**
 * @typedef {{ node: Text, offset: number }} Point
 * @typedef {{ text: string, map: Point[] }} Index
 */

/** Markup whose text is not part of the prose and must never land in a quote. */
const NOT_PROSE = ".sidenote, .permalink, .page-marker, .sidenote-toggle, .sidenote-expand";

/**
 * Build the readable text of `root`, with a DOM point for every character.
 *
 * @param {Element} root
 * @returns {Index}
 */
export function buildIndex(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  /** @type {Point[]} */
  const map = [];

  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode);
    if (node.parentElement && node.parentElement.closest(NOT_PROSE)) continue;

    const raw = node.data;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (/\s/.test(char)) {
        // A run of whitespace, however it was spelled, reads as one space —
        // and a space at the very start is not text a reader sees at all.
        if (text.length === 0 || text.endsWith(" ")) continue;
        text += " ";
      } else if (char === "¶") {
        continue;
      } else {
        text += char;
      }
      map.push({ node, offset: i });
    }
  }

  // A trailing space belongs to no word.
  while (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }

  return { text, map };
}

/**
 * Where a DOM point falls in the readable text, or -1 if it is not in it.
 *
 * @param {Index} index
 * @param {Node} node
 * @param {number} offset
 * @returns {number}
 */
export function indexOfPoint(index, node, offset) {
  for (let i = 0; i < index.map.length; i++) {
    const point = index.map[i];
    if (point.node === node && point.offset >= offset) return i;
  }
  return -1;
}

/**
 * A DOM range covering `[start, end)` of the readable text.
 *
 * @param {Index} index
 * @param {number} start
 * @param {number} end
 * @returns {Range | null}
 */
export function rangeFor(index, start, end) {
  const first = index.map[start];
  const last = index.map[end - 1];
  if (!first || !last) return null;

  const range = first.node.ownerDocument.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}
