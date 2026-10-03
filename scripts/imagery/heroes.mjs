/* Builds each report's landing-page hero from its source photograph, per
 * docs/design/2026-09-27-hero/sources.yaml (bead reportsthatmatter-cdp.3).
 *
 *   pnpm heroes                      # all of them
 *   pnpm heroes jack-smith-vol1      # one report's
 *
 * Writes assets/heroes/<report>.webp (2400px wide) and <report>-1200.webp,
 * both committed: a deploy has no source photographs to rebuild them from.
 * The treatment is baked into the file, as the plates' is — no CSS filters:
 * saturation down to about 45%, levels so blacks sit at 16 and whites at 244
 * on the off-white page, and a light seeded grain. Each width is treated at
 * its own size rather than resized from the other, because the grain is fixed
 * to output pixels and a resize would average it away.
 *
 * Chromium's canvas is the raster engine, as in treat.mjs: there is no
 * ImageMagick and sharp is not a dependency, but Playwright already is.
 * Needs cwebp (Homebrew webp). Fetches are cached in the OS temp dir by URL
 * hash, like `pnpm marks`; delete the cache dir to force a refetch.
 */
import "../lib/help.mjs";
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { parse } from "yaml";
import { webpSize } from "./webp.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const spec = parse(readFileSync(join(root, "docs/design/2026-09-27-hero/sources.yaml"), "utf8"));
const shipDir = join(root, "assets/heroes");
const only = process.argv.slice(2);

mkdirSync(shipDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "rtm-heroes-"));
const cacheDir = join(tmpdir(), "rtm-heroes-fetch-cache");
mkdirSync(cacheDir, { recursive: true });

function fetchSource(url) {
  const ext = extname(new URL(url).pathname) || ".jpg";
  const cached = join(cacheDir, `${createHash("sha256").update(url).digest("hex")}${ext}`);
  if (!existsSync(cached)) {
    // Wikimedia rate-limits anonymous bot-like traffic; say who we are.
    execFileSync("curl", ["-sfL", "-A", "ReportsThatMatter/1.0 (https://reportsthatmatter.org)", "-o", cached, url]);
  }
  const head = readFileSync(cached).subarray(0, 4);
  if (!(head[0] === 0xff && head[1] === 0xd8) && head.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${url} did not return a JPEG or PNG (a 429 page?); delete ${cached} and retry`);
  }
  return cached;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

/** One treated PNG, as a Buffer, at `width` px wide. */
async function treat(source, width, opt) {
  const mime = /\.png$/i.test(source) ? "png" : "jpeg";
  const uri = await page.evaluate(async ({ srcUri, width, opt }) => {
    const img = new Image();
    img.src = srcUri;
    await img.decode();
    const W = Math.min(width, img.naturalWidth);
    const H = Math.round((img.naturalHeight * W) / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, W, H);
    const im = x.getImageData(0, 0, W, H);
    const d = im.data;

    // Seeded xorshift, so a rebuild is byte-identical: these are committed.
    let s = (opt.seed * 2654435761) >>> 0;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const span = (opt.white - opt.black) / 255;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Grain is strongest in the midtones and eases off at both ends, so
      // shadows stay solid and highlights clean — the plates' rule, lighter.
      const n = (rnd() - 0.5) * 2 * (opt.grain / 255) * 4 * lum * (1 - lum);
      for (let k = 0; k < 3; k++) {
        const v = lum + opt.saturation * ([r, g, b][k] - lum) + n;
        d[i + k] = Math.round(opt.black + Math.min(1, Math.max(0, v)) * span * 255);
      }
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL("image/png");
  }, { srcUri: `data:image/${mime};base64,${readFileSync(source).toString("base64")}`, width, opt });
  return Buffer.from(uri.split(",")[1], "base64");
}

let built = 0;
for (const hero of spec.heroes) {
  if (only.length && !only.includes(hero.report)) continue;
  const opt = { ...spec.defaults, ...(hero.treat ?? {}) };
  const source = fetchSource(hero.image);
  for (const [width, name] of [[opt.width, `${hero.report}.webp`], [opt.small, `${hero.report}-1200.webp`]]) {
    const png = join(tmp, name.replace(/\.webp$/, ".png"));
    writeFileSync(png, await treat(source, width, opt));
    const out = join(shipDir, name);
    execFileSync("cwebp", ["-quiet", "-q", String(opt.quality), "-m", "6", "-sharp_yuv", "-metadata", "none", png, "-o", out]);
    const size = webpSize(readFileSync(out));
    console.log(`  ${name}  ${size.width}x${size.height}  ${Math.round(readFileSync(out).length / 1024)} KB`);
  }
  built++;
}
await browser.close();

console.log(`\n${built} hero(es) built into assets/heroes/`);
