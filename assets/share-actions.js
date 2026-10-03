/* What sharing a passage does, shared by the selection popover (share.js)
 * and the panel a shared link lands on (passage-panel.js): copy to the
 * clipboard, hand to the native share sheet, and name the printed page.
 */
// @ts-check

/**
 * The printed page a passage sits on: the last page marker before it.
 *
 * This is how these documents are cited — "Report at 62" — so a saved
 * highlight carries it, and an export is a citation rather than a link.
 * @param {Element} paragraph
 * @returns {number | null}
 */
export function pageFor(paragraph) {
  const markers = [...document.querySelectorAll(".page-marker")];
  let page = null;
  for (const marker of markers) {
    const position = marker.compareDocumentPosition(paragraph);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      const number = parseInt(marker.id.replace("page-", ""), 10);
      if (!Number.isNaN(number)) page = number;
    }
  }
  return page;
}

/**
 * Say an action worked, in the button that did it.
 * @param {HTMLElement} button
 * @param {string} label
 */
export function flash(button, label) {
  const original = button.dataset.label || button.textContent || "";
  button.dataset.label = original;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

/**
 * @param {string} text
 * @param {HTMLElement} button
 * @param {string} label
 */
export function copy(text, button, label) {
  const done = () => flash(button, label);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, done);
  } else {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "absolute";
    scratch.style.left = "-9999px";
    document.body.appendChild(scratch);
    scratch.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* nothing useful to do; the flash below still closes the loop */
    }
    document.body.removeChild(scratch);
    done();
  }
}

/** Is there a native share sheet to hand a link to? */
export const canShare = () => typeof navigator.share === "function";

/**
 * Open the native share sheet with the quote and its link.
 *
 * Resolves true when the reader actually shared, false when they backed out
 * or the sheet could not open — so a caller records a share only when one
 * happened.
 * @param {{ quote: string, url: string, title?: string }} what
 * @returns {Promise<boolean>}
 */
export async function nativeShare({ quote, url, title }) {
  try {
    await navigator.share({ title, text: `“${quote}”`, url });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * A Bluesky compose link with the quote and its link, cut to fit a post.
 * @param {string} quote
 * @param {string} url
 */
export function blueskyIntent(quote, url) {
  // 300 graphemes a post; the link counts in full, and two quote marks and a
  // blank line separate it from the words.
  const room = Math.max(40, 300 - url.length - 5);
  const words = quote.length > room ? `${quote.slice(0, room - 1).trimEnd()}…` : quote;
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(`“${words}”\n\n${url}`)}`;
}

/**
 * A short form of a long quote, cut at a word.
 * @param {string} text
 * @param {number} max
 */
export function shorten(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
