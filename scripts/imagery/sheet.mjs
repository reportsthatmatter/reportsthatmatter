/* Contact sheet: every argument after the output is shown at the three sizes a
 * mark actually gets used at, on the real canvas colour. Marks are judged at
 * 64px in an archive row, not at 1:1. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
const [out, ...files] = process.argv.slice(2);
const cells = files.map((f) => {
  const u = `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  return `<div style="text-align:center">
   <div style="height:300px;display:grid;place-items:center;background:#f7f7f7"><img src="${u}" style="max-height:290px;max-width:100%"></div>
   <div style="height:190px;display:grid;place-items:center;background:#f7f7f7"><img src="${u}" style="max-height:180px"></div>
   <div style="height:80px;display:grid;place-items:center;background:#f7f7f7"><img src="${u}" style="max-height:64px"></div>
   <div style="font:10px/1.6 monospace;color:#8a8a8c;padding:6px 0">${basename(f).replace(/\.png$/,"")}</div></div>`;
}).join("");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Math.min(1600, 40 + files.length * 260), height: 640 }, deviceScaleFactor: 2 });
await p.setContent(`<body style="margin:0;background:#f7f7f7;padding:20px"><div style="display:grid;grid-template-columns:repeat(${files.length},1fr);gap:14px">${cells}</div></body>`);
await p.waitForTimeout(700);
await p.screenshot({ path: out, fullPage: true });
await b.close();
