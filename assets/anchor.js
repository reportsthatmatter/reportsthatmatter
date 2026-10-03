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
 * Typographic variants that are the same words to a reader. The PDF text layer
 * and the printed edition spell them differently (a clean-edition hybrid serves
 * curly quotes where the PDF had straight ones), and a quote or highlight made
 * against one must still be found in the other.
 */
/** @type {Map<string, string>} */
const FOLDS = new Map(/** @type {[string, string][]} */ ([
  ...[..."\u2018\u2019\u201A\u201B\u2032\u02BC"].map((c) => [c, "'"]),
  ...[..."\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB"].map((c) => [c, '"']),
  ...[..."\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043"].map((c) => [c, "-"]),
  ["\u2026", "..."],
  ["\uFB00", "ff"], ["\uFB01", "fi"], ["\uFB02", "fl"], ["\uFB03", "ffi"], ["\uFB04", "ffl"],
  ["\uFB05", "st"], ["\uFB06", "st"],
  ["\u00AD", ""], ["\u200B", ""], ["\u200C", ""], ["\u200D", ""], ["\u2060", ""], ["\uFEFF", ""],
]));

/** Any whitespace, including the non-breaking and thin spaces typesetting uses. */
const SPACE = /[\s\u00A0\u2000-\u200A\u202F\u205F\u3000]/;

/**
 * The comparison form of `text`: typographic variants folded to one spelling,
 * with a map from every folded character back to the original it came from.
 *
 * Matching happens on the folded form on both sides; positions are mapped back,
 * so the original text (curly quotes, em dashes) is what gets displayed,
 * highlighted and stored. Case is not folded: a different case is a different
 * quote.
 *
 * @param {string} text
 * @returns {{ text: string, start: number[], end: number[] }}
 *   `start[i]`/`end[i]`: the original span folded character `i` came from.
 */
export function fold(text) {
  let out = "";
  /** @type {number[]} */ const start = [];
  /** @type {number[]} */ const end = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (SPACE.test(c)) {
      // A run of spaces, however spelled, reads as one.
      if (out.endsWith(" ")) end[end.length - 1] = i + 1;
      else { out += " "; start.push(i); end.push(i + 1); }
      continue;
    }
    for (const ch of FOLDS.get(c) ?? c) {
      out += ch;
      start.push(i);
      end.push(i + 1);
    }
  }
  return { text: out, start, end };
}

/** `text` with typographic variants folded, for comparing two strings. @param {string} text @returns {string} */
export function foldText(text) {
  return fold(text).text;
}

/**
 * Find `needle` in `haystack` regardless of typographic variants, returning the
 * span in `haystack`'s own characters. @param {string} haystack @param {string} needle
 * @returns {{ start: number, end: number } | null}
 */
export function findText(haystack, needle) {
  const h = fold(haystack);
  const n = foldText(needle).trim();
  if (!n) return null;
  const at = h.text.indexOf(n);
  return at === -1 ? null : { start: h.start[at], end: h.end[at + n.length - 1] };
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
 * Typographic variants (quotes, dashes, ellipses, non-breaking spaces,
 * ligatures, soft hyphens) are folded on both sides, so an anchor made against
 * one rendering of the text still finds the same words in another. `start` and
 * `end` are offsets into `haystack` as given.
 *
 * @param {string} haystack
 * @param {Selector | null} anchor
 * @returns {Match | null}
 */
export function locate(haystack, anchor) {
  if (!anchor || !anchor.exact) return null;
  const h = fold(haystack);
  const found = locateFolded(h.text, {
    prefix: foldText(anchor.prefix || ""),
    exact: foldText(anchor.exact),
    suffix: foldText(anchor.suffix || ""),
  });
  if (!found) return null;
  return { start: h.start[found.start], end: h.end[found.end - 1], tier: found.tier };
}

/** @param {string} haystack @param {Selector} anchor @returns {Match | null} */
function locateFolded(haystack, anchor) {
  const { prefix, exact, suffix } = anchor;
  if (!exact) return null;

  // A passage named by its ends: find where it opens, then where it closes.
  if (exact.includes(GAP)) {
    const [head, tail] = exact.split(GAP);
    const opening = locateFolded(haystack, { prefix, exact: head, suffix: "" });
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
