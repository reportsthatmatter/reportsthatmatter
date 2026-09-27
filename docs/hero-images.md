# Sourcing a hero image for a report landing page

The design (a full-bleed band above the report header) is `docs/design/2026-09-27-hero/README.md`; the per-report candidate shortlist is `docs/design/2026-09-27-hero/candidates.yaml`; what ships is recorded in `docs/design/2026-09-27-hero/sources.yaml`.

This is the guide for whoever adds the next report to Reports that Matter and needs a hero photograph for its landing page. It captures what we learned doing this for the first eleven reports (bead reportsthatmatter-cdp.2).

## What makes a good landing image

A specific photograph beats a logo, a document cover, or a generic stock image. The test is: does this image show the actual event, place or object the report is about, not just an abstract theme like "justice" or "crisis"?

Prefer the event over an exhibit from the report. A photo of the Capitol being stormed is better than a photo of the Capitol building on a calm day. A photo of the Lehman Brothers building the day it filed for bankruptcy is better than a generic Wall Street stock photo. Where there was no single dramatic moment (an inquiry, a court judgment), the best substitute is the specific place tied to the event: the courtroom where it was heard, the building at the centre of the case, the object the litigation was about.

Specificity matters more than drama. A picture that could illustrate any report on the same general topic is a weak choice. A picture that only makes sense for this one report is a strong one.

Show the event itself. Rufus, 2026-09-27: for Hillsborough and Bloody Sunday as for every other report, a photograph of the day is what we want, not a memorial or the site as it is now. The line is dignity, and it is narrow and firm: no images of the dead; no identifiable people in distress in close-up (a face in grief or pain that a family could recognise); and nothing gratuitous, chosen for shock rather than for what it tells the reader about the event. A terrace behind its fences, a crowd, fans on the pitch, soldiers in a street, a burning rig, are all the event. When in doubt, ask whether a bereaved family member could see this image on the site without wincing, and whether it shows what the report is about rather than simply the worst moment. A memorial or the location today is the fallback when no photograph of the day passes that test.

Legibility when toned down and cropped is a hard requirement, not a nice-to-have. The image has to read clearly: (a) once desaturated or colour-muted for the site's palette, and (b) once cropped to a wide banner, roughly 16:9 to 21:9. Test this mentally (or actually) before committing: does the subject stay identifiable if you cut off the top third and the bottom third? Images with a single dominant subject centred or in the lower two-thirds of the frame crop better than busy or symmetrical images.

Toned-down colour is allowed and often desirable for a calmer, more editorial feel, but the source image should still have enough tonal contrast and detail to survive that treatment. Avoid images that are already flat, low-contrast, or heavily compressed.

## Where to look, in priority order

1. **Wikimedia Commons.** The default first stop. Search by event name, place name, and date. Check the category pages (`Category:X`) as well as individual file searches — categories often surface the best-curated images. Always open the actual file page, not just the thumbnail, to confirm licence and author.
2. **US government sources**, often mirrored to Commons but sometimes only on the agency's own site: NASA (spaceflight accidents), US Coast Guard / DVIDS (Deepwater Horizon and similar), National Archives, Library of Congress, FBI, CDC, Architect of the Capitol, National Park Service. All are public domain as US federal government works.
3. **UK equivalents**: The National Archives, Parliament's own image library, Geograph (mostly CC BY-SA), and local council or heritage body photostreams. These are usually OGL or CC BY-SA, not full public domain, so credit is required.
4. **Flickr, via Commons.** A great many good Commons files are actually Flickr photos reviewed and copied across under CC BY or CC BY-SA. The file page will say "Flickr" as the source; check that a Commons bot verified the licence ("FlickreviewR" or similar), not just that the uploader claims it.
5. **News-agency images (Getty, AP, Reuters, PA, Alamy).** Only under fair use, and only when nothing free is good enough. Note prominently in `candidates.yaml` that these are fair use, not freely licensed, and keep resolution and cropping modest — using a large, high-fidelity copy undercuts the fair-use argument that this is illustrative, not a substitute for the original licensable image.

## How to verify licence and credit

Never trust a search snippet or a caption alone. Open the actual Wikimedia Commons file page (or agency page) — use WebFetch on the URL — and read the licence template and the "Author" / "Source" fields directly off the page. Record:

- the licence tag exactly as stated (e.g. "CC BY 2.0", "CC0 1.0", "Public domain (US federal government work)", "OGL v3.0"), not a paraphrase;
- the author or creator exactly as the page states it, in the form that should appear in the on-site credit line;
- whether the file was "reviewed" (a bot or human confirmed the claimed licence at the source), which matters more for Flickr transfers than for own-work uploads.

If a Flickr-sourced file has no visible review pass, treat the licence as unconfirmed and either skip it or check the original Flickr page yourself.

## What to record per candidate

For every candidate, whether or not it is downloaded: title, the Commons/agency file page URL, the direct full-resolution image URL, the exact credit line, the licence, the pixel width and height, and one line on why it works plus any crop or sensitivity note. Mark exactly one candidate `recommended: true` per report.

## Downloading

Use `curl` with a real, identifying User-Agent header — Wikimedia rate-limits or blocks anonymous bot-like traffic:

```
curl -A "ReportsThatMatter/1.0 (rufus@lifeitself.org)" -L "<image-url>" -o "<file>"
```

If the original file is very large (over roughly 10MB), use the Commons thumbnail rendering service instead of the full original, requesting a 2400px-wide version, e.g. append `/2400px-<filename>` to a `thumb` URL rather than pulling a 40MB TIFF. Expect occasional HTTP 429 "too many requests" errors from Wikimedia if you fetch several files back-to-back; back off for some seconds and retry rather than assuming the file is broken — check the response body, a 429 page is small (a few KB) and clearly HTML, not a JPEG.

Confirm the pixel dimensions of what you actually downloaded, don't just trust the file page: `sips -g pixelWidth -g pixelHeight <file>` on macOS.

## Fair-use rationale (use this text, once, for any fair-use pick)

This image is reproduced under fair use / fair dealing for non-commercial, public-interest commentary and criticism: it accompanies editorial analysis of an official public-interest report, is used solely to identify the specific real-world event that report concerns, is displayed at a resolution and size appropriate for on-screen illustration rather than as a substitute for the original photograph's commercial market, and is credited to its source and copyright holder. No claim of ownership is made over the image itself.

## Gaps and honest limits

Not every report has an equally strong freely licensed option. Litigation-style reports with no single dramatic public moment (financial-crisis hearings, a civil RICO judgment, a press-ethics inquiry) are hardest: the best you can usually do is the building, the object, or the document at the centre of the case, which is a legitimate substitute but a weaker image than an event photograph. Note this explicitly in `candidates.yaml` rather than forcing a bad fit.

## Fair-use sources in practice

Agency sites serve only watermarked comps. A newspaper that ran the agency's picture usually serves it clean: the Guardian's article images are at `https://media.guim.co.uk/<hash>/<crop>/master/<width>.jpg`, where the hash and crop can be read off the article page's `i.guim.co.uk` image URLs, and the figure caption gives the agency credit. Record the article as the `source` and the agency and photographer as the credit. This is how the Hillsborough pilot image (John Giles/PA, 15 April 1989) was found, after Commons and English Wikipedia had nothing larger than a 391px fair-use thumbnail.

## Shipping one

1. Add the photograph to `docs/design/2026-09-27-hero/sources.yaml`: `source` (the page), `image` (the direct file), `creator`, `licence` (or the fair-use basis), `subject` and `rights` in prose.
2. `pnpm heroes <report-id>` writes `assets/heroes/<report-id>.webp` (2400px) and `-1200.webp` with the treatment baked in. Look at both.
3. Add a `hero` block to `editorial/<report-id>.yaml`: `src`, `alt` (what it shows), `credit` (what it shows, the date, then `Photo: <creator>, <licence>`; a fair-use image gives the agency, not "fair use"), `source`, `licence`, and `focus` (the CSS object-position that keeps the subject in a 3.4:1 crop on a laptop and 2:1 on a phone).
4. `pnpm editorial`, then look at the landing page at 1440px and 390px wide, then `./scripts/verify.sh`, commit the webps, and deploy: heroes are app assets.
