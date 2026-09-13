/* Renders the small-size brand mark — the pilcrow in the seal — to the PNGs
 * the favicon and app icon links point at.
 *
 *   node scripts/imagery/brand.mjs
 *
 * Rasterised in Chromium with EB Garamond actually loaded: the SVG sets the ¶
 * as text, and a favicon rendered from it directly would fall back to whatever
 * serif the viewer has, which moves the glyph off centre. The PNGs are the
 * shipped form; the SVG is the source.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const svg = readFileSync(join(root, "assets/brand/candidates/pilcrow-seal.svg"), "utf8");
const sizes = [16, 32, 64, 180, 512];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&display=swap" rel="stylesheet">
   <style>html,body{margin:0;background:transparent}#m{width:512px;height:512px}#m svg{width:100%;height:100%;display:block}</style>
   <div id="m">${svg}</div>`,
  { waitUntil: "networkidle" }
);
const loaded = await page.evaluate(async () => {
  await document.fonts.load('58px "EB Garamond"', "¶");
  return document.fonts.check('58px "EB Garamond"', "¶");
});
if (!loaded) throw new Error("EB Garamond did not load — the ¶ would render in a fallback face");

for (const size of sizes) {
  await page.setViewportSize({ width: 512, height: 512 });
  await page.evaluate((s) => { const m = document.getElementById("m"); m.style.width = m.style.height = `${s}px`; }, size);
  // Favicons keep a transparent ground; the app icons get the site's paper,
  // because iOS paints a transparent apple-touch-icon's ground black.
  const opaque = size >= 180;
  await page.evaluate((o) => { document.body.style.background = o ? "#f7f7f7" : "transparent"; }, opaque);
  const png = await page.locator("#m").screenshot({ omitBackground: !opaque });
  writeFileSync(join(root, `assets/brand/pilcrow-${size}.png`), png);
  console.log(`assets/brand/pilcrow-${size}.png`);
}

// The press-page lockup: the same seal beside the wordmark, matching the
// navbar's markup so it's the same mark, not a redrawn approximation.
await page.setContent(
  `<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500&display=swap" rel="stylesheet">
   <style>
     html,body{margin:0;background:transparent}
     #lockup{display:inline-flex;align-items:center;gap:28px;padding:12px}
     #lockup svg{width:150px;height:150px;flex:0 0 auto}
     #lockup span{font-family:"EB Garamond",serif;font-weight:500;font-size:108px;color:#252525;
       letter-spacing:0.01em;white-space:nowrap}
   </style>
   <div id="lockup">${svg}<span>Reports that Matter</span></div>`,
  { waitUntil: "networkidle" }
);
await page.evaluate(async () => {
  await document.fonts.load('500 108px "EB Garamond"', "Reports that Matter");
});
await page.setViewportSize({ width: 1600, height: 300 });
const lockupPng = await page.locator("#lockup").screenshot({ omitBackground: true });
writeFileSync(join(root, "assets/brand/logo-lockup.png"), lockupPng);
console.log("assets/brand/logo-lockup.png");

await browser.close();
