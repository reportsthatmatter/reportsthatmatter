/* Crops a region out of a source raster. `pdftoppm` gives whole pages; a mark
 * is one object on one page, so every source in sources.yaml carries a box. */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname } from "node:path";
const [src, out, X, Y, W, H] = process.argv.slice(2);
const m = /\.jpe?g$/i.test(src) ? "jpeg" : "png";
const b = await chromium.launch(); const p = await b.newPage();
await p.goto("about:blank");
const uri = await p.evaluate(async ({ u, X, Y, W, H }) => {
  const i = new Image(); i.src = u; await i.decode();
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d").drawImage(i, X, Y, W, H, 0, 0, W, H);
  return c.toDataURL("image/png");
}, { u: `data:image/${m};base64,${readFileSync(src).toString("base64")}`, X: +X, Y: +Y, W: +W, H: +H });
await b.close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(uri.split(",")[1], "base64"));
console.log(out, `${W}x${H}`);
