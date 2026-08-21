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
const NOT_PROSE =
  ".sidenote, .permalink, .page-marker, .sidenote-toggle, .sidenote-expand, .social-note";

/**
 * Is this text node part of the prose?
 *
 * Shared so that what gets *marked* is exactly what got *indexed*. When the
 * two disagree, a highlight spanning a paragraph break paints the sidenote,
 * the footnote number and the printed page number along with the words.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isProse(node) {
  const parent = node.parentElement;
  return Boolean(parent) && !parent.closest(NOT_PROSE);
}

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
    if (!isProse(node)) continue;

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
 * Resolve a DOM point onto a text node.
 *
 * A selection's endpoints are rarely inside a text node. Dragging from just
 * before the first word gives the paragraph element and an offset into its
 * children; ending on a boundary gives an offset equal to a node's length.
 * Both are ordinary, and both used to be treated as "not found".
 *
 * @param {Node} node
 * @param {number} offset
 * @returns {{ node: Node, offset: number }}
 */
function resolvePoint(node, offset) {
  while (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length) {
    if (offset < node.childNodes.length) {
      node = node.childNodes[offset];
      offset = 0;
      continue;
    }
    // A point after the last child is the end of that child's content.
    node = node.childNodes[node.childNodes.length - 1];
    offset =
      node.nodeType === Node.TEXT_NODE
        ? /** @type {Text} */ (node).data.length
        : node.childNodes.length;
  }
  return { node, offset };
}

/**
 * How many characters of the readable text precede this DOM point.
 *
 * Never fails: a point before everything is 0, a point after everything is the
 * length of the text, and a point inside markup the text skips — a sidenote,
 * the permalink glyph — is the position of the next character that survives.
 * Returning "not found" was the bug that made a selection ending on a node
 * boundary quietly share as a link to the whole paragraph.
 *
 * @param {Index} index
 * @param {Node} node
 * @param {number} offset
 * @returns {number}
 */
export function indexOfPoint(index, node, offset) {
  const point = resolvePoint(node, offset);

  for (let i = 0; i < index.map.length; i++) {
    const entry = index.map[i];
    if (entry.node === point.node) {
      if (entry.offset >= point.offset) return i;
      continue;
    }
    if (point.node.compareDocumentPosition(entry.node) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return i;
    }
  }

  return index.map.length;
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

/**
 * Mark a range, one text node at a time.
 *
 * Wrapping the range in a single element only works when it sits inside one
 * element. A quote that crosses a footnote marker, an emphasis, or a paragraph
 * boundary cannot be wrapped that way — and those are ordinary selections, not
 * edge cases. Marking each text node the range touches works for all of them.
 *
 * Shared between `highlight.js` (a reader's own marks) and `social-proof.js`
 * (what other readers marked) — both wrap the same way, only the class differs.
 *
 * @param {Range} range
 * @param {string[]} classes
 * @returns {HTMLElement[]}
 */
export function mark(range, classes) {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(
    root.nodeType === Node.ELEMENT_NODE ? root : /** @type {Node} */ (root.parentNode),
    NodeFilter.SHOW_TEXT
  );

  /** @type {Text[]} */
  const touched = [];
  while (walker.nextNode()) {
    const node = /** @type {Text} */ (walker.currentNode);
    // Only prose: the same text buildIndex counted. Otherwise a quote running
    // across a paragraph break paints the sidenote and the page number too.
    // Whitespace-only nodes are the newlines between block elements: marking
    // them puts a stray highlight in the gap between two paragraphs.
    if (!node.data.trim()) continue;
    if (range.intersectsNode(node) && isProse(node)) touched.push(node);
  }
  if (!touched.length && range.startContainer.nodeType === Node.TEXT_NODE) {
    touched.push(/** @type {Text} */ (range.startContainer));
  }

  /** @type {HTMLElement[]} */
  const marks = [];

  for (const node of touched) {
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.data.length;
    if (to <= from) continue;

    // Split the node down to exactly the part inside the range, then wrap it.
    const middle = from > 0 ? node.splitText(from) : node;
    if (to - from < middle.data.length) middle.splitText(to - from);

    const element = document.createElement("mark");
    element.className = classes.join(" ");
    middle.parentNode?.insertBefore(element, middle);
    element.appendChild(middle);
    marks.push(element);
  }

  return marks;
}
