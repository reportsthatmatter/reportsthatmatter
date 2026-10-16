/* The panel a shared passage link lands on (bght.4).
 *
 * A ?h= link scrolls to its words and marks them (highlight.js). This adds a
 * compact panel saying what they are — the editor's highlight or a passage
 * someone shared — with the citation and a way to pass them on.
 *
 * Fixed to the screen, so inserting it moves no text; appended after the
 * report body, so the text indexes never see it; built here rather than in
 * the page, because the body must not depend on the query string
 * (tests/head.test.ts). It asks the server for nothing and records nothing:
 * passing on a link someone sent you is not a new highlight, and the editor's
 * label comes from the marks social-proof.js already fetched
 * (docs/design/2026-10-03-sharing-and-highlights.md §7).
 */
// @ts-check
import { marksLoaded } from "./social-proof.js";
import { blueskyIntent, canShare, copy, nativeShare, pageFor, shorten } from "./share-actions.js";

/** Words beyond this are cut in the panel (the link carries them all). */
const QUOTE_MAX = 280;

/** @param {string} text */
const tidy = (text) => text.replace(/\s+/g, " ").trim();

/**
 * The words as the panel sets them inside its own curly double quotes: a quotation within them
 * becomes a single curly pair (‘ ’), as the posting queue does, so a quote that ends in a quote
 * does not read `"So what?"”`. Display only: copy and share keep the report's own characters.
 * @param {string} text
 */
const nested = (text) =>
  text
    .replace(/(^|[\s(\[\u2014])["\u201c]/g, "$1\u2018")
    .replace(/["\u201d\u201c]/g, "\u2019");

/** Where a reader asks for a correction or a removal (src/templates/site.ts CONTACT_PATH). */
const CONTACT_PATH = "/about#contact";

/**
 * A paragraph's own words, without its ¶ permalink or its notes: what a `?p=` link names.
 * @param {HTMLElement} paragraph
 */
function paragraphText(paragraph) {
  const copy = /** @type {HTMLElement} */ (paragraph.cloneNode(true));
  for (const extra of copy.querySelectorAll(".permalink, .sidenote, .sidenote-toggle")) extra.remove();
  return copy.textContent || "";
}

/**
 * A `?h=` link names words (`exact`) and the panel quotes them. A `?p=` link names a whole paragraph,
 * already washed on the page, so the panel leaves the quote out and only says where it is from
 * (decision hbnj: the source line on the paragraph view).
 * @param {{ body: HTMLElement, marks: HTMLElement[], paragraph: HTMLElement | null, exact: string | null }} landed
 */
export function showPassagePanel({ body, marks, paragraph, exact }) {
  const whole = exact === null;
  const quote = tidy(whole ? (paragraph ? paragraphText(paragraph) : "") : exact);
  const url = shareableUrl(paragraph);
  const page = paragraph ? pageFor(paragraph) : null;
  const report = body.dataset.reportTitle || "";
  // The page and the report: how these documents are cited. The section is
  // already the page's own heading, and on a phone a third line of citation
  // would push the quote off the panel.
  const cite = [page !== null ? `p. ${page}` : "", report].filter(Boolean).join(" · ");

  const panel = document.createElement("aside");
  panel.className = "passage-panel";
  panel.id = "passage-panel";
  panel.setAttribute("aria-labelledby", "passage-panel-kicker");
  panel.innerHTML = `
<div class="passage-panel-head">
  <p class="passage-panel-kicker mono" id="passage-panel-kicker">${whole ? "Linked paragraph" : "Shared passage"}</p>
  <button type="button" class="passage-panel-close" data-action="close" aria-label="Close">×</button>
</div>
<blockquote class="passage-panel-quote"></blockquote>
<p class="passage-panel-cite mono"></p>
<p class="passage-panel-source mono"></p>
<div class="passage-panel-actions">
  <button type="button" data-action="share" hidden>Share</button>
  <a data-action="bluesky" target="_blank" rel="noopener" hidden>Bluesky</a>
  <button type="button" data-action="copy-link">Copy link</button>
  <button type="button" data-action="copy-quote">Copy quote</button>
</div>`;
  const quoteBlock = /** @type {HTMLElement} */ (panel.querySelector(".passage-panel-quote"));
  if (whole) quoteBlock.remove();
  else quoteBlock.textContent = `“${nested(shorten(quote, QUOTE_MAX))}”`;
  /** @type {HTMLElement} */ (panel.querySelector(".passage-panel-cite")).textContent = cite;
  sourceLine(/** @type {HTMLElement} */ (panel.querySelector(".passage-panel-source")), body);

  // A phone has a share sheet, which reaches Bluesky and everything else; a
  // desktop usually does not, so it gets the one network we post to.
  if (canShare()) /** @type {HTMLElement} */ (panel.querySelector('[data-action="share"]')).hidden = false;
  else {
    const bluesky = /** @type {HTMLAnchorElement} */ (panel.querySelector('[data-action="bluesky"]'));
    bluesky.href = blueskyIntent(quote, url);
    bluesky.hidden = false;
  }

  const close = () => {
    panel.remove();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("rtm:selecting", close);
  };
  /** @param {KeyboardEvent} event */
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  // On a phone, the selection dock takes the same strip of screen.
  document.addEventListener("rtm:selecting", close);

  panel.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!button) return;
    const action = button.getAttribute("data-action");
    if (action === "close") close();
    else if (action === "share") nativeShare({ quote, url, title: report });
    else if (action === "copy-link") copy(url, button, "Copied");
    else if (action === "copy-quote") copy(`“${quote}”\n\n${cite}\n${url}`, button, "Copied");
  });

  body.after(panel);
  panel.setAttribute("data-open", "true");

  // Emphasis on arrival: the marks glow once (none under reduced motion, in CSS).
  for (const element of marks) element.classList.add("landed");

  marksLoaded.then((entries) => {
    const editor = entries.some(
      (entry) =>
        entry.editor &&
        (!paragraph || entry.paragraph === paragraph.id) &&
        tidy(entry.exact) === quote
    );
    if (editor) {
      /** @type {HTMLElement} */ (panel.querySelector(".passage-panel-kicker")).textContent = "Editor’s highlight";
      panel.dataset.editor = "true";
    }
  });

  return panel;
}

/**
 * The official document, the edition notes and the way to ask for a correction or removal, from the
 * report body's data attributes (src/templates/report.ts sourceAttributes). Built as elements, not
 * markup, because the URLs come from the registry.
 * @param {HTMLElement} line
 * @param {HTMLElement} body
 */
function sourceLine(line, body) {
  const links = [
    [body.dataset.sourceUrl, "Original document ↗", "nofollow noopener"],
    [body.dataset.editionUrl, "About this edition", ""],
    [CONTACT_PATH, "Corrections and removal", ""],
  ].filter(([href]) => href);
  links.forEach(([href, label, rel], i) => {
    if (i) line.append(" · ");
    const link = document.createElement("a");
    link.href = /** @type {string} */ (href);
    link.textContent = /** @type {string} */ (label);
    if (rel) link.rel = /** @type {string} */ (rel);
    line.append(link);
  });
}

/**
 * This page's link, without the tracking tag a post added to it, and with the
 * paragraph's fragment (highlight.js takes it off the address bar).
 * @param {HTMLElement | null} paragraph
 */
function shareableUrl(paragraph) {
  const url = new URL(window.location.href);
  url.searchParams.delete("src");
  if (paragraph && !url.hash) url.hash = paragraph.id;
  return url.toString();
}
