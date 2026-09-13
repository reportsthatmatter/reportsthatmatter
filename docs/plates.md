# Report plates — adding or changing one

Every published report has a **plate**: one treated greyscale image, drawn from the report's own evidence, shown in its archive row, above its title, and on its share cards. This is the working recipe. The reasoning behind it — why grain and not a halftone, why plates and not cut-outs, why the exhibit and not the event — is the study in [`docs/design/2026-09-12-imagery/README.md`](design/2026-09-12-imagery/README.md). Read that once; follow this every time.

`verify.sh` enforces the one hard rule: `tests/plates.test.ts` fails if a report in `reports/registry.yaml` has no plate. So adding a report means adding its plate, in the same change.

## Where a plate appears, and what it is made of

| Place | Slot | File served | Code |
| --- | --- | --- | --- |
| Archive row (`/reports`, homepage) | 92px box (64px under 48rem) | `assets/marks/<report-id>-row.webp` | `rowMark()` in `src/templates/index.ts` |
| Report header (contents page, `/full`) | fits 300×220, centred | `assets/marks/<report-id>.webp` | `frontispiece()` in `src/templates/report.ts` |
| Share cards (quote and default) | top right, fits 200×190 | `<report-id>.webp`, inlined | `scripts/cards.mjs` → `src/templates/card.ts` |

Both files come from one entry in [`docs/design/2026-09-12-imagery/sources.yaml`](design/2026-09-12-imagery/sources.yaml), built by `pnpm marks`. The row file is *treated separately* at 276px rather than resized from the 660px one, because the grain is fixed to output pixels and a resize would average it away. Both are lossless WebP, and both are committed — a deploy has no report PDFs to rebuild them from. `src/generated/marks.ts` records each plate's pixel size so every `<img>` carries its dimensions.

## Before you start

- **Tools:** `pdftoppm` and `pdfimages` (Homebrew `poppler`), `cwebp` (Homebrew `webp`), and Playwright's Chromium (already a dev dependency — the crop and treatment run in a headless canvas).
- **The report's own repo, cloned as a sibling** of this one (`../<report-repo>`). `reports/manifest.yaml` maps the registry id to that directory; they are not always the same name (`jack-smith-vol1` lives in `../jack-smith-report`).
- **If you are in a git worktree, give it its own `node_modules`** (`CI=true pnpm install --frozen-lockfile`). A symlink to the main checkout's breaks every `pnpm` script.

## 1. Choose the subject

**The plate is the exhibit, never the event.** Show the thing the inquiry's finding turns on, not the harm it investigated. A hole in a wing panel, not the shuttle breaking up; a stairwell diagram, not the towers burning. It should read as evidence, not decoration.

Look for a source in this order, and stop at the first that works:

1. **A photograph or figure inside the report's own PDF** that shows the finding. Rights are then the report's own, already recorded in its repo's README. (Columbia, Deepwater, Challenger, Litvinenko, 9/11, Hillsborough.)
2. **An exhibit or facsimile inside the PDF** — a bates-stamped document, a seal on the report's letterhead. (PSI's securitisation chart, Jack Smith's DOJ seal.)
3. **An external source, only when the PDF has no usable imagery at all** — say why in the entry, and record the rights position plainly. (Philip Morris: a CDC public-domain photo of a warning label. Leveson: the final News of the World front page, fair use.)

Never: portraits of perpetrators or victims, crowds, scenes of the harm itself, or stock imagery. Rufus's position (2026-09-12) is that rights are not a blocker for this public-interest project — but record credits and rights accurately anyway, the way a report records its sources.

**Finding candidates:** `pdfimages -list <pdf>` lists every embedded image with its page and size — large images are the photographs. Scanned PDFs (every page one full-page image, like Jack Smith) show nothing useful here; page through a low-resolution raster instead: `pdftoppm -png -r 60 -f <page> -l <page> <pdf> /tmp/look`.

## 2. Measure the crop

`crop` is `[x, y, width, height]` in pixels **of the page rasterised at the entry's `dpi`**. So rasterise at that dpi before measuring — coordinates read off a 60dpi preview must be scaled by `dpi / 60`.

- **Measure, don't eyeball.** The first Jack Smith crop was set by eye and caught half the seal plus the letterhead rule. For a distinct object on a white page, find its ink bounding box programmatically (rasterise with `pdftoppm -gray` to a PGM and scan for dark pixels — the approach recorded in `sources.yaml`'s Jack Smith entry), then add about 10% margin.
- **Trim everything that is not the subject:** page margin, captions, credit lines, legend fragments. They are invisible at 92px and obvious at 300px — Litvinenko and 9/11 both shipped with these on the first pass and were re-cropped.
- **Crop tighter for line art.** A whole diagram is grey scribble at 92px. Take the part with the most mass: PSI's title and first tier of boxes, not the whole chart; Hillsborough's turnstile arc, not the whole sheet.
- Aim for at least ~660px on the long edge of the cropped source. Smaller sources get upscaled and go soft (Leveson's 276×341 source is the known case).

## 3. Set the treatment

Omit anything that matches the `defaults` block at the top of `sources.yaml` (`width: 660`, `grain: 96`, `clump: 2`, `seed: 1`). Plates always take `cut: none`.

| Source kind | `black` | `white` | `grain` | Examples |
| --- | --- | --- | --- | --- |
| Photograph | 0.04–0.10 | 0.85–0.92 | 60–100 | Columbia, Deepwater, Philip Morris, Leveson |
| Rendering or dense figure | 0.05–0.20 | 0.88–0.90 | 55–90 | 9/11, Litvinenko, Jack Smith's seal |
| Thin line art | 0.30–0.45 | 0.82–0.92 | 30–60 | Challenger, PSI, Hillsborough |

`black` is the input level mapped to full ink: raising it thickens and darkens thin lines, which is what lets line art survive the row. `grain` is the plate's tooth — keep it lower on line art, where there are no midtones for it to sit in. The full option list is in the header of `scripts/imagery/treat.mjs`.

## 4. Add the entry

```yaml
  - id: shortname            # the build's handle: `pnpm marks shortname`
    set: plate
    report: report-repo-dir  # the sibling directory name, not the registry id
    pdf: archive/the-report.pdf
    page: 42                 # 1-based PDF page, not the printed page number
    dpi: 200
    crop: [x, y, width, height]
    subject: >-
      What it shows, where in the report (figure number, printed page), and
      why it is the exhibit rather than the event. Name what you avoided and why.
    rights: >-
      Whose work it is and on what terms; the credit line exactly as the report
      prints it, with its page.
    treat: { black: 0.10, white: 0.90, grain: 80, cut: none }
    caveat: >-                # optional: anything a future reader should re-check
      Known weakness, and what would fix it.
```

For an external source, replace `pdf`/`page`/`dpi` with `external: "<url>"` (fetched once and cached by URL hash in the OS temp dir).

## 5. Build, look, ship

```bash
pnpm marks shortname          # candidate PNG + assets/marks/<id>.webp, <id>-row.webp + src/generated/marks.ts
pnpm cards                    # re-renders share cards, which embed the plate
./scripts/verify.sh           # includes tests/plates.test.ts
```

Then **look at it on the real pages** before committing — `pnpm dev`, or `wrangler dev --local`, and open `/reports` at desktop width and at 400px, and the report's contents page. Every defect found in the first rollout (plates overflowing the row, a missing margin under the frontispiece, a phone header squeezed into five rows, crops carrying captions) passed the tests and was only visible on the page. `pnpm mark-mockups` also renders comparison pages, but its row list in `scripts/imagery/mockups.mjs` is hard-coded to the first ten reports.

Check before committing:

- [ ] Reads as a picture at 92px in the archive row, not grey scribble.
- [ ] Nothing but the subject at header size — no margin, caption, legend or page furniture.
- [ ] `pnpm cards` finished without a `✗` (it fails any card whose content overflows 630px).
- [ ] `subject`, `rights` and the credit line are filled in and accurate.

Commit `docs/design/2026-09-12-imagery/sources.yaml`, the candidate PNG, `assets/marks/`, `src/generated/marks.ts`, and `assets/cards/`. Plates are app assets, so **they need a Worker deploy** (`./scripts/deploy-cloudflare.sh`) — publishing the report's text does not ship them. Log the change per the Changelog checklist in `AGENTS.md`.

## Changing an existing plate

Edit its entry, then the same chain: `pnpm marks <id>`, `pnpm cards`, look, verify, commit, deploy. `pnpm marks <id>` rewrites the size manifest from everything on disk in `assets/marks/`, so rebuilding one never drops the others. When you replace a crop, leave a comment above it recording the old value and why it changed — the existing entries do this.

## The brand mark

The navbar is the wordmark alone. The favicon and app icon are the pilcrow in the seal: source `assets/brand/candidates/pilcrow-seal.svg`, rendered by `node scripts/imagery/brand.mjs` to `assets/brand/pilcrow-{16,32,64,180,512}.png` (180 and 512 get an opaque ground, because iOS paints a transparent app icon's background black). The script renders in Chromium with EB Garamond actually loaded, and fails if it isn't — the ¶ is live text in the SVG, and a fallback font would move it off centre.

If you edit the SVG, re-measure the glyph rather than nudging it by eye: its ink box, from canvas `measureText` in EB Garamond at the SVG's font size, should be centred on 50,50 (the method and numbers are in the SVG's own comment). The old full-seal PNGs, `assets/brand/logo-*.png`, are no longer used by the site or the cards.

## Known limits

- **Hillsborough and PSI** are thin line art and remain the weakest two at row size.
- **Leveson**'s source is 276×341, upscaled about 2.4×, and softer than the rest up close. Swap in a larger scan of the same front page if one turns up.
- **The mockup script** lists the original ten reports by hand; a new report will not appear in `pnpm mark-mockups` until it is added to `rows`.
- **A bolder landing-page image direction** (colour, CRT-style raster) is a separate register and deliberately not part of this pipeline — bead `reportsthatmatter-bea`.
