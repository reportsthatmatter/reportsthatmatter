/* Highlight-to-share.
 *
 * Select text inside the report body and a small popover offers a canonical
 * link to it, or the quote plus that link. Select part of a paragraph and the
 * link names those words; select the whole thing and it names the paragraph,
 * as it always did.
 *
 * Desktop-first: the popover is suppressed on coarse pointers, where the OS
 * selection menu already occupies the same space.
 */
// @ts-check
import { encodeAnchor, selectorFor } from "./anchor.js";
import { buildIndex, indexOfPoint } from "./dom-text.js";

const body = document.getElementById("report-body");
const pop = document.getElementById("share-pop");

const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

if (body && pop && !isCoarse) {
  const current = { quote: "", url: "" };

  /**
   * The paragraph a node sits in — the first ancestor carrying an id, which
   * in a report body is always a paragraph.
   * @param {Node} node
   * @returns {HTMLElement | null}
   */
  const paragraphFor = (node) => {
    let el = node.nodeType === 1 ? /** @type {HTMLElement} */ (node) : node.parentElement;
    while (el && el !== body) {
      if (el.id) return el;
      el = el.parentElement;
    }
    return null;
  };

  /**
   * The canonical link for a selection.
   *
   * The fragment positions the reader; the query string is what the server
   * sees, and so what a link preview in a feed can be built from. `h` names
   * the words, and is left off when the selection is the whole paragraph —
   * there is nothing there for it to add.
   *
   * @param {Range} range
   * @returns {string}
   */
  const canonicalUrl = (range) => {
    const base = window.location.origin + window.location.pathname;
    const paragraph = paragraphFor(range.startContainer);
    if (!paragraph) return base;

    const link = `${base}?p=${encodeURIComponent(paragraph.id)}`;
    const index = buildIndex(paragraph);
    const start = indexOfPoint(index, range.startContainer, range.startOffset);
    const end = indexOfPoint(index, range.endContainer, range.endOffset);

    if (start === -1 || end === -1 || end <= start) return `${link}#${paragraph.id}`;
    if (start === 0 && end >= index.text.length) return `${link}#${paragraph.id}`;

    const anchor = encodeAnchor(selectorFor(index.text, start, end));
    if (!anchor) return `${link}#${paragraph.id}`;

    return `${link}&h=${anchor}#${paragraph.id}`;
  };

  const hide = () => pop.setAttribute("data-open", "false");

  /**
   * @param {DOMRect} rect
   * @param {string} quote
   * @param {string} url
   */
  const show = (rect, quote, url) => {
    current.quote = quote;
    current.url = url;
    pop.setAttribute("data-open", "true");
    // Exposed so the browser checks can assert on the link a selection
    // produces without reaching into the clipboard.
    pop.setAttribute("data-url", url);
    pop.style.top = `${rect.top + window.scrollY - 10}px`;
    pop.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  };

  const onSelectionSettled = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return hide();

    const text = selection.toString().trim();
    if (text.length < 2) return hide();

    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return hide();

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return hide();

    show(rect, text, canonicalUrl(range));
  };

  /**
   * @param {HTMLElement} button
   * @param {string} label
   */
  const flash = (button, label) => {
    const original = button.textContent;
    button.textContent = label;
    setTimeout(() => {
      button.textContent = original;
    }, 1200);
  };

  /**
   * @param {string} text
   * @param {HTMLElement} button
   * @param {string} label
   */
  const copy = (text, button, label) => {
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
  };

  document.addEventListener("mouseup", () => setTimeout(onSelectionSettled, 0));

  document.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key === "Escape") setTimeout(onSelectionSettled, 0);
  });

  document.addEventListener("mousedown", (event) => {
    if (!pop.contains(/** @type {Node} */ (event.target))) hide();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);

  pop.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!button) return;
    const action = button.getAttribute("data-action");
    if (action === "copy-link") {
      copy(current.url, button, "Copied");
    } else if (action === "copy-quote") {
      copy(`"${current.quote}"\n\n${current.url}`, button, "Copied");
    }
  });
}
