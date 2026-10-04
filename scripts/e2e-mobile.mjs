/* Browser checks on phones (bght.3, bght.4): highlight and share by touch,
 * and the panel a shared passage link lands on.
 *
 *   node scripts/e2e-mobile.mjs [base] [--screenshots <dir>]
 *
 * Emulates an iPhone in WebKit and a Pixel in Chromium (Playwright device
 * profiles: viewport, touch, coarse pointer, user agent). What emulation
 * cannot show is the OS's own selection menu — iOS's callout, Android's
 * toolbar — which is why the dock sits at the bottom, clear of it; check that
 * part on a real phone. Prints "ok <name>" per passing check; exits non-zero
 * on any failure. Like scripts/e2e.mjs, it posts marks only against a local
 * worker.
 */
import { chromium, devices, webkit } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--screenshots");
const shots = shotsAt >= 0 ? args[shotsAt + 1] : null;
const base = args.find((arg, i) => !arg.startsWith("--") && !(shotsAt >= 0 && i === shotsAt + 1)) || "http://localhost:8788";
const isLocal = /localhost|127\.0\.0\.1/.test(base);
if (shots) mkdirSync(shots, { recursive: true });

const failures = [];
const ok = (name) => console.log(`ok ${name}`);
const check = (cond, name, detail = "") => {
  if (cond) ok(name);
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

// The editor's highlight the posting queue leads with, and a passage of the
// same section that is nobody's highlight.
const REPORT = "jack-smith-vol1";
const EDITOR_LINK =
  `/reports/${REPORT}?p=just-before-2-24-p&h=location%20at%20the%20Capitol.%20|When%20an%20advisor%20at%20the%20White%20House%20learned%20this%2C%20he%20rushed%20to%20the%20dining%20room%20and%20informed%20Mr.%20Trump%2C%20who%20replied%20%22So%20what%3F%22|&src=bsky`;
const PLAIN_LINK = `/reports/${REPORT}?p=just-before-2-24-p`;

const profiles = [
  // A share sheet, as on any phone: stubbed, so the check can read what it was handed.
  { name: "iPhone 13", engine: webkit, device: devices["iPhone 13"], shareSheet: true },
  // No share sheet, to cover the Copy link fallback.
  { name: "Pixel 7", engine: chromium, device: devices["Pixel 7"], shareSheet: false },
];

for (const profile of profiles) {
  const tag = `[${profile.name}]`;
  const browser = await profile.engine.launch();
  const context = await browser.newContext({ ...profile.device });
  if (profile.shareSheet) {
    await context.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (data) => {
        window.__shared.push(data);
      };
    });
  } else {
    await context.addInitScript(() => {
      try {
        delete Navigator.prototype.share;
      } catch {}
    });
  }
  // Layout shifts, recorded from the start (Chromium only has the API).
  await context.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  const marksPosted = [];
  if (!isLocal) await context.route("**/api/mark", (route) => route.fulfill({ status: 204, body: "" }));
  const page = await context.newPage();
  page.on("request", (req) => {
    if (req.url().endsWith("/api/mark")) marksPosted.push(req.postDataJSON());
  });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));

  // ---------- the landing panel ----------

  await page.goto(base + EDITOR_LINK, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const landed = await page.evaluate(() => {
    const panel = document.getElementById("passage-panel");
    const mark = document.querySelector("mark.hl");
    const visible = (el) => Boolean(el) && getComputedStyle(el).display !== "none" && !el.hidden;
    const p = panel?.getBoundingClientRect();
    const m = mark?.getBoundingClientRect();
    return {
      panel: Boolean(panel),
      fixed: panel ? getComputedStyle(panel).position : null,
      outsideBody: panel ? !document.getElementById("report-body").contains(panel) : false,
      kicker: panel?.querySelector(".passage-panel-kicker")?.textContent ?? "",
      quote: panel?.querySelector(".passage-panel-quote")?.textContent ?? "",
      cite: panel?.querySelector(".passage-panel-cite")?.textContent ?? "",
      share: visible(panel?.querySelector('[data-action="share"]')),
      bluesky: visible(panel?.querySelector('[data-action="bluesky"]')),
      copyLink: visible(panel?.querySelector('[data-action="copy-link"]')),
      landmark: panel?.tagName === "ASIDE" && Boolean(panel.getAttribute("aria-labelledby")),
      markTop: m ? m.top : null,
      markInView: m && p ? m.top >= 0 && m.top < p.top : false,
      panelBottom: p ? Math.round(window.innerHeight - p.bottom) : null,
      panelWidth: p ? Math.round(p.width) : 0,
      viewport: window.innerWidth,
      landedClass: Boolean(document.querySelector("mark.hl.landed")),
      focusMoved: document.activeElement !== document.body,
      cls: window.__cls,
    };
  });
  check(landed.panel, `${tag} a ?h= link lands with a passage panel`);
  check(landed.fixed === "fixed" && landed.outsideBody, `${tag} the panel is fixed and outside the report text`, JSON.stringify(landed.fixed));
  check(landed.kicker === "Editor’s highlight", `${tag} an editor's highlight is labelled as the editor's`, landed.kicker);
  check(landed.quote.includes("So what?"), `${tag} the panel quotes the linked words`, landed.quote.slice(0, 80));
  check(/^p\. \d+ · /.test(landed.cite) && landed.cite.includes("Jack Smith"), `${tag} the panel cites page and report`, landed.cite);
  check(
    profile.shareSheet ? landed.share && !landed.bluesky : !landed.share && landed.bluesky,
    `${tag} the panel offers ${profile.shareSheet ? "the share sheet" : "Bluesky"} beside Copy link`,
    JSON.stringify({ share: landed.share, bluesky: landed.bluesky })
  );
  check(landed.copyLink, `${tag} the panel offers Copy link`);
  check(landed.landmark, `${tag} the panel is a labelled landmark`);
  check(landed.markInView, `${tag} the marked words are on screen, above the panel`, `mark at ${landed.markTop}`);
  check(landed.panelBottom === 0 && landed.panelWidth === landed.viewport, `${tag} on a phone the panel is a sheet along the bottom`, JSON.stringify(landed));
  check(landed.landedClass, `${tag} the marked words are emphasised on landing`);
  check(!landed.focusMoved, `${tag} landing does not move focus`);
  if (shots) await page.screenshot({ path: join(shots, `${slug(profile.name)}-landing-editor.png`) });

  // When WebKit re-lays out the viewport (as Safari's toolbars come and go)
  // it scrolls back to the URL's #fragment, the paragraph's top, unless the
  // fragment is gone. Taking a screenshot does the same re-layout in
  // emulation (setViewportSize does not), so it is the trigger here.
  await page.screenshot();
  await page.waitForTimeout(150);
  const afterResize = await page.evaluate(() => {
    const m = document.querySelector("mark.hl")?.getBoundingClientRect();
    const p = document.getElementById("passage-panel")?.getBoundingClientRect();
    return { top: m ? Math.round(m.top) : null, ok: Boolean(m && p && m.top >= 0 && m.top < p.top) };
  });
  check(afterResize.ok, `${tag} the words stay above the panel when the viewport is laid out again`, JSON.stringify(afterResize));

  if (profile.engine === chromium) {
    // No layout jump: the panel must add nothing to the layout shift a plain
    // paragraph link to the same place already has (web fonts swapping in).
    await page.goto(base + PLAIN_LINK, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const control = await page.evaluate(() => window.__cls);
    check(landed.cls <= control + 0.001, `${tag} the panel adds no layout shift`, `?h= ${landed.cls.toFixed(4)} vs ?p= ${control.toFixed(4)}`);
    await page.goto(base + EDITOR_LINK, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
  }

  if (profile.shareSheet) {
    await page.locator('#passage-panel [data-action="share"]').tap();
    await page.waitForTimeout(200);
    const shared = await page.evaluate(() => window.__shared.at(-1));
    check(
      Boolean(shared) && /[?&]h=/.test(shared.url) && !/[?&]src=/.test(shared.url) && shared.text.includes("So what?"),
      `${tag} the panel's Share hands the sheet the quote and its link, without the post's tracking tag`,
      JSON.stringify(shared)
    );
  }
  const before = marksPosted.length;
  await page.locator('#passage-panel [data-action="close"]').tap();
  check((await page.locator("#passage-panel").count()) === 0, `${tag} the panel closes`);
  check(marksPosted.length === before && before === 0, `${tag} the panel records no mark (no D1 write)`, String(marksPosted.length));

  // A passage that is nobody's highlight.
  await page.goto(base + PLAIN_LINK, { waitUntil: "networkidle" });
  const readerLink = await page.evaluate(() => {
    const p = document.getElementById("just-before-2-24-p");
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    // The longest run of prose: marks other readers (and earlier runs against
    // the same local D1) left split the text into shorter nodes.
    let node = null;
    while (walker.nextNode()) {
      const candidate = walker.currentNode;
      if (candidate.parentElement.closest(".sidenote, .permalink")) continue;
      if (!node || candidate.data.length > node.data.length) node = candidate;
    }
    const range = document.createRange();
    range.setStart(node, 2);
    range.setEnd(node, Math.min(node.data.length - 1, 42));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return range.toString();
  });
  await page.waitForTimeout(700);

  // ---------- the dock ----------

  const dock = await page.evaluate(() => {
    const pop = document.getElementById("share-pop");
    const r = pop.getBoundingClientRect();
    const shown = [...pop.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent);
    return {
      open: pop.getAttribute("data-open"),
      mode: pop.getAttribute("data-mode"),
      fixed: getComputedStyle(pop).position,
      bottom: Math.round(window.innerHeight - r.bottom),
      width: Math.round(r.width),
      viewport: window.innerWidth,
      buttons: shown,
      minHeight: Math.min(...[...pop.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().height)),
      url: pop.getAttribute("data-url") ?? "",
    };
  });
  check(dock.open === "true" && dock.mode === "dock", `${tag} a touch selection opens the share dock`, JSON.stringify(dock));
  check(dock.fixed === "fixed" && dock.bottom === 0 && dock.width === dock.viewport, `${tag} the dock sits along the bottom, clear of the OS selection menu`, JSON.stringify(dock));
  check(
    JSON.stringify(dock.buttons) === JSON.stringify(profile.shareSheet ? ["Share", "Copy quote", "Save"] : ["Copy link", "Copy quote", "Save"]),
    `${tag} the dock offers ${profile.shareSheet ? "Share" : "Copy link"}, Copy quote, Save`,
    JSON.stringify(dock.buttons)
  );
  check(dock.minHeight >= 44, `${tag} dock buttons are at least 44px tall`, String(dock.minHeight));
  check(/[?&]h=/.test(dock.url), `${tag} a touch selection makes a quote link`, dock.url.slice(-60));
  if (shots) await page.screenshot({ path: join(shots, `${slug(profile.name)}-dock.png`) });

  // Scrolling (as dragging a handle does) leaves the dock where it is.
  await page.evaluate(() => window.scrollBy(0, 40));
  await page.waitForTimeout(150);
  check(
    (await page.evaluate(() => document.getElementById("share-pop").getAttribute("data-open"))) === "true",
    `${tag} scrolling keeps the dock open`
  );

  const posted = marksPosted.length;
  const first = profile.shareSheet ? "share" : "copy-link";
  await page.locator(`#share-pop [data-action="${first}"]`).tap();
  await page.waitForTimeout(300);
  if (profile.shareSheet) {
    const shared = await page.evaluate(() => window.__shared.at(-1));
    check(Boolean(shared) && shared.url === dock.url, `${tag} Share hands the sheet the selection's link`, JSON.stringify(shared));
  }
  check(marksPosted.length === posted + 1 && marksPosted.at(-1)?.kind === "share", `${tag} sharing from the dock records one mark, as the desktop popover does`, String(marksPosted.length - posted));

  await page.locator('#share-pop [data-action="save"]').tap();
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? "").includes("just-before-2-24-p")));
  check(saved, `${tag} Save from the dock keeps the highlight`);

  // The dock closes once the selection does — after it has shown "Saved".
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.waitForTimeout(2200);
  check(
    (await page.evaluate(() => document.getElementById("share-pop").getAttribute("data-open"))) === "false",
    `${tag} the dock closes when the selection does`
  );

  // Following the reader's link lands with a reader's panel.
  await page.goto(dock.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const reader = await page.evaluate(() => ({
    kicker: document.querySelector(".passage-panel-kicker")?.textContent ?? "",
    quote: document.querySelector(".passage-panel-quote")?.textContent ?? "",
  }));
  check(reader.kicker === "Shared passage", `${tag} a reader's passage is labelled "Shared passage"`, reader.kicker);
  check(reader.quote.replace(/\s+/g, " ").includes(readerLink.replace(/\s+/g, " ").trim().slice(0, 30)), `${tag} its panel quotes the reader's words`, reader.quote);
  if (shots) await page.screenshot({ path: join(shots, `${slug(profile.name)}-landing-reader.png`) });

  // Starting a new selection closes the panel, so the dock does not stack on it.
  await page.evaluate(() => {
    const p = document.querySelector(".prose p[id]");
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.waitForTimeout(700);
  check((await page.locator("#passage-panel").count()) === 0, `${tag} a new selection closes the landing panel`);

  check(errors.length === 0, `${tag} no page errors`, errors.join(" | "));
  await browser.close();
}

// ---------- desktop: the panel as a card, Escape closes it ----------

{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + EDITOR_LINK, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => {
    const panel = document.getElementById("passage-panel");
    const r = panel?.getBoundingClientRect();
    return {
      right: r ? Math.round(window.innerWidth - r.right) : null,
      width: r ? Math.round(r.width) : 0,
      bluesky: panel?.querySelector('[data-action="bluesky"]')?.getAttribute("href") ?? "",
      mode: document.getElementById("share-pop").getAttribute("data-mode"),
    };
  });
  check(card.right !== null && card.right > 0 && card.width < 500, "[desktop] the panel is a card at the bottom right", JSON.stringify(card));
  check(card.bluesky.startsWith("https://bsky.app/intent/compose?text="), "[desktop] the panel offers a Bluesky post", card.bluesky.slice(0, 60));
  check(card.mode === "float", "[desktop] the selection popover still floats");
  if (shots) await page.screenshot({ path: join(shots, "desktop-landing-editor.png") });
  await page.keyboard.press("Escape");
  check((await page.locator("#passage-panel").count()) === 0, "[desktop] Escape closes the panel");
  await browser.close();
}

function slug(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
