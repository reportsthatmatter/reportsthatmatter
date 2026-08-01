# Design direction — Co-Star, 2026-08-01

Snapshots of the shipped V2 design, for review alongside the earlier mockups in
`design-experiments/site/`.

Open the `.html` files directly — the stylesheet is inlined, so they stand alone.
The `.png` files are the same pages at 2× for quick comparison.

| File | Page |
| --- | --- |
| `home.html` | Homepage |
| `archive.html` | Report index |
| `about.html` | Announcement / about page |
| `report.html` | Report reading view (truncated after ~40 paragraphs) |

Live: <https://reportsthatmatter.office-d34.workers.dev>

## Where this came from

The earlier rounds (`codex-*`, `gemini-*`, `antigravity-*`) were judged "ok to
good, not great", and the conclusion was to imitate an exemplar rather than
design from scratch. The exemplar chosen was
[costarastrology.com](https://www.costarastrology.com/) — its pared-down look
suits long documents.

Rather than eyeball it, the tokens were measured off the live site with
Playwright:

| | Co-Star | Here |
| --- | --- | --- |
| Canvas | `#f7f7f7` | `#f7f7f7` |
| Text | `rgb(87,86,87)` — mid-grey, never black | `#575657` body, `#252525` headings |
| Display | Romana-Book, 400, leading ~1.0 | EB Garamond, 400, leading 1.02 |
| Body | AkkuratPro-Regular 14/20 | Inter |
| Chrome | Akkurat-Mono 12px, uppercase, tracked | IBM Plex Mono, same treatment |
| Corners | square | square |
| Shadows | none | none |

Romana and Akkurat are licensed, so the three substitutes carry the same roles.

## What was adapted rather than copied

Co-Star is a marketing site for an app; this is a reading environment for
174-page documents. Three deliberate departures:

1. **Serif for body copy.** Co-Star sets body in the sans. Long-form reading is
   the whole point here, so report prose is EB Garamond at 1.2rem/1.72 on a
   37rem measure (~70 characters).
2. **Left-aligned reading column.** Co-Star centres nearly everything. The
   report header and prose share one left edge instead, which is what makes a
   long document feel like a document.
3. **A reading affordance Co-Star has no need for** — the ¶ permalink in the
   left margin, and the highlight-to-share popover, both in the same mono
   micro-type as the rest of the chrome.

## Open questions for review

- Heading colour is `#252525` rather than Co-Star's `#575657`. Faithful would be
  lighter; legibility at display size argued for darker. Easy to change.
- The hero is set much larger than Co-Star's 40px, because theirs is a wordmark
  and this is a statement.
- Nothing has been done yet with imagery. Co-Star leans on black-and-white
  photography and faint constellation linework; the equivalent here would
  probably be document facsimiles, and there is currently no visual texture at
  all.
