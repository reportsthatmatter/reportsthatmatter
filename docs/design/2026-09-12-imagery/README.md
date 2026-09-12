# Imagery — the Co-Star study, and a mark per report

Issue [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99). Two deliverables: a written study of Co-Star's visual language specific enough to produce new work in it, and a mark per report. This is the study, plus a working treatment and three directions rendered against real pages.

**Shipped 2026-09-13** — the plate direction for all ten reports, and the pilcrow-in-seal favicon. See "Shipped" at the bottom for what went live and where it differs from the study. The direction is Rufus's pick, from the mockups below.

---

## Part 1 — what Co-Star's imagery actually is

Measured off costarastrology.com (home, about, press) on 2026-09-12 with Playwright: every image asset pulled, its pixels read back through a canvas, its laid-out size read off the DOM. `reference/` holds the study sheets. What follows is what the numbers say, several points of which contradict what the images look like.

### It is not one-bit, and it is not a halftone

This is the thing to get right, because the obvious reading is wrong. The images look like coarse dithered black-and-white. They are not. Every object asset carries **246–256 distinct grey levels**, with pure black under 2% of pixels and pure white under 8%. There is no threshold anywhere in the process.

Nor is there a screen. At 8× (`reference/costar-grain.png`, right panel) there is no dot grid, no angled rosette, no Bayer pattern — just grey values scattered pixel by pixel, clumping into runs of one to two pixels. It is **noise added to a greyscale photograph**, with the photograph's own luminance as the local mean.

That distinction is the whole effect. A halftone is a reproduction technique and reads as printing. Per-pixel grey noise reads as **tooth** — as aquatint, mezzotint, a stipple engraving — because that is physically what those are: ink density varying randomly at a scale below the eye's resolution.

### The grain belongs to the plate, not the subject

Dot size is constant across every asset regardless of what is in it or how big it is. So the texture reads as a property of the paper every image is printed on, which is exactly what makes ten unrelated objects look like one body of work. **Get this wrong per-image and the set falls apart**, however good the individual pictures are.

### Two downsamples give it the silk

Files are served at 2.5–3× their laid-out size (the magpie is 362px wide in a 125px slot) and the grain inside them is already 1–2px. So it is averaged twice before it reaches the eye — once by the browser, once by the display. That is why it reads as velvet rather than as noise, and it is not optional: the same file shown 1:1 looks gritty. Ship at 3×.

### Zero colour, and none of it is CSS

Measured saturation is 0.00–0.04% — total desaturation, not a `filter: grayscale()`. No asset on either page carries a CSS filter, blend mode, or opacity. **Everything is baked into the PNG.** The layout receives a finished object.

### Hard silhouette, white interior

The obvious guess — that light areas are transparent, so the object dissolves into the paper — is wrong, and I checked it directly by compositing every asset on red. The magpie's white breast stays white. The flower's pale petals stay white. Only the region *outside* the object's outline is transparent, and the cut is hard: partial-alpha pixels are 1–5% of the image on most assets.

This matters for production because it means **masking is real work**. There is no luminance trick that gets you a Co-Star cutout for free; the silhouette has to come from somewhere.

### The slot is fixed, the object is not

On /about, every object is laid out in a **125px box** — 125×121, 125×79, 125×177, 125×213, 125×109 — with two tall ones locked to 330px height instead. Wildly different proportions, one shared axis. The set is held together by the slot and the grain, not by cropping everything square.

### The subjects are neutral

Magpie, peony, skull, moth, stone, feather, Pluto, the Moon, fruit, a shell. Single object, no ground, no scene, no people. They carry mood, not information. **This does not transfer to us unexamined** — see the taste problem below.

### Everything else is CSS

The faint perspective linework behind the pages is not artwork; it is ruled lines converging on a vanishing point, at the very edge of visibility. The natal chart is a diagram. The only photographic element in the chart is a treated image of Earth at its hub — **a treated object placed inside a technical drawing**, which is the closest thing on their site to what this archive is made of.

### The recipe, stated so it can be executed

1. Greyscale. Full desaturation, not a filter.
2. Levels — set a black point and a white point so the object uses the range.
3. Per-pixel noise, generated *below* plate resolution and resampled up, so it clumps. Strongest in the midtones, easing off at both ends — otherwise shadows fizz and the object loses mass.
4. Hard alpha outside the silhouette. Interior highlights stay white.
5. Deliver at ~3× the layout slot.

`scripts/imagery/treat.mjs` implements exactly this. Options: `--black --white --gamma` for the levels, `--grain` for the tooth, `--clump` for the grain's scale, `--cut/--cut-at/--cut-below` for the silhouette, `--keep` to drop fragments, `--trim`, `--seed`. The noise is seeded, so a rebuild is byte-identical — these become committed assets, and a mark that changes on every build is a diff nobody can read.

---

## Part 2 — a mark per report

### The taste problem, first

Co-Star's subjects are a moth and a peony. Ours are Hillsborough, the towers, Deepwater, Columbia. A treated cut-out photograph of a crowd on a terrace, floating decoratively beside a title in an archive listing, is a serious failure — and it is the failure the literal reading of the brief walks straight into.

So the rule proposed here is: **the mark is the exhibit, never the event.** The object the inquiry turned on, not the harm it caused. An O-ring. A blowout preventer. A hole in a wing panel. That is forensic rather than voyeuristic, it is the register the reports themselves are written in, and it is what makes the image evidence instead of decoration.

### Where the material comes from

Not stock, not the open web: **the PDFs this archive has already published**, rasterised from each report's own repo. Rights are then the report's own, already recorded — nothing new to clear. And the picture is drawn from the document it labels, which is the strongest version of the idea in the brief.

`sources.yaml` records page, dpi, crop, subject, rights and treatment for every candidate. `pnpm marks` rebuilds all of them from the PDFs; `pnpm mark-mockups` re-renders the pages below. The study candidates in `candidates/` are not committed, the recipe is; the shipped plates in `assets/marks/` are (see "Shipped").

### Three directions

Each is rendered into the three places a mark is actually used — an archive row, a report header, a share card — using this repo's own stylesheet and markup, so the comparison is against real type at real size. Three reports have marks and seven do not, deliberately: it shows what a half-built set looks like in situ.

#### ① Cut-out — `mockups/archive-cut.png`, `header-cut.png`, `card-cut.png`

Co-Star, straight. The object lifted off its ground and floated in the slot.

Strongest at the report header, where the object gets 220px and reads as a frontispiece. Lightest touch on the archive — the marks sit quietly in the margin rather than turning the index into a grid of thumbnails.

The cost is sourcing. A clean silhouette needs the subject shot against a cooperative ground, and most pages in these reports are not that. Columbia works because the stack is framed head-on in a bright door opening; Deepwater's rig is ragged at the waterline even after fragment-filtering. Expect several of the ten to need a hand-painted mask.

#### ② Plate — `mockups/archive-plate.png`, `header-plate.png`, `card-plate.png`

The treated photograph left rectangular, printed into the page like a plate in a report.

Reads noticeably stronger in the archive and on the share card — a small dark rectangle carries at 92px where a pale cut-out wants more room. Sources are unconstrained, since there is no silhouette to extract, so this is the only direction that is definitely buildable for all ten. It is further from Co-Star and closer to a scholarly edition, which may be the more honest place for this project to sit.

#### ③ Drawing — `candidates/cut-challenger.png`, `plate-challenger.png`

The report's own hand-drawn engineering plate. Challenger p.48 is a technical-pen drawing of the aft field joint — tang, clevis, O-rings, putty, hand-lettered. It is genuinely hand-drawn texture, in a way a filtered photograph is only pretending to be.

**It fails the archive row.** Line art at 92px is thin grey scribble; there is no mass to survive the reduction, and the treatment has almost nothing to bite on because there are no midtones. It is beautiful at 220px in a header and useless at 64px. Recorded as a finding, not a recommendation: it can be a *secondary* image on the report page, but it cannot be the mark.

### What I would do

**② Plate for the archive and the share card, ① cut-out for the report header** — one source photograph per report, treated twice. It is buildable for all ten without a masking project, it gets the cut-out's drama where there is room for it, and it keeps the archive scannable. If the set must be one thing everywhere, it should be the plate.

### What is not done

- Seven reports have no subject chosen, and four have no PDF cloned locally.
- Deepwater's photograph is credited in the report to Transocean. The report is a public-domain U.S. Government work but that credit line needs checking before it ships. Recorded as unresolved in `sources.yaml`.
- The Co-Star study sheets in `reference/` are their artwork, reduced and quoted for design study. If that is not wanted in a public repo, delete the two PNGs — the written analysis stands without them.

---

## Part 3 — the logo

`mockups/logo-audit.png` renders the seal at every size it is asked to work at.

The seal is fine at 128px and unreadable at 30px in the navbar, which is the complaint. The cause is structural, not resolution: **26 characters wrapped around a 94px circumference is 3.6px per character.** No redraw of the existing mark fixes that, and no larger PNG helps — worth stating plainly, because the assets are not the problem. The header serves `logo-64.png` into a 30px box, so a 2× display already gets 60 device pixels for 30, and `logo-32.png` is only ever used at 32×32 as a favicon. The pixels are there. The design does not survive them.

Two changes, independent of each other:

**The navbar does not need an icon.** Co-Star's own header is a wordmark and nothing else. "Reports that Matter" in EB Garamond at 1.5rem is already a good mark; the seal at 30px beside it adds a grey smudge. Removing it is one line and improves the header today.

**A small-size mark is still needed** for the favicon, the app icon, and anywhere under ~96px. Four candidates in `mockups/logo-candidates.png`:

| | |
| --- | --- |
| a · Seal with lettering removed | Reads as a hamburger menu. No. |
| b · Monogram | Holds at 30px, mush at 16px. |
| c · **Pilcrow in the seal** | Survives to 16px, keeps the seal's official-document register, and its content is the thing the site actually sells — a permanent address for every paragraph. The ¶ is already the site's own margin affordance. |
| d · Pilcrow alone | Cleanest at every size, but loses the stamp quality, and the descender sits awkwardly against the wordmark. |

Recommendation: **c**, with the full seal kept wherever it has 96px or more — share cards, the about page, `og:image`, print. SVGs are in `assets/brand/candidates/`.

---

## Method note

Everything above was measured rather than eyeballed, in the same spirit as the original token extraction in `docs/design/2026-08-01-costar-direction/`. Three readings I would have got wrong by looking: the images are 8-bit and not thresholded; the light areas are white and not transparent; the grain is fixed to output pixels and not to the subject. Each of those changes what you have to build.

---

## Decisions — 2026-09-12

Rufus, reviewing the artifact above:

- **Plate**, for all ten reports. Not cut-out, not the drawing direction. Tracked as [reportsthatmatter-xs3](https://github.com/reportsthatmatter/reportsthatmatter) (bead) — built and shipped 2026-09-13, below.
- **Logo**: pilcrow-in-seal (candidate c), and drop the seal from the navbar in favour of the bare wordmark. Same bead. Make sure the pilcrow is properly centred in the seal before it ships — the first pass in `assets/brand/candidates/pilcrow-seal.svg` was eyeballed, not measured.
- **Rights**: not a blocker. This is a public-interest project; fair use covers sourcing from PDFs already published here, and Rufus is explicitly unconcerned about incidental details like a photo credit (e.g. Deepwater's rig photo being Transocean's) or similar copyright questions on individual source images. Don't let that hold up sourcing.
- **Medium-term, not now**: Rufus wants to explore a bolder landing-page treatment later — full hero imagery, possibly in colour rather than this doc's desaturated stipple, with a "slightly retro TV" rasterised look (scanlines / CRT signal-noise) rather than aquatint grain. That is a different register from the restraint documented above and deserves its own brainstorm rather than folding into the per-report mark pipeline. Tracked as [reportsthatmatter-bea](https://github.com/reportsthatmatter/reportsthatmatter) (bead).

Candidate subjects for the 7 reports not yet covered are scoped in bead xs3's comments (Litvinenko, Hillsborough, 9/11, PSI, and Jack Smith all have a subject picked from the report's own PDF; Leveson and Philip Morris have essentially no embedded imagery and would need a subject sourced outside the report itself if all ten are to have a mark).

---

## Shipped — 2026-09-13

What went live, and the three places it departs from the mockups above.

- **Where plates appear.** The archive row (`/reports` and the homepage's archive section), the report header on a report's contents page and its `/full` page, and every share card. Not on individual section pages, whose header is navigation rather than a title page.
- **Two files per plate, both committed.** `assets/marks/<report-id>.webp` (660px long edge, for the header and card) and `<report-id>-row.webp`, treated separately at 276px rather than downsampled, because the grain is fixed to output pixels and a downsample would average it away. Lossless WebP: lossy smears the grain, and lossless is still half the PNG. `pnpm marks` writes both plus `src/generated/marks.ts`, the size manifest the templates read so every image carries its dimensions. Committed rather than built on deploy because a deploy has none of the report PDFs.
- **Departure 1: the archive CSS is scoped.** The mockup set the four-column grid on `.report-list` itself; a report's own contents list is also a `.report-list`, so the live rule is `.report-list-marked`. On phones the plate shrinks to a 64px slot beside the title rather than stacking above it.
- **Departure 2: the site's own share card has no imprint.** Tried with the pilcrow-in-seal in the plate's slot: its standfirst then ran 41px past the card's bottom edge. `scripts/cards.mjs` now fails any card whose content overflows, checked against that broken card before trusting it.
- **Departure 3: three crops changed.** Jack Smith's seal crop had been set by eye and caught half the seal and the letterhead rule; now measured and centred. PSI and Hillsborough re-cropped tighter so they read at 92px. Details and before-crops in `sources.yaml`.
- **Pilcrow centring, measured.** EB Garamond's ¶ at the SVG's 58 units has an ink box of L 14.64 R 15.34 A 37.58 D 16.76 (canvas `measureText`). The first pass set it at y=70, which put the ink centre 9.6 units below the seal's; now x=49.65 y=60.41, ink box centred on 50,50. `scripts/imagery/brand.mjs` renders the favicon PNGs with the font actually loaded, since a favicon rendered straight from the SVG would fall back to the viewer's serif.
- **Credits confirmed against the PDFs.** Deepwater: "Photo courtesy of Transocean" (p.17 caption). 9/11: "Rendering by Marco Crupi" (on the page). Hillsborough: title block by Eastwood & Partners, Panel caption cites SCC000002050001, p56. None is displayed on the site; they are recorded in `sources.yaml`.
