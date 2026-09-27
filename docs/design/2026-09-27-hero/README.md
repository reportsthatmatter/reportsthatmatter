# Hero imagery on report landing pages — design

Bead `reportsthatmatter-cdp.1`, 2026-09-27. Epic `reportsthatmatter-cdp`. Decided and proceeded; Rufus reviews later.

## The brief

Rufus, 2026-09-26: a good, specific photograph on each report's landing page "makes a big difference", more than the plate marks. A photograph of the event (the Hillsborough disaster, the Capitol riot) beats a logo. Fair use is acceptable; record the credit. The landing page may be the one place on the site with colour, toned down.

## Options tried

Mocked against the live landing pages of Jack Smith, Hillsborough and Challenger, at 1440×1000 and 390×844 (`mockups/`).

1. **Band**: a full-bleed photograph above the header; title, standfirst and everything else below it, unchanged.
2. **Cover**: a full-bleed photograph with the kicker and title set over it in white, darkened for legibility.
3. **Cover with scanlines**: option 2 with a retro-TV raster (the louder register of `reportsthatmatter-bea`).
4. **Figure**: the photograph inside the text column, in place of the plate, with a caption.

## Decision: the band

- **Cover** pushes the title below the fold on a laptop, needs a scrim and white type (the site has neither anywhere else), and makes every landing page look like a news site. The scanline version is louder still. `reportsthatmatter-bea` stays open as a future exploration; it is not this.
- **Figure** is too timid. At 37rem the photograph reads as a thumbnail and does not change the page.
- **Band** gives the image the full width while keeping the text exactly as it is. There is no text on the image, so legibility is never the image's problem, and a photograph that turns out wrong can be swapped without touching the layout.

## Rules

- **Placement**: full-bleed, directly under the site header, above the report header. Height `clamp(200px, 30vw, 420px)`: about 420px on a laptop, so the title stays above the fold; about 120px of it is lost on a phone, where 200px still reads.
- **Crop**: `object-fit: cover`, with a per-image focal point (`focus: "50% 40%"`) in the editorial file so the subject survives the wide crop. Choose images that crop to about 3.4:1 on a laptop and 2:1 on a phone.
- **Credit**: one mono line under the image, right-aligned in the gutter, muted: what it shows, the date, then photographer and licence (`The Capitol, 6 January 2021 · Photo: Tyler Merbler, CC BY 2.0`). It links to the source page. Fair-use images say so in the sourcing record, not on the page.
- **Alt text**: required. Describe what the photograph shows; it is content, not decoration.
- **Treatment, baked into the file** (as the plates are; no CSS filters): saturation reduced to about 45%, levels lifted so blacks sit at about 16 and whites at about 244 on the off-white page, and light grain. The colour is kept, so the noose's orange rope on the Capitol still reads, but it sits with the greys of the site.
- **Size**: WebP, 2400px wide (served in the band at up to 1440 CSS px, sharp on 2× screens at typical widths), plus a 1200px variant through `srcset`. Committed to `assets/heroes/<id>.webp` and `assets/heroes/<id>-1200.webp`, generated from the source by a script that records source URL, credit, licence and treatment settings.
- **The plate**: on a landing page with a hero, the frontispiece plate is not shown (two images compete). The plate stays everywhere else: the archive row, section pages and share cards.
- **Only the landing page.** Section pages, search and the archive stay monochrome.
- **Dark mode**: the site has none; nothing to do.
- **No hero, no change**: a report without an image keeps its plate and reads exactly as before.

## Choosing the image

See the sourcing guide (`docs/hero-images.md`). In short: the event, specifically, with dignity; not the report's cover or a logo. Prefer public domain or free licences; fair use is acceptable when nothing free is as good.

## Mockups

A representative few of the 24 shots, on the Jack Smith landing page at 1440×1000 unless noted (compressed to 256 colours; the mockups used an earlier, heavier grain and a grey figure background that the real build dropped):

- `mockups/jack-smith-vol1--band--desk.png` and `--band--phone.png` (390×844): the band, chosen.
- `mockups/jack-smith-vol1--cover--desk.png` and `--cover-tv--desk.png`: the cover, plain and with scanlines.
- `mockups/jack-smith-vol1--figure--desk.png`: the figure in the text column.
- `mockups/sheet-jack-smith-vol1.png`: all four side by side.

## Implementation (pilot, bead `reportsthatmatter-cdp.3`)

- **The editorial file** carries an optional `hero: { src, alt, credit, source, focus, licence }`. `pnpm editorial` fails without alt text, a credit, an http(s) source, a well-formed focus, or either file on disk, and records each file's pixel size so the `<img>` carries its dimensions.
- **The files** are built by `pnpm heroes` (`scripts/imagery/heroes.mjs`) from `sources.yaml` in this directory, which records each photograph's source, creator, licence or fair-use basis, and treatment. Saturation 0.45, levels 16–244, grain ±10 of 255 at the midtones easing off at both ends, seeded; lossy WebP at quality 80. The raw photographs are not committed, as with the plates' external sources.
- **The markup** is `renderHero()` in `src/templates/editorial.ts`, placed by `renderReportOverview()` above the report header, only when the landing page itself is shown (approved, or a draft under `?draft`); the frontispiece plate is then left out. The CSS class is `.report-hero`, not `.hero`: `.hero` is the homepage's padded, centred intro block, and inheriting it is what gave the mockup band its unwanted padding.
- **Pilot images**: Jack Smith, Tyler Merbler's gallows before the Capitol dome (CC BY 2.0). Hillsborough, John Giles/PA's photograph of the Leppings Lane end on 15 April 1989 (fair use), not the research's modern aerial: Rufus asked for the event itself.
