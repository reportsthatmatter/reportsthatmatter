/* The stipple treatment — one image in, one mark out.
 *
 * Reproduces the printing process documented in docs/design/2026-09-12-imagery/.
 * Chromium's canvas is the raster engine: there is no ImageMagick on this
 * machine and sharp is not a dependency, but Playwright already is.
 *
 *   node scripts/imagery/treat.mjs <source.png> <out.png> [--opt value ...]
 *
 * Options (all have defaults; see docs for what each one does to the plate):
 *   --width 660        long edge of the output, in px. 3x the largest slot.
 *   --black 0.10       input level mapped to full ink
 *   --white 0.92       input level mapped to bare paper
 *   --gamma 1.0        midtone bend, applied between the two levels
 *   --grain 96         noise amplitude, 0-160. This is the plate's tooth.
 *   --clump 2          noise generated at 1/clump scale, then resampled up
 *   --seed 1           PRNG seed, so a re-run is byte-identical
 *   --cut luma         silhouette: `luma` (threshold), `none`, or a `mask.png`
 *   --cut-at 0.86      luma above this is outside the silhouette
 *   --cut-below        the ground is darker than the subject, not lighter
 *   --invert           source is light-on-dark; flip before anything else
 *   --trim             crop to the silhouette's bounding box
 *   --keep 0.08        drop silhouette islands smaller than this share of the
 *                      largest one. A photographed object is one shape; the
 *                      specks a threshold leaves behind are the page it sat on.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname } from "node:path";

const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) {
  console.error("usage: treat.mjs <source> <out.png> [--opt value ...]");
  process.exit(1);
}
const opt = {
  width: 660, black: 0.1, white: 0.92, gamma: 1, grain: 96, clump: 2,
  seed: 1, cut: "luma", cutAt: 0.86, invert: false, trim: false, cutBelow: false, keep: 0.08,
};
for (let i = 0; i < rest.length; i++) {
  const k = rest[i].replace(/^--/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase());
  if (k === "invert" || k === "trim" || k === "cutBelow") opt[k] = true;
  else opt[k] = isNaN(+rest[i + 1]) ? rest[++i] : +rest[++i];
}

const mime = (p) => (extname(p).toLowerCase() === ".jpg" || extname(p).toLowerCase() === ".jpeg" ? "jpeg" : "png");
const dataUri = (p) => `data:image/${mime(p)};base64,${readFileSync(p).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

const png = await page.evaluate(async ({ srcUri, maskUri, opt }) => {
  const load = async (uri) => { const i = new Image(); i.src = uri; await i.decode(); return i; };
  const img = await load(srcUri);

  // 1. Resample to the plate size. The browser's own filtering is the
  //    downsample; it is the first of the two that give the grain its silk.
  const scale = opt.width / Math.max(img.naturalWidth, img.naturalHeight);
  const W = Math.max(1, Math.round(img.naturalWidth * scale));
  const H = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high";
  x.drawImage(img, 0, 0, W, H);
  const im = x.getImageData(0, 0, W, H);
  const d = im.data;

  // 2. Greyscale, then levels. Everything after this is single-channel.
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    if (opt.invert) v = 1 - v;
    v = (v - opt.black) / (opt.white - opt.black);
    v = Math.min(1, Math.max(0, v));
    if (opt.gamma !== 1) v = Math.pow(v, opt.gamma);
    lum[p] = v;
  }

  // 3. The silhouette. Co-Star's cutouts are hard-edged: the paper outside the
  //    object is transparent, but the object's own highlights stay white. A
  //    luma threshold gets there on its own when the subject was shot against
  //    a clean ground; anything else needs a mask painted by hand.
  const alpha = new Float32Array(W * H).fill(1);
  if (opt.cut === "luma") {
    // Flood from the border, so an enclosed highlight is never punched out.
    const outside = new Uint8Array(W * H);
    const stack = [];
    const isGround = opt.cutBelow ? (p) => lum[p] <= opt.cutAt : (p) => lum[p] >= opt.cutAt;
    const push = (p) => { if (!outside[p] && isGround(p)) { outside[p] = 1; stack.push(p); } };
    for (let px = 0; px < W; px++) { push(px); push((H - 1) * W + px); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop(), px = p % W, y = (p - px) / W;
      if (px > 0) push(p - 1);
      if (px < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    for (let p = 0; p < W * H; p++) if (outside[p]) alpha[p] = 0;
  } else if (opt.cut !== "none" && maskUri) {
    const m = await load(maskUri);
    const mc = document.createElement("canvas");
    mc.width = W; mc.height = H;
    const mx = mc.getContext("2d", { willReadFrequently: true });
    mx.imageSmoothingQuality = "high";
    mx.drawImage(m, 0, 0, W, H);
    const md = mx.getImageData(0, 0, W, H).data;
    for (let i = 0, p = 0; i < md.length; i += 4, p++) {
      alpha[p] = (0.299 * md[i] + 0.587 * md[i + 1] + 0.114 * md[i + 2]) / 255;
    }
  }

  // 3b. One object, not a constellation of specks. A luma threshold reliably
  //     leaves fragments of whatever else was light in the frame; anything far
  //     smaller than the main shape is the source photograph's background
  //     showing through, not part of the subject.
  if (opt.keep > 0 && opt.cut !== "none") {
    const label = new Int32Array(W * H).fill(-1);
    const sizes = [];
    for (let p0 = 0; p0 < W * H; p0++) {
      if (alpha[p0] <= 0.5 || label[p0] !== -1) continue;
      const id = sizes.length;
      let n = 0;
      const stack = [p0];
      label[p0] = id;
      while (stack.length) {
        const p = stack.pop(); n++;
        const px = p % W, y = (p - px) / W;
        const go = (q) => { if (label[q] === -1 && alpha[q] > 0.5) { label[q] = id; stack.push(q); } };
        if (px > 0) go(p - 1);
        if (px < W - 1) go(p + 1);
        if (y > 0) go(p - W);
        if (y < H - 1) go(p + W);
      }
      sizes.push(n);
    }
    const biggest = Math.max(0, ...sizes);
    for (let p = 0; p < W * H; p++) {
      if (label[p] !== -1 && sizes[label[p]] < biggest * opt.keep) alpha[p] = 0;
    }
  }

  // 4. The grain. A seeded PRNG so a re-run is byte-identical: these are
  //    committed assets, and a mark that changes on every build is a diff
  //    nobody can read.
  let s = (opt.seed * 2654435761) >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const cw = Math.max(1, Math.ceil(W / opt.clump));
  const ch = Math.max(1, Math.ceil(H / opt.clump));
  const noise = new Float32Array(cw * ch);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd() - 0.5;

  // Bilinear lift of the coarse noise back to full size. Generating the noise
  // below the plate resolution is what makes the dots clump into a tooth
  // instead of reading as television static.
  const noiseAt = (px, y) => {
    const fx = px / opt.clump, fy = y / opt.clump;
    const x0 = Math.min(cw - 1, Math.floor(fx)), y0 = Math.min(ch - 1, Math.floor(fy));
    const x1 = Math.min(cw - 1, x0 + 1), y1 = Math.min(ch - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    return (noise[y0 * cw + x0] * (1 - tx) + noise[y0 * cw + x1] * tx) * (1 - ty)
         + (noise[y1 * cw + x0] * (1 - tx) + noise[y1 * cw + x1] * tx) * ty;
  };

  // 5. Bite the plate. Grain is strongest in the midtones and eases off at
  //    both ends, so full ink stays solid and bare paper stays clean —
  //    without that the shadows fizz and the object loses its mass.
  for (let y = 0, p = 0; y < H; y++) {
    for (let px = 0; px < W; px++, p++) {
      const v = lum[p];
      const bite = 4 * v * (1 - v);
      const g = Math.round(255 * Math.min(1, Math.max(0, v + noiseAt(px, y) * (opt.grain / 255) * 2 * bite)));
      const i = p * 4;
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = Math.round(255 * alpha[p]);
    }
  }
  x.putImageData(im, 0, 0);

  // 6. Trim to the silhouette, so every mark fills its slot rather than
  //    carrying the source photograph's framing into the layout.
  let cx = c;
  if (opt.trim) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0, p = 0; y < H; y++) for (let px = 0; px < W; px++, p++) {
      if (d[p * 4 + 3] > 8) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 > x0 && y1 > y0) {
      const t = document.createElement("canvas");
      t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
      t.getContext("2d").drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
      cx = t;
    }
  }
  return { uri: cx.toDataURL("image/png"), w: cx.width, h: cx.height };
}, { srcUri: dataUri(src), maskUri: opt.cut !== "luma" && opt.cut !== "none" ? dataUri(opt.cut) : null, opt });

await browser.close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(png.uri.split(",")[1], "base64"));
console.log(`${out}  ${png.w}x${png.h}`);
