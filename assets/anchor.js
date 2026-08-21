/* Quote anchors — describing a selection so it can be found again.
 *
 * A paragraph permalink says *which paragraph*. This says *which words*, which
 * is what a citation actually claims. The scheme is the W3C Web Annotation
 * model's text-quote selector, reduced to what this site needs: the selected
 * text, plus enough of the words either side to tell two identical phrases in
 * one paragraph apart.
 *
 * Anchors are text-derived for the same reason paragraph ids are: re-ingesting
 * a report must not silently repoint a citation. Text that is still in the
 * document is still found; text that is gone fails visibly rather than
 * resolving to something else.
 *
 * An ES module, loaded directly by the browser and imported by the Worker, so
 * that the anchor a reader creates and the anchor the server resolves can
 * never drift apart.
 */
// @ts-check

/**
 * @typedef {{ prefix: string, exact: string, suffix: string }} Selector
 * @typedef {{ start: number, end: number, tier: "context" | "partial" | "exact" }} Match
 */

/**
 * Above this length a passage is named by its ends rather than in full.
 *
 * Readers quote several sentences at a time — a finding and the qualification
 * that follows it — and an anchor carrying all of it makes an unwieldy URL.
 * Naming the first and last words instead keeps the link short and still
 * describes exactly the same span.
 *
 * This used to be the point at which a long selection silently gave up and
 * linked the whole paragraph, which quoted the reader wrongly and gave no sign
 * of having done so.
 */
export const MAX_EXACT = 300;

/** Characters kept from each end of a long passage. */
const SEGMENT = 120;

/** Stands for the middle of a passage named by its ends. */
const GAP = "⋯";

/** Characters of context kept either side. Whole words only. */
const CONTEXT = 25;

const SEPARATOR = "|";

/**
 * The text as the matcher sees it: one space between words, and none of the
 * furniture the page adds around the prose.
 *
 * Report text comes from a PDF, so a paragraph is full of line breaks that a
 * reader never sees and a selection spanning one would otherwise not match.
 *
 * @param {string} text @returns {string}
 */
export function normalise(text) {
  return text
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Describe the selection running from `start` to `end` within `text`.
 * @param {string} text @param {number} start @param {number} end @returns {Selector}
 */
export function selectorFor(text, start, end) {
  let from = Math.max(0, start - CONTEXT);
  while (from > 0 && !/\s/.test(text[from - 1])) from--;

  let to = Math.min(text.length, end + CONTEXT);
  while (to > end && to < text.length && !/\s/.test(text[to])) to--;

  return {
    prefix: text.slice(from, start),
    exact: text.slice(start, end),
    suffix: text.slice(end, to),
  };
}

/**
 * Pack a selector into a query-string value, or null if it is too long to be one.
 * @param {Selector | null} selector @returns {string | null}
 */
export function encodeAnchor(selector) {
  if (!selector || !selector.exact) return null;

  const exact =
    selector.exact.length > MAX_EXACT
      ? `${selector.exact.slice(0, SEGMENT)}${GAP}${selector.exact.slice(-SEGMENT)}`
      : selector.exact;

  return [selector.prefix, exact, selector.suffix]
    .map((part) => encodeURIComponent(part || ""))
    .join(SEPARATOR);
}

/**
 * Unpack an anchor, or null if it is not one. Never guess at a malformed anchor.
 * @param {string | null | undefined} value @returns {Selector | null}
 */
export function decodeAnchor(value) {
  if (!value) return null;
  const parts = value.split(SEPARATOR);
  if (parts.length !== 3) return null;
  try {
    const [prefix, exact, suffix] = parts.map(decodeURIComponent);
    if (!exact) return null;
    return { prefix, exact, suffix };
  } catch (err) {
    return null; // malformed percent-encoding
  }
}

/**
 * Find the anchored text in `haystack`, in descending order of confidence.
 *
 * Returns `{ start, end, tier }`, where the tier says how much of the anchor
 * still matched — callers use it to decide how loudly to say "this is where I
 * think the quote was". Returns null when the quoted words are gone, which is
 * the important case: a caller must fall back to the paragraph rather than
 * highlight the wrong words.
 *
 * @param {string} haystack
 * @param {Selector | null} anchor
 * @returns {Match | null}
 */
export function locate(haystack, anchor) {
  if (!anchor || !anchor.exact) return null;
  const { prefix = "", exact, suffix = "" } = anchor;

  // A passage named by its ends: find where it opens, then where it closes.
  if (exact.includes(GAP)) {
    const [head, tail] = exact.split(GAP);
    const opening = locate(haystack, { prefix, exact: head, suffix: "" });
    if (!opening) return null;

    const closing = haystack.indexOf(tail, opening.end);
    // The passage opens where it did but no longer ends there. Marking from
    // the start to somewhere arbitrary would misquote the document, so this
    // fails to the paragraph like any other anchor that cannot be resolved.
    if (closing === -1) return null;

    return { start: opening.start, end: closing + tail.length, tier: opening.tier };
  }

  const withContext = haystack.indexOf(prefix + exact + suffix);
  if (withContext !== -1) {
    const start = withContext + prefix.length;
    return { start, end: start + exact.length, tier: "context" };
  }

  if (prefix) {
    const leading = haystack.indexOf(prefix + exact);
    if (leading !== -1) {
      const start = leading + prefix.length;
      return { start, end: start + exact.length, tier: "partial" };
    }
  }

  if (suffix) {
    const trailing = haystack.indexOf(exact + suffix);
    if (trailing !== -1) {
      return { start: trailing, end: trailing + exact.length, tier: "partial" };
    }
  }

  const alone = haystack.indexOf(exact);
  if (alone !== -1) return { start: alone, end: alone + exact.length, tier: "exact" };

  return null;
}
