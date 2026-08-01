/* Highlight-to-share.
 *
 * Select text inside the report body and a small popover offers a canonical
 * link to the paragraph the selection starts in, or the quote plus that link.
 * Desktop-first: the popover is suppressed on coarse pointers, where the OS
 * selection menu already occupies the same space.
 */
(function () {
  "use strict";

  var body = document.getElementById("report-body");
  var pop = document.getElementById("share-pop");
  if (!body || !pop) return;

  var isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (isCoarse) return;

  var current = { quote: "", url: "" };

  function paragraphIdFor(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== body) {
      if (el.id) return el.id;
      el = el.parentElement;
    }
    return null;
  }

  function canonicalUrl(id) {
    var base = window.location.origin + window.location.pathname;
    if (!id) return base;
    // The fragment positions the reader; the query string is what the server
    // sees, and so what a link preview in a feed can be built from.
    return base + "?p=" + encodeURIComponent(id) + "#" + id;
  }

  function hide() {
    pop.setAttribute("data-open", "false");
  }

  function show(rect, quote, url) {
    current.quote = quote;
    current.url = url;
    pop.setAttribute("data-open", "true");
    var top = rect.top + window.scrollY - 10;
    var left = rect.left + window.scrollX + rect.width / 2;
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }

  function onSelectionSettled() {
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed) return hide();

    var text = selection.toString().trim();
    if (text.length < 2) return hide();

    var range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return hide();

    var rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return hide();

    show(rect, text, canonicalUrl(paragraphIdFor(range.startContainer)));
  }

  function flash(button, label) {
    var original = button.textContent;
    button.textContent = label;
    setTimeout(function () {
      button.textContent = original;
    }, 1200);
  }

  function copy(text, button, label) {
    var done = function () {
      flash(button, label);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      var scratch = document.createElement("textarea");
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

  document.addEventListener("mouseup", function () {
    setTimeout(onSelectionSettled, 0);
  });

  document.addEventListener("keyup", function (event) {
    if (event.shiftKey || event.key === "Escape") setTimeout(onSelectionSettled, 0);
  });

  document.addEventListener("mousedown", function (event) {
    if (!pop.contains(event.target)) hide();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") hide();
  });

  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);

  pop.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    var action = button.getAttribute("data-action");
    if (action === "copy-link") {
      copy(current.url, button, "Copied");
    } else if (action === "copy-quote") {
      copy('"' + current.quote + '"\n\n' + current.url, button, "Copied");
    }
  });
})();
