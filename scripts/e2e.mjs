/* Browser checks that HTTP assertions cannot make: does the page actually lay
 * out, do the fonts and stylesheet load, does highlight-to-share work.
 * Prints "ok <name>" per passing check; exits non-zero on any failure.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://localhost:8788";
// Recording a mark writes a real row to the live D1 database — fine against a
// local worker (thrown away with its .wrangler state), not fine against
// production, which would otherwise pick up a fresh "1 reader" mark from a
// headless browser on every VERIFY_BASE run (AGENTS.md documents that as the
// expected post-deploy check). Read-only checks still run everywhere.
const isLocal = /localhost|127\.0\.0\.1/.test(base);
const failures = [];

const ok = (name) => console.log(`ok ${name}`);
const check = (cond, name, detail = "") => {
  if (cond) ok(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

const firstReportId = (() => {
  const yaml = readFileSync(new URL("../reports/registry.yaml", import.meta.url), "utf8");
  const match = yaml.match(/^\s+- id:\s*(\S+)/m);
  return match ? match[1] : null;
})();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
const failedRequests = [];
page.on("requestfailed", (req) => {
  // Chromium detaches a keepalive fetch from the page that started it and
  // hands it to the browser process, so it can outlive a navigation — that is
  // the entire point of marking it keepalive (assets/share.js). CDP's
  // requestfailed can still fire net::ERR_ABORTED for that detached request
  // even though the response reached the server: confirmed directly against
  // this worker (curl / debug script) that /api/mark answers 204 every time.
  // A real failure to reach the endpoint would show up as a missing mark on
  // the "Most marked passages" and underline checks below, which do fail loudly.
  if (req.url().endsWith("/api/mark") && req.failure()?.errorText === "net::ERR_ABORTED") return;
  failedRequests.push(req.url());
});

// ---------- homepage ----------

await page.goto(`${base}/`, { waitUntil: "networkidle" });

const styles = await page.evaluate(() => {
  const cs = getComputedStyle(document.body);
  const h1 = document.querySelector("h1");
  return {
    bg: cs.backgroundColor,
    bodyFont: cs.fontFamily,
    h1Font: h1 ? getComputedStyle(h1).fontFamily : "",
    h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
    navCount: document.querySelectorAll(".site-nav a").length,
  };
});

check(styles.bg === "rgb(247, 247, 247)", "homepage uses the off-white canvas", styles.bg);
check(/Garamond/.test(styles.h1Font), "display heading uses the serif", styles.h1Font);
check(styles.h1Size > 36, "hero heading is display-scale", `${styles.h1Size}px`);
check(styles.navCount >= 2, "header nav renders");

// no horizontal overflow at any width
for (const width of [390, 768, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  check(!overflows, `no horizontal overflow at ${width}px`);
}
await page.setViewportSize({ width: 1280, height: 900 });

// ---------- report page ----------

if (firstReportId) {
  await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });

  const report = await page.evaluate(() => {
    const p1 = document.querySelector(".prose p[id]");
    const prose = document.querySelector(".prose");
    const notes = [...document.querySelectorAll(".sidenote")];
    const proseBottom = prose ? prose.getBoundingClientRect().bottom : 0;
    // A sidenote longer than the paragraph beside it floats past wherever an
    // uncleared .prose box would otherwise end — the section nav and footer
    // would then render on top of it. See PROGRESS.md, 2026-08-09.
    const maxNoteBottom = notes.reduce(
      (max, note) => Math.max(max, note.getBoundingClientRect().bottom),
      0
    );
    return {
      hasP1: Boolean(p1),
      hasPermalink: Boolean(p1 && p1.querySelector("a.permalink")),
      positionalIds: document.querySelectorAll('.prose p[id^="p-"]').length,
      sidenotes: notes.length,
      pageMarkers: document.querySelectorAll(".page-marker").length,
      firstId: p1 ? p1.id : "",
      proseFont: prose ? getComputedStyle(prose).fontFamily : "",
      proseSize: prose ? parseFloat(getComputedStyle(prose).fontSize) : 0,
      // content-box width: the gutter must not be counted as reading measure
      measure: prose
        ? prose.clientWidth -
          parseFloat(getComputedStyle(prose).paddingLeft) -
          parseFloat(getComputedStyle(prose).paddingRight)
        : 0,
      paragraphs: document.querySelectorAll(".prose p[id]").length,
      frontMatterLeaked: document.body.innerText.includes('title: "'),
      proseContainsNotes: proseBottom >= maxNoteBottom - 1,
    };
  });

  check(report.hasP1, "report has paragraph anchors");
  check(report.hasPermalink, "paragraphs carry a permalink");
  check(report.paragraphs > 1, "multiple paragraphs numbered", String(report.paragraphs));
  check(report.proseSize >= 17, "prose is set at a readable size", `${report.proseSize}px`);
  // ~60-85 characters per line is the readable band; at this size that is
  // roughly 480-760px of content box.
  check(
    report.measure > 480 && report.measure < 780,
    "prose holds a comfortable measure",
    `${Math.round(report.measure)}px`
  );
  check(!report.frontMatterLeaked, "front matter is not rendered as body text");
  check(report.positionalIds === 0, "no positional paragraph ids", String(report.positionalIds));
  check(/[a-z]/.test(report.firstId), "paragraph ids are text-derived", report.firstId);
  check(report.sidenotes > 0, "sidenotes are rendered", String(report.sidenotes));
  check(report.pageMarkers > 0, "printed page markers are rendered", String(report.pageMarkers));
  check(
    report.proseContainsNotes,
    "prose contains its longest sidenote (no footer overlap)",
    String(report.proseContainsNotes)
  );

  // A long note is clamped by default and expands in place on click — see
  // docs/plans/2026-08-09-sidenote-design-research.md.
  const longNoteCount = await page.locator(".sidenote.long").count();
  if (longNoteCount > 0) {
    const before = await page
      .locator(".sidenote.long")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    await page.locator(".sidenote-expand").first().click();
    const after = await page
      .locator(".sidenote.long")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    check(before < 200, "long sidenote is clamped by default", `${Math.round(before)}px`);
    check(after > before, "long sidenote expands on click", `${Math.round(before)} -> ${Math.round(after)}`);
  }

  // :target highlight actually applies
  await page.goto(`${base}/reports/${firstReportId}/full#${report.firstId}`, {
    waitUntil: "networkidle",
  });
  const targetBg = await page.evaluate((id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).backgroundColor : "";
  }, report.firstId);
  check(
    targetBg !== "" && targetBg !== "rgba(0, 0, 0, 0)",
    "linked paragraph is highlighted",
    targetBg
  );

  // highlight-to-share
  await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const p = document.querySelector(".prose p[id]");
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  const popOpen = await page.evaluate(
    () => document.getElementById("share-pop")?.getAttribute("data-open")
  );
  check(popOpen === "true", "share popover opens on selection", String(popOpen));

  // sharing part of a paragraph: the link must carry the words, not just the
  // paragraph, and following it must mark exactly those words.
  const selected = await page.evaluate(() => {
    // A paragraph's prose is broken into several text nodes by sidenote and
    // permalink markup; take the first long one that is body text.
    const paragraphs = [...document.querySelectorAll(".prose p[id]")];
    let node = null;
    for (const p of paragraphs) {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const candidate = walker.currentNode;
        if (candidate.parentElement.closest(".sidenote, .permalink")) continue;
        if (candidate.textContent.length > 60) {
          node = candidate;
          break;
        }
      }
      if (node) break;
    }
    if (!node) return null;
    const range = document.createRange();
    range.setStart(node, 10);
    range.setEnd(node, 50);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return range.toString();
  });
  await page.waitForTimeout(150);
  const shareUrl = await page.evaluate(
    () => document.getElementById("share-pop")?.getAttribute("data-url") ?? ""
  );
  check(selected !== null, "found a paragraph to select part of");
  check(/[?&]h=/.test(shareUrl), "a part-paragraph selection shares as a quote link", shareUrl.slice(0, 120));

  if (/[?&]h=/.test(shareUrl)) {
    await page.goto(shareUrl, { waitUntil: "networkidle" });
    const marked = await page.evaluate(() => {
      const mark = document.querySelector("mark.hl");
      return mark ? mark.textContent : null;
    });
    check(
      marked !== null && marked.replace(/\s+/g, " ").trim() === selected.replace(/\s+/g, " ").trim(),
      "following a quote link marks exactly the quoted words",
      `${JSON.stringify(marked)} vs ${JSON.stringify(selected)}`
    );
  }

  // The shapes a real selection actually takes. A mouse drag rarely starts and
  // ends mid-text-node: it begins at a paragraph edge, ends on a boundary, or
  // runs into the next paragraph. Every one of these must produce a quote
  // link, or the feature silently degrades to linking the whole paragraph.
  await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });

  await page.addInitScript(() => {
    window.__bodyNodes = (root) => {
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest(".sidenote, .permalink, .sidenote-toggle, .page-marker")) continue;
        if (node.data.trim().length) nodes.push(node);
      }
      return nodes;
    };
    window.__longParagraph = () =>
      [...document.querySelectorAll(".prose p[id]")].find((p) => {
        const nodes = window.__bodyNodes(p);
        return nodes.length && nodes[0].data.length > 120 && p.nextElementSibling?.id;
      });
  });

  await page.reload({ waitUntil: "networkidle" });

  const shapes = {
    "starting at the paragraph edge": `(p, nodes) => [p, 0, nodes[0], 60]`,
    "ending at a text-node boundary": `(p, nodes) => [nodes[0], 20, nodes[0], nodes[0].data.length]`,
    "ending at the end of the paragraph": `(p, nodes) => {
      const last = nodes[nodes.length - 1];
      return [last, Math.max(0, last.data.length - 40), last, last.data.length];
    }`,
    // The shape that was reported: several sentences, across footnote markers.
    // The old 300-character cap made this degrade to a paragraph link.
    "several sentences long": `(p, nodes) => {
      // From the first word to partway through the last node: long, crossing
      // footnote markers, but not the whole paragraph — which would rightly
      // be a paragraph link.
      const last = nodes[nodes.length - 1];
      return [nodes[0], 0, last, Math.max(1, Math.floor(last.data.length * 0.6))];
    }`,
    "crossing into the next paragraph": `(p, nodes) => {
      const next = window.__bodyNodes(p.nextElementSibling)[0];
      return [nodes[0], 30, next, 50];
    }`,
  };

  for (const [name, maker] of Object.entries(shapes)) {
    const selected = await page.evaluate((maker) => {
      const p = window.__longParagraph();
      if (!p) return null;
      const nodes = window.__bodyNodes(p);
      const [sn, so, en, eo] = eval(`(${maker})`)(p, nodes);
      const range = document.createRange();
      range.setStart(sn, so);
      range.setEnd(en, eo);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return range.toString();
    }, maker);
    await page.waitForTimeout(200);

    const url = await page.evaluate(
      () => document.getElementById("share-pop")?.getAttribute("data-url") ?? ""
    );
    check(/[?&]h=/.test(url), `a selection ${name} shares as a quote link`, url.slice(-60));

    if (/[?&]h=/.test(url) && selected) {
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
      const marked = await page.evaluate(() =>
        [...document.querySelectorAll("mark.hl")].map((m) => m.textContent).join("")
      );
      const tidy = (text) => text.replace(/\s+/g, " ").replace(/¶/g, "").trim();
      check(
        tidy(marked).length > 0 && tidy(selected).includes(tidy(marked).slice(0, 40)),
        `following it marks the quoted words (${name})`,
        `${JSON.stringify(tidy(marked).slice(0, 50))} vs ${JSON.stringify(tidy(selected).slice(0, 50))}`
      );
      await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });
    }
  }

  // saving a highlight: it belongs to the reader, so it has to survive a
  // reload and it has to leave with them.
  await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const p = document.querySelector(".prose p[id]");
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  await page.locator('#share-pop button[data-action="save"]').click();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const persisted = await page.evaluate(() => document.querySelectorAll("mark.hl.saved").length);
  check(persisted > 0, "a saved highlight is still marked after a reload", String(persisted));

  await page.goto(`${base}/highlights`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const listed = await page.evaluate(() => ({
    entries: document.querySelectorAll(".highlight-entry").length,
    markdown: document.querySelector("[data-export=markdown]") ? true : false,
  }));
  check(listed.entries > 0, "saved highlights are listed at /highlights", String(listed.entries));
  check(listed.markdown, "highlights can be exported as Markdown");

  // social proof (#96): a real mark, recorded against a real D1, has to come
  // back through /reports/:id/marks and render as a highlight — this is the
  // one check in the suite that proves the SQL itself is right, not just the
  // fake D1 the unit tests use. Local only — see isLocal above.
  if (isLocal) {
    await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });
    const markedParagraphId = await page.evaluate(() => {
      const p = document.querySelector(".prose p[id]");
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return p.id;
    });
    await page.waitForTimeout(150);
    await page.locator('#share-pop button[data-action="copy-link"]').click();
    await page.waitForTimeout(150); // the mark POST is fire-and-forget

    await page.goto(`${base}/reports/${firstReportId}/full`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300); // social-proof.js fetches the counts after load
    const socialProof = await page.evaluate((id) => {
      const paragraph = document.getElementById(id);
      const el = paragraph?.querySelector("mark.social-proof");
      return {
        marked: Boolean(el),
        washed: el ? getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" : false,
        title: el ? el.title : null,
        hasNoMarginNote: !paragraph?.querySelector(".social-note"),
      };
    }, markedParagraphId);
    check(socialProof.marked, "a marked passage is highlighted for other readers", JSON.stringify(socialProof));
    check(socialProof.washed, "the highlight has an actual background, not just the class", JSON.stringify(socialProof));
    check(socialProof.title === "Highlighted by 1 reader", "the reader count is a hover title, not printed text", String(socialProof.title));
    check(socialProof.hasNoMarginNote, "no margin note competing with the sidenote column");

    await page.goto(`${base}/reports/${firstReportId}`, { waitUntil: "networkidle" });
    check(
      (await page.locator("text=Most marked passages").count()) > 0,
      "the marked passage appears in the contents page's Most marked passages block"
    );
  } else {
    ok("social proof marking round trip (skipped — would write a real row to production D1)");
  }
}

// ---------- about ----------

await page.goto(`${base}/about`, { waitUntil: "networkidle" });
check(
  (await page.locator("h1").count()) === 1,
  "about page has exactly one h1"
);

// ---------- split reports ----------

if (firstReportId) {
  await page.goto(`${base}/reports/${firstReportId}`, { waitUntil: "networkidle" });
  const contents = await page.evaluate(() => ({
    sections: document.querySelectorAll(".report-list a").length,
    hasFull: Boolean(document.querySelector('a[href$="/full"]')),
  }));
  check(contents.sections > 2, "contents lists sections", String(contents.sections));
  check(contents.hasFull, "contents links the whole-report view");

  const firstSection = await page.evaluate(
    () => document.querySelector(".report-list a")?.getAttribute("href") ?? ""
  );
  await page.goto(base + firstSection, { waitUntil: "networkidle" });
  const section = await page.evaluate(() => ({
    paragraphs: document.querySelectorAll(".prose p[id]").length,
    hasNav: Boolean(document.querySelector(".section-nav")),
    bytes: document.documentElement.outerHTML.length,
  }));
  check(section.paragraphs > 0, "section page carries the text");
  check(section.hasNav, "section page has prev/contents/next");
  check(section.bytes < 700000, "section page is a sane weight", `${section.bytes} bytes`);
}

check(consoleErrors.length === 0, "no console errors", consoleErrors.join(" | "));
check(failedRequests.length === 0, "no failed requests", failedRequests.join(" | "));

await browser.close();

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
