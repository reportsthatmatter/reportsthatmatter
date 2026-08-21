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
import { createStore } from "./highlights-store.js";

const body = document.getElementById("report-body");
const pop = document.getElementById("share-pop");

const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

if (body && pop && !isCoarse) {
  const store = createStore(window.localStorage);
  const current = { quote: "", url: "", paragraph: "", anchor: "", page: null, selector: null };

  /**
   * The printed page a passage sits on: the last page marker before it.
   *
   * This is how these documents are cited — "Report at 62" — so a saved
   * highlight carries it, and an export is a citation rather than a link.
   * @param {Element} paragraph
   * @returns {number | null}
   */
  const pageFor = (paragraph) => {
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
  };

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
   * @returns {{ url: string, paragraph: string, anchor: string, page: number | null, quote: string, selector: {prefix: string, exact: string, suffix: string} | null }}
   */
  const canonicalUrl = (range) => {
    const base = window.location.origin + window.location.pathname;
    const paragraph = paragraphFor(range.startContainer);
    if (!paragraph) return { url: base, paragraph: "", anchor: "", page: null, quote: "", selector: null };

    const link = `${base}?p=${encodeURIComponent(paragraph.id)}`;
    const context = { paragraph: paragraph.id, anchor: "", page: pageFor(paragraph) };

    // A selection that runs past the end of its paragraph has to be described
    // against something that contains all of it. Readers select across a
    // paragraph break often — a finding and the sentence that qualifies it —
    // and describing only the first half would quote them wrongly.
    const endParagraph = paragraphFor(range.endContainer);
    const spansParagraphs = endParagraph !== paragraph;
    const scope = spansParagraphs ? body : paragraph;

    const index = buildIndex(scope);
    const start = indexOfPoint(index, range.startContainer, range.startOffset);
    const end = indexOfPoint(index, range.endContainer, range.endOffset);

    // The quote comes from the indexed text, not from the selection: the
    // browser's own string includes the footnote marker and the sidenote it
    // opens, so a quoted passage would read "…illegitimate ones.2424 See ECF".
    const quote = end > start ? index.text.slice(start, end) : "";
    const whole = { ...context, url: `${link}#${paragraph.id}`, quote: index.text, selector: null };

    if (end <= start) return whole;
    if (!spansParagraphs && start === 0 && end >= index.text.length) return whole;

    const selector = selectorFor(index.text, start, end);
    const anchor = encodeAnchor(selector);
    if (!anchor) return whole;

    return { ...context, anchor, quote, selector, url: `${link}&h=${anchor}#${paragraph.id}` };
  };

  const hide = () => pop.setAttribute("data-open", "false");

  /**
   * @param {DOMRect} rect
   * @param {string} quote
   * @param {{ url: string, paragraph: string, anchor: string, page: number | null, quote: string, selector: {prefix: string, exact: string, suffix: string} | null }} link
   */
  const show = (rect, quote, link) => {
    current.quote = link.quote || quote;
    current.url = link.url;
    current.paragraph = link.paragraph;
    current.anchor = link.anchor;
    current.page = link.page;
    current.selector = link.selector;
    pop.setAttribute("data-open", "true");
    // Exposed so the browser checks can assert on the link a selection
    // produces without reaching into the clipboard.
    pop.setAttribute("data-url", link.url);
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

  /**
   * Tell the server a passage was marked — the input to what other readers
   * see (#96). Best-effort and unawaited: a slow or unreachable endpoint must
   * never make sharing or saving feel broken. `keepalive` matters more than it
   * looks: copying a link is usually followed immediately by switching tabs or
   * pasting it somewhere, and without it the browser cancels the request
   * mid-flight on navigation — silently dropping exactly the signal this
   * exists to record.
   * @param {"share" | "save"} kind
   */
  const report = (kind) => {
    if (!current.paragraph) return;
    const selector = current.selector;
    fetch("/api/mark", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        report: body.dataset.report,
        section: body.dataset.section,
        paragraph: current.paragraph,
        exact: selector ? selector.exact : current.quote,
        prefix: selector ? selector.prefix : "",
        suffix: selector ? selector.suffix : "",
        page: current.page,
        kind,
      }),
    }).catch(() => {});
  };

  document.addEventListener("mouseup", () => setTimeout(onSelectionSettled, 0));

  document.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key === "Escape") setTimeout(onSelectionSettled, 0);
  });

  document.addEventListener("mousedown", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (!pop.contains(target)) hide();

    // A drag through the body should not sweep up the margin notes; a drag
    // that starts inside one is someone deliberately selecting a citation.
    if (target.closest && target.closest(".sidenote")) body.removeAttribute("data-selecting");
    else body.setAttribute("data-selecting", "true");
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
      report("share");
    } else if (action === "copy-quote") {
      copy(`"${current.quote}"\n\n${current.url}`, button, "Copied");
      report("share");
    } else if (action === "save") {
      store.add({
        report: body.dataset.report,
        reportTitle: body.dataset.reportTitle,
        section: body.dataset.section,
        sectionTitle: body.dataset.sectionTitle,
        paragraph: current.paragraph,
        anchor: current.anchor,
        quote: current.quote,
        page: current.page,
        url: current.url,
      });
      flash(button, "Saved");
      report("save");
    }
  });
}
