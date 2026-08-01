/* Browser checks that HTTP assertions cannot make: does the page actually lay
 * out, do the fonts and stylesheet load, does highlight-to-share work.
 * Prints "ok <name>" per passing check; exits non-zero on any failure.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "http://localhost:8788";
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
page.on("requestfailed", (req) => failedRequests.push(req.url()));

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
  await page.goto(`${base}/reports/${firstReportId}`, { waitUntil: "networkidle" });

  const report = await page.evaluate(() => {
    const p1 = document.querySelector(".prose p[id]");
    const prose = document.querySelector(".prose");
    return {
      hasP1: Boolean(p1),
      hasPermalink: Boolean(p1 && p1.querySelector("a.permalink")),
      positionalIds: document.querySelectorAll('.prose p[id^="p-"]').length,
      sidenotes: document.querySelectorAll(".sidenote").length,
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

  // :target highlight actually applies
  await page.goto(`${base}/reports/${firstReportId}#${report.firstId}`, {
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
  await page.goto(`${base}/reports/${firstReportId}`, { waitUntil: "networkidle" });
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
}

// ---------- about ----------

await page.goto(`${base}/about`, { waitUntil: "networkidle" });
check(
  (await page.locator("h1").count()) === 1,
  "about page has exactly one h1"
);

check(consoleErrors.length === 0, "no console errors", consoleErrors.join(" | "));
check(failedRequests.length === 0, "no failed requests", failedRequests.join(" | "));

await browser.close();

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
