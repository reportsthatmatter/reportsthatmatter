/* Renders candidate marks into the three places one would actually appear —
 * an archive row, a report header, a share card — using this repo's own
 * stylesheet and markup, so the comparison is against real type at real size.
 *
 *   node scripts/imagery/mockups.mjs <marks-dir> <out-dir>
 *
 * Expects <marks-dir>/<set>-<report>.png. Every set found is rendered.
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [marksDir, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "assets/styles.css"), "utf8");
const uri = (f) => `data:image/png;base64,${readFileSync(join(marksDir, f)).toString("base64")}`;

const files = readdirSync(marksDir).filter((f) => f.endsWith(".png"));
const sets = {};
for (const f of files) {
  const [set, report] = f.replace(/\.png$/, "").split("-");
  (sets[set] ??= {})[report] = uri(f);
}

// The ten rows as the archive listed them in the study, so an incomplete set
// is seen for what it is. Hard-coded: a report added since will not appear here
// until it is added below — check new plates on the real /reports page instead
// (docs/plates.md, step 5).
const rows = [
  ["jack", "Report of Special Counsel Jack Smith, Volume One: The Election Case", "Jack Smith, Special Counsel, U.S. Department of Justice · January 2025"],
  ["psi", "Wall Street and the Financial Crisis: Anatomy of a Financial Collapse", "U.S. Senate Permanent Subcommittee on Investigations · 13 April 2011"],
  ["challenger", "Investigation of the Challenger Accident", "Committee on Science and Technology, U.S. House of Representatives · October 1986"],
  ["litvinenko", "The Litvinenko Inquiry", "Sir Robert Owen (Chairman) · 21 January 2016"],
  ["leveson", "An Inquiry into the Culture, Practices and Ethics of the Press", "The Right Honourable Lord Justice Leveson · 29 November 2012"],
  ["columbia", "Columbia Accident Investigation Board Report, Volume I", "Columbia Accident Investigation Board · August 2003"],
  ["911", "The 9/11 Commission Report", "National Commission on Terrorist Attacks Upon the United States · 22 July 2004"],
  ["deepwater", "Deep Water: The Gulf Oil Disaster and the Future of Offshore Drilling", "National Commission on the BP Deepwater Horizon Oil Spill and Offshore Drilling · January 2011"],
  ["philipmorris", "United States v. Philip Morris USA Inc.: Amended Final Opinion", "Gladys Kessler, U.S. District Judge, District of Columbia · 17 August 2006"],
  ["hillsborough", "The Report of the Hillsborough Independent Panel", "Hillsborough Independent Panel (the Rt Revd James Jones, Chair) · 12 September 2012"],
];

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=IBM+Plex+Mono:wght@400&family=Inter:wght@400;500&display=swap" rel="stylesheet">`;

/* The one piece of new CSS a mark costs: a leading column on the row, and a
 * fixed slot so ten marks of different proportions line up on one axis. */
const markCss = `
  .report-list a { grid-template-columns: 92px minmax(0,3fr) minmax(0,1.4fr) auto; align-items: center; }
  .report-mark { width: 92px; height: 92px; display: grid; place-items: center; }
  .report-mark img { max-width: 92px; max-height: 92px; width: auto; height: auto; }
  .report-header .frontispiece { display: grid; place-items: center; padding-bottom: 2rem; }
  .report-header .frontispiece img { max-height: 220px; max-width: 300px; }
`;

const archive = (set) => `<!doctype html><html><head><meta charset="utf-8">${fonts}
<style>${css}${markCss}</style></head><body>
<header class="site-header wrap"><a class="wordmark" href="/"><span>Reports that Matter</span></a>
<nav class="site-nav mono"><a>Reports</a><a>Search</a><a>Highlights</a><a>About</a></nav></header>
<main><section class="report-header wrap"><p class="kicker mono">The archive</p><h1>Reports</h1>
<p class="byline mono">10 reports published</p></section>
<section class="section wrap" style="border-top:0"><ul class="report-list">
${rows.map(([id, title, meta]) => `<li><a>
  <span class="report-mark">${sets[set][id] ? `<img src="${sets[set][id]}">` : ""}</span>
  <span class="title serif">${title}</span>
  <span class="meta mono">${meta}</span>
  <span class="cue mono">Read →</span></a></li>`).join("")}
</ul></section></main></body></html>`;

const header = (set, id, title, meta) => `<!doctype html><html><head><meta charset="utf-8">${fonts}
<style>${css}${markCss}</style></head><body>
<header class="site-header wrap"><a class="wordmark"><span>Reports that Matter</span></a>
<nav class="site-nav mono"><a>Reports</a><a>Search</a><a>About</a></nav></header>
<main><header class="report-header wrap"><div class="measure">
  ${sets[set][id] ? `<div class="frontispiece"><img src="${sets[set][id]}"></div>` : ""}
  <p class="kicker mono">Report</p><h1>${title}</h1>
  <p class="byline mono">${meta}</p>
  <p class="byline mono"><a>Original document ↗</a></p>
</div></header></main></body></html>`;

const card = (set, id, quote, cite) => `<!doctype html><html><head><meta charset="utf-8">${fonts}
<style>*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px}
body{background:#f7f7f7;color:#252525;padding:64px 72px;display:flex;flex-direction:column;
justify-content:space-between;font-family:"IBM Plex Mono",monospace}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:48px}
.mark{font-family:"EB Garamond",serif;font-size:25px}
blockquote{font-family:"EB Garamond",serif;font-size:48px;line-height:1.22;color:#252525;max-width:15.5em}
.imprint img{max-height:190px;max-width:200px}
footer{font-size:16px;letter-spacing:.09em;text-transform:uppercase;color:#8a8a8c;
border-top:1px solid #cfcfcf;padding-top:20px}</style></head><body>
<div class="top"><div class="mark">Reports that Matter</div>
<div class="imprint">${sets[set][id] ? `<img src="${sets[set][id]}">` : ""}</div></div>
<blockquote>${quote}</blockquote>
<footer>${cite}</footer></body></html>`;

const b = await chromium.launch();
for (const set of Object.keys(sets)) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();

  await p.setContent(archive(set), { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(outDir, `archive-${set}.png`), fullPage: true });

  await p.setContent(header(set, "columbia", "Columbia Accident Investigation Board Report, Volume I",
    "Columbia Accident Investigation Board · August 2003"), { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(outDir, `header-${set}.png`) });

  const cp = await ctx.newPage();
  await cp.setViewportSize({ width: 1200, height: 630 });
  await cp.setContent(card(set, "columbia",
    "The organizational causes of this accident are rooted in the Space Shuttle Program&rsquo;s history and culture.",
    "p. 9 &nbsp;·&nbsp; Columbia Accident Investigation Board Report"), { waitUntil: "networkidle" });
  await cp.waitForTimeout(500);
  await cp.screenshot({ path: join(outDir, `card-${set}.png`) });

  await ctx.close();
  console.log(`${set}: archive, header, card`);
}
await b.close();
