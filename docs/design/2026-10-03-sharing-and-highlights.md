# Sharing and highlights: audit, editor's highlights and social previews

**Date:** 2026-10-03. **Epic:** reportsthatmatter-bght. **Decision:** [0014](../decisions/0014-editors-highlights.md) (proposed). **Status:** audit done; editor's highlights and quote cards built (sharing-highlights PR); follow-ups are beads under bght.

Rufus, 2026-10-03: put his highlights in the database so every report shows some; check whether a reader can highlight, share and land on a page for the highlight; "we really want to test that I can share on social media and get a nice social media preview."

## 1. How this was tested

On production, 2026-10-03 (v0.21.0), with no logins and no posting:

- `curl` of a report page (`/reports/jack-smith-vol1`), a `?p=` link (`/reports/us-911-commission?p=august-7-1998-national-security`) and a `?h=` link (the posting queue's Jack Smith "So what?" link), each with the user agents of Bluesky (Cardyb), X (Twitterbot), Facebook (facebookexternalhit), LinkedIn (LinkedInBot), Reddit (redditbot), Slack (Slackbot-LinkExpanding) and WhatsApp. Every one got a 302 to the section page, then 200 with the same head: no crawler is blocked.
- The Open Graph and Twitter tags of each page, and the card images they point at (downloaded and looked at).
- Bluesky's public link-card extractor, `cardyb.bsky.app/v1/extract?url=…`, which needs no account: it returns the title, description and image Bluesky shows. Facebook's Sharing Debugger and LinkedIn's Post Inspector need a login; X has no validator any more. For those, the tags were checked against each platform's documented rules.
- The marks endpoint, `/reports/<id>/marks`, for all 13 reports, and `pnpm seed-highlights --dry-run --remote` (a read).

## 2. Capability table

Status on production before this work, and after the sharing-highlights PR ships.

| Capability | Before | After the PR | Notes |
|---|---|---|---|
| Highlight a passage (desktop) | works | works | Select text: Copy link, Copy quote, Save. Saved highlights live in the browser, listed at `/highlights`, exported as Markdown or JSON |
| Highlight or share on a phone | missing | missing | `share.js` turns the popover off on touch screens (bght.3); built after #279 as a dock along the bottom, §7 |
| Share a highlight as a link | works (desktop) | works (desktop) | `?p=<paragraph>&h=<prefix|words|suffix>`; copy only, no share-to-network buttons |
| A shared link lands on the highlighted words | works | works | 302 to the section, words marked and scrolled to; moved ids follow aliases; words gone → the paragraph is marked "lost" rather than the wrong words |
| A landing page for the highlight | partly | partly | The section page is the landing page. No citation or share panel at the landing point (bght.4, P3); built after #279 as a landing panel, §7 |
| The editor's highlights in the database | works, mislabelled | works | 163 highlights (11 to 15 per report, all 13 reports) seeded since 2026-09-25, shown as "Highlighted by 1 reader" in every case. Now "Editor's highlight", never counted as a reader, with a key under the page header (0014) |
| Rufus adds his own highlight | partly | works | Was: hand-edit `editorial/<id>.yaml`. Now: select on the site, Copy link, `pnpm highlight add '<link>' [--card]`, then seed |
| Seeding cost on D1's free tier | 326 writes a run | 0 writes a run | Was delete-all and re-insert; now only the difference. Today's plan against production: 0 writes |
| Readers' marks shown to others | works | works | The wash in the text. The "Most marked passages" list shows only on reports without a landing page, which is now none |
| Preview text (title, description) | works | works | Description is the quoted words ("“…” — Report"); title is "Section — Report — Reports that Matter" |
| Preview image, report and section pages | works | works | The report's default card: title, byline, plate |
| Preview image, a shared quote (`?h=`) | broken / weak | works for the editor's card highlights; weak for a reader's own selection | Before: the report's title card for every quote, except Jack Smith, whose paragraph cards showed paraphrases in quotation marks (bght.9). After: a card of exactly the words for the 72 `card: true` highlights, which covers 53 of the 55 queued posts; any other selection gets the title card (bght.2) |
| `og:url`, canonical, `og:site_name`, image size and alt | missing | works | `og:url` keeps `?p=` and `?h=`, so two quotes from one section are two previews; canonical stays the section |
| Annotate (notes on a passage) | missing | missing | Not built; see §5 and bght.5 |

## 3. Per platform

| Platform | What it reads | Before | After |
|---|---|---|---|
| Bluesky | og:title, og:description, og:image (cardyb, verified) | Title "“THE SYSTEM WAS BLINKING RED” — The 9/11 Commission Report — …", description the quote, image the report's title card | The same, with the quote card when the words are a card highlight. The scheduled poster uploads the queue item's `card` as the link card: 53 of 55 now a quote card |
| X | twitter:card summary_large_image, og:image | X shows only the image and the domain, no title or description. A quote link showed the report's title card: the quote was invisible | The quote card shows the words. A reader's own selection still shows only the title card (bght.2) |
| Facebook | og:*, og:url, image size | No og:url, no image width and height (Facebook may show no image on the first share, before it has fetched it) | og:url, `og:image:width` 2400, `og:image:height` 1260, alt |
| LinkedIn | og:title, og:description, og:image (≥1200×627, ≤5 MB) | Works; the long title is cut at about 70 characters | Same; alt and size added |
| Reddit | og:image as the thumbnail, og:title | Works | Works |
| Slack | og:title, og:description, og:image, og:site_name | Works, no site name | Site name "Reports that Matter" |
| WhatsApp | og:image, small (commonly cited limit about 300 KB) | Default cards 138 to 291 KB: under, but close | Quote cards 80 to 175 KB (64-colour PNG) |

## 4. What a shared highlight looks like

**Before.** Share "Tenet told us that in his world" from the 9/11 report: Bluesky shows the section title in capitals, the quote as the description, and a card reading "The 9/11 Commission Report / National Commission on Terrorist Attacks Upon the United States · 22 July 2004" with the plate. On X only that title card shows. Share the Jack Smith "So what?" passage and the card reads “When an advisor rushed to tell Mr. Trump that Vice President Pence had been evacuated to a secure location, he replied: "So what?"”, which is not in the report.

**After.** A queued or editor-highlighted quote previews with a 2400×1260 card: "Reports that Matter" top left, the report's plate top right, the words themselves in large EB Garamond inside curly quotes (56 px down to 34 px as they lengthen, cut only at a sentence end), and a footer rule with "P. 21 · THE 9/11 COMMISSION REPORT" and "REPORTSTHATMATTER.ORG". Every card's words are verbatim: `pnpm cards` fails a `quote:` that is not in its paragraph.

## 5. Annotation: a short note

Not built. A reader's note on a passage is one more human layer, and decision [0002](../decisions/0002-annotation-format.md) already gives it what it needs: the anchor model `{paragraph, quote: {exact, prefix, suffix}}` (W3C FragmentSelector refined by a TextQuoteSelector, the same shape as `?h=`, D1 marks and editorial highlights), resolved by id, then `aliases.yaml`, then a search for the quotation, then shown as an orphan; and export as W3C Web Annotation JSON-LD. A note would be a marks row plus a body: a `notes` table (or a `body` column) keyed the same way, rendered beside the wash, and checked by `pnpm marks check` after a re-ingest like any mark. Hypothesis (a public or private group pointed at our pages) would work today with no build, since it anchors the same way.

What is needed from Rufus (bght.5): public or private notes; who may annotate (the editor only, invited people, anyone); moderation if anyone; our own table or Hypothesis.

## 6. Follow-ups (beads under bght)

- bght.2 Runtime quote cards for any reader's selection (a separate cards Worker with satori and resvg, or render on first share into R2; cost against 0005).
- bght.3 Highlight and share on phones.
- bght.4 A shared-passage panel at the landing point (client-side; the body must not depend on the query string).
- bght.5 Annotation, after Rufus answers §5.
- bght.6 Decision 0014.
- 19 `card: true` highlights are skipped by `pnpm posts` (over Bluesky's 300 graphemes, or no page); they still get quote cards.

## 7. Phones and the landing panel (bght.3, bght.4), 2026-10-04

**Phones (bght.3).** `share.js` switched itself off on `(pointer: coarse)`, because a popover placed above the selection lands exactly where the OS puts its own selection menu: iOS Safari's callout (Copy, Look Up, Share) and Android Chrome's floating toolbar both sit just above the selected words, and neither can be turned off from a page (`-webkit-touch-callout` only governs links and images). Fighting them for that spot loses. So on a coarse pointer the same three actions live in a **dock**: the existing popover, restyled as a full-width bar fixed to the bottom of the screen, above the home indicator (`env(safe-area-inset-bottom)`). The native menu keeps the top, ours keeps the bottom, and the reader can use either.

- **When it opens.** Touch has no `mouseup` at the end of a selection, so the dock follows `selectionchange`, debounced (350 ms), which also tracks a reader dragging the handles. It closes when the selection collapses or leaves the report body. It does not close on scroll or resize, because dragging a handle scrolls the page and the browser's toolbars resize the viewport.
- **What it offers.** Share (the native share sheet, `navigator.share` with the quote and its `?h=` link), Copy quote and Save. Where there is no share sheet, Copy link takes its place. Same link, same marks POST as the desktop popover.
- **Taps.** A tap on the dock can collapse the selection before the click lands, so the dock acts on the selection it last settled on, and stays open long enough to show "Copied"/"Saved".
- **Desktop is unchanged:** the floating popover, opened on `mouseup`.
- **Known limit.** Android Chrome's "Touch to Search" can raise a peek bar at the bottom after a long-press; it sits over the dock until dismissed. Not seen in emulation; check on a real device.

**The landing panel (bght.4).** A `?h=` link already scrolled to and marked its words. It now also shows a compact panel: a kicker ("Editor’s highlight" when the words are one of the editor's highlights, otherwise "Shared passage"), the quote, a citation line (p. N · report · section), and Share or Bluesky, Copy link and Copy quote, plus a close button.

- **No layout jump.** The panel is `position: fixed` (a card at the bottom right on wide screens, a bottom sheet on phones), so inserting it moves no text. The page is not shifted to make room; instead the marked words are scrolled to a third of the way down, clear of the panel, and the page gets 60vh of room below its last line so words near the end of a section can get there too (added below everything, so nothing on screen moves). In Chromium the `?h=` landing's cumulative layout shift equals the plain `?p=` link's.
- **WebKit and the fragment.** WebKit scrolls back to the URL's `#paragraph` whenever it lays the viewport out again (Safari's toolbars coming and going; a Playwright screenshot does it too), which put the words back under the panel. Once the words are marked, `highlight.js` drops the fragment from the address bar (`history.replaceState`); the panel's links put it back.
- **The body stays independent of the query string** (`tests/head.test.ts`): the panel is built client-side in `highlight.js`, and appended after the report body so that the text indexes (`buildIndex(body)`) never see it.
- **Editor or reader.** The label comes from the marks `social-proof.js` already fetches: if an editor entry has the same paragraph and the same words, it is the editor's highlight. No extra request.
- **Emphasis.** The marked words get a short glow when the page lands (none under `prefers-reduced-motion`).
- **Accessible.** An `aside` landmark labelled "Shared passage", real buttons, Escape or the close button dismisses it, and focus is never moved on load.
- **On a phone,** the panel closes when the reader starts a selection, so the dock and the panel never stack.

**Checked by** `scripts/e2e-mobile.mjs` (run by `verify.sh`): iPhone 13 in WebKit with a stubbed share sheet, Pixel 7 in Chromium without one, and a desktop pass; 63 checks. Screenshots in `docs/design/2026-10-04-phone-highlights/`. What emulation cannot show is the OS selection menu itself; the dock's placement is reasoned, not observed, until someone tries it on a real phone.

**D1 cost: unchanged per action.** The panel makes no request and writes nothing: it reuses the marks response the page already loads, and its copy and share buttons do not post a mark (re-sharing a link someone sent you is not a new highlight). The dock posts one mark per Share, Copy or Save, the same single `/api/mark` insert the desktop popover makes. The total grows only because phone readers can now share at all, which is the point. No schema change.
