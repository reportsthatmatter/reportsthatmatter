/* Highlight-to-share.
 *
 * Select text inside the report body and a small popover offers a canonical
 * link to it, or the quote plus that link. Select part of a paragraph and the
 * link names those words; select the whole thing and it names the paragraph,
 * as it always did.
 *
 * Two forms of the same three actions (docs/design/2026-10-03-sharing-and-
 * highlights.md §7). With a mouse, a popover floats above the selection,
 * opened on mouseup. On a touch screen that spot belongs to the OS's own
 * selection menu (iOS's callout, Android's floating toolbar), which a page
 * cannot turn off, so the actions sit in a dock fixed to the bottom of the
 * screen instead, opened once a selection settles (`selectionchange`; touch
 * has no mouseup), with the native share sheet as its first button.
 */
// @ts-check
import { encodeAnchor, selectorFor } from "./anchor.js";
import { buildIndex, indexOfPoint } from "./dom-text.js";
import { createStore } from "./highlights-store.js";
import { canShare, copy, flash, nativeShare, pageFor } from "./share-actions.js";

const body = document.getElementById("report-body");
const pop = document.getElementById("share-pop");

const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

/** How long a selection must sit still before the dock opens for it. */
const SETTLE_MS = 350;
/** After a dock button is used, how long the dock stays to show its "Copied"/"Saved". */
const LINGER_MS = 1500;

if (body && pop) {
  const dock = isCoarse;
  pop.setAttribute("data-mode", dock ? "dock" : "float");
  if (dock) {
    // The share sheet already offers Copy, so where there is one, Share takes
    // Copy link's place and the dock stays three buttons wide on a phone.
    const share = /** @type {HTMLElement | null} */ (pop.querySelector('[data-action="share"]'));
    const copyLink = /** @type {HTMLElement | null} */ (pop.querySelector('[data-action="copy-link"]'));
    if (share && copyLink && canShare()) {
      share.hidden = false;
      copyLink.hidden = true;
    }
  }
  let usedAt = 0;
  const store = createStore(window.localStorage);
  const current = { quote: "", url: "", paragraph: "", anchor: "", page: null, selector: null };

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

  /** The dock hides once the selection goes — but not under a finger that just used it. */
  const hideDock = () => {
    const wait = usedAt + LINGER_MS - Date.now();
    if (wait > 0) setTimeout(hideDock, wait);
    else if (window.getSelection()?.isCollapsed !== false) hide();
  };

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
    if (dock) {
      // A shared link's landing panel occupies the same strip; the reader has
      // moved on from it.
      document.dispatchEvent(new CustomEvent("rtm:selecting"));
      return;
    }
    pop.style.top = `${rect.top + window.scrollY - 10}px`;
    pop.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
  };

  const onSelectionSettled = () => {
    const close = dock ? hideDock : hide;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return close();

    const text = selection.toString().trim();
    if (text.length < 2) return close();

    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return close();

    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return close();

    show(rect, text, canonicalUrl(range));
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
   * @param {typeof current} what the selection acted on — a copy, when the
   *   report is made after an await and the reader may have selected again
   */
  const report = (kind, what = current) => {
    if (!what.paragraph) return;
    const selector = what.selector;
    fetch("/api/mark", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        report: body.dataset.report,
        section: body.dataset.section,
        paragraph: what.paragraph,
        exact: selector ? selector.exact : what.quote,
        prefix: selector ? selector.prefix : "",
        suffix: selector ? selector.suffix : "",
        page: what.page,
        kind,
      }),
    }).catch(() => {});
  };

  if (dock) {
    // Touch ends a selection with no mouseup, and the reader may still be
    // dragging its handles: act once it has been still for a moment.
    let settle = 0;
    document.addEventListener("selectionchange", () => {
      clearTimeout(settle);
      settle = window.setTimeout(onSelectionSettled, SETTLE_MS);
    });
  } else {
    document.addEventListener("mouseup", () => setTimeout(onSelectionSettled, 0));
  }

  document.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key === "Escape") setTimeout(onSelectionSettled, 0);
  });

  document.addEventListener("mousedown", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    // On touch, a tap's emulated mousedown arrives after the tap itself; the
    // dock closes when the selection does, not on a tap.
    if (!dock && !pop.contains(target)) hide();

    // A drag through the body should not sweep up the margin notes; a drag
    // that starts inside one is someone deliberately selecting a citation.
    if (target.closest && target.closest(".sidenote")) body.removeAttribute("data-selecting");
    else body.setAttribute("data-selecting", "true");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });

  // A floating popover would be left behind by a scroll. The dock is fixed to
  // the screen, and on touch dragging a selection handle scrolls the page and
  // the browser's toolbars resize the viewport.
  if (!dock) {
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
  }

  pop.addEventListener("pointerdown", () => {
    usedAt = Date.now();
  });

  pop.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!button) return;
    usedAt = Date.now();
    const action = button.getAttribute("data-action");
    if (action === "share") {
      const what = { ...current };
      nativeShare({ quote: what.quote, url: what.url, title: body.dataset.reportTitle }).then((shared) => {
        if (shared) report("share", what);
      });
    } else if (action === "copy-link") {
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
