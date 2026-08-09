# Sidenote design research: what to do about long notes

**Date:** 2026-08-09
**Status:** researched, decided, implemented
**Issue:** [#80](https://github.com/reportsthatmatter/reportsthatmatter/issues/80)

## The problem

RTM renders footnotes as sidenotes — the note floats in the right margin,
level with the sentence it supports, rather than living at the bottom of the
document. This is the single biggest reason the site is more readable than
the source PDFs: a citation-heavy government report is mostly footnotes, and
a footnote you have to travel to is a footnote you don't read.

It breaks down when a note is much taller than its paragraph. `.sidenote` is
`float: right` inside `.prose`; floats stack top-to-bottom in the margin
column independent of where their *own* anchor sits, so once one note runs
long, everything after it drifts downward, out of alignment with the prose
beside it. Rufus reported the acute form of this — a long note pushing past
the end of `.prose`'s (unclearing) box and overlapping the section nav and
footer — which was fixed separately (`display: flow-root` on `.prose`,
merged in PR #81). What's left is the underlying readability problem: even
without any overlap, a reader can no longer tell which note goes with which
sentence a few paragraphs past a long one.

### How bad is it, actually?

Measured note length across all four published reports before designing
anything, rather than guessing:

| Report | Notes | Median | p90 | Max | >400 chars |
| --- | --- | --- | --- | --- | --- |
| Litvinenko | 306 | 47 | 138 | 323 | 0.0% |
| Challenger | 75 | 47 | 285 | 867 | 6.7% |
| PSI | 2,812 | 101 | 411 | 3,049 | 10.4% |
| Jack Smith | 274 | 169 | 779 | **3,658** | 20.8% |

Two things stand out. First, this is not a uniform problem — Litvinenko has
zero notes worth worrying about, while a fifth of Jack Smith's notes are long
enough to cause real drift (Jack Smith's footnotes are strings of parallel
case citations — `See ECF No. 252 at 53 & n.283; SCO-1 2876963 at 03:15-05:09
...` — sometimes ten or more per note). Second, the *median* note everywhere
is short (47–169 characters, 1–4 lines) — most notes are fine as-is. A fix
that changes how *all* notes render would be solving a problem most notes
don't have.

## Prior art

### Tufte CSS — the pattern RTM already uses

[Tufte CSS](https://edwardtufte.github.io/tufte-css/) is the canonical
reference for this whole approach: a checkbox + `<label>` toggles visibility
via a sibling selector, no JavaScript required, and CSS media queries
collapse notes into a tap-to-open block below the point where there's no
margin left to put them in. RTM already does exactly this (see
`src/lib/markdown.ts`'s `withSidenotes` and the `.sidenote` /
`.sidenote-toggle` / `.sidenote-checkbox` rules in `assets/styles.css`). Its
one acknowledged weakness, straight from the source: it has "no automatic
overflow handling" — the author is expected to keep notes short enough that
they don't collide. Government reports don't get an author edit pass before
they reach us, so that assumption doesn't hold.

### Gwern.net — the deep dive on exactly this problem

[gwern.net/sidenote](https://gwern.net/sidenote) is a whole essay on this
specific failure mode, and the most directly useful source found. The core
argument: sidenotes need *context-aware* rendering, not one rule for every
note. Gwern's site runs two systems depending on how dense the annotations
are:

- For lightly-annotated pages, the Tufte-CSS pattern above is "static,
  simple, popular" and good enough.
- For heavily-annotated pages,
  [`sidenotes.js`](https://github.com/gwern/gwern.net/blob/master/js/sidenotes.js)
  does real-time layout: it computes "forbidden zones" around other page
  elements, buckets sidenotes into layout cells, and runs an iterative
  collision-resolution pass (`pushNotesUp()`) that redistributes overlap
  between neighbouring notes when they'd otherwise collide. Gwern's own
  caveat: "the JS needs to load and copy the endnotes into sidenotes,
  reflow as necessary over the whole page, which is user-visible &
  distracting." He treats this as a real cost, not a free upgrade — it's the
  tool for a site with orders of magnitude more annotation density than RTM
  has, not a default to reach for.

The essay also identifies the two forces in tension: sidenotes visible by
default beat click-to-reveal ("[requiring a click] defeats much of the point
compared to a normal hyperlinked endnote" — the whole value is *not*
travelling), but mobile has no margin to put them in at all, so some
form of collapse is unavoidable below a width threshold. RTM's existing
design already resolves that half correctly.

### Native `popover` + CSS anchor positioning — the modern option

A newer pattern, described well in Michelle Barker's technique (via
[Frontend Masters](https://master.dev/blog/footnotes-progressively-enhanced-to-popovers/)):
progressively enhance a plain footnote link into a native browser popover,
anchored to its trigger with the CSS Anchor Positioning API, detected via
`@supports (anchor-name: --x)` so unsupported browsers just keep the
plain link. Ships zero JavaScript for the interaction itself (the `popover`
attribute and `:popover-open` pseudo-class are native), and because a
popover paints in the top layer, it never affects document flow — no
reflow, no drift, by construction. The tradeoff is the one this technique
exists to manage: because the popover is a *separate* element from the note
in its normal position, either content gets duplicated (the article's
recommended fix: clone the note list with JS and mark the clone
`aria-hidden`) or the visible note disappears while its popover is open
("the content literally transports to the new popover location").

This is a genuinely good pattern, and worth keeping in mind if RTM ever
moves toward click-triggered notes as the default. It's the wrong first
move here, though — it solves "how do I show a note without navigating to
it," which RTM already has a good answer for (the note is just *there*).
What RTM needs is a fix for the minority of notes that are disproportionately
long, not a new default interaction model for all of them.

## Decision

**Cap the height of long notes only, determined once at ingest time from the
note's own character count, using the same checkbox the site already ships
to let a reader expand one back to full length.**

Concretely:

- A note over **400 characters** (roughly 8–10 lines in the sidenote
  column — chosen from the table above: it's above the median everywhere,
  and only trips for the reports that actually have the problem) gets a
  `long` class at render time in `withSidenotes` (`src/lib/markdown.ts`).
- `.sidenote.long` clamps to a fixed max-height with a `mask-image` fade at
  the bottom, only inside the desktop sidenote breakpoint
  (`min-width: 68rem`) — mobile already collapses every note regardless of
  length, so the drift problem doesn't exist there.
- A small "Show full note" label sits inside the clamped note, positioned at
  the fade so it's exactly where a reader's eye lands. It's a second
  `<label>` pointing at the *same* checkbox the marker already toggles —
  clicking it removes the clamp via a sibling selector, no new state, no
  JavaScript.
- Un-clamped notes (the majority — everything short) are untouched. This
  isn't a new interaction model; it's a length-triggered exception to the
  existing one.

### Why this over the alternatives

- **Over Gwern's `sidenotes.js` runtime layout:** that solves a much bigger
  problem than RTM has (page-wide, note-vs-note collision resolution across
  arbitrarily dense annotation) at a real cost the author himself names
  (JS-driven reflow, "user-visible & distracting"). RTM's problem is
  narrower — a handful of outlier notes, not systemic density — and doesn't
  need a general collision solver to fix it.
- **Over native popovers as the default:** would change the core interaction
  for every note (click to see it) to fix a problem that only affects a
  minority. It's the right tool for "make the note appear without
  navigating," which RTM doesn't need solved differently than it already is.
- **Why length, not rendered height:** RTM already knows the note's plain
  text at the point it's turned into a sidenote — no DOM measurement, no
  runtime JS, no layout thrash, and the decision is made once, at build
  time, the same place every other pipeline decision in this codebase gets
  made (see `AGENTS.md`: "fixes go in the pipeline, not its output").
- **Why reuse the existing checkbox instead of a new mechanism:** it's
  already there, already accessible (a real, focusable, keyboard-operable
  `<label for>` / `<input type="checkbox">` pair — not a synthetic
  click handler), and already has to be maintained for mobile. One
  mechanism serving two related purposes (show a hidden note; show a
  truncated one) is less to reason about than two.

### What this doesn't fix

Two adjacent notes can still land at slightly different heights relative to
their paragraphs — capping the outliers bounds *how bad* drift can get, it
doesn't guarantee pixel-perfect alignment. That residual is accepted:
perfect alignment would need Gwern-style runtime layout, which is more
machinery than the actual problem (a handful of outlier notes in two of four
reports) justifies. If report ingestion trends toward denser, longer
citation blocks than Jack Smith's, this is the point to revisit and reach
for something closer to `sidenotes.js`.

## Implementation

- `src/lib/markdown.ts` — `withSidenotes` adds `long` to a note's class list
  when its source text exceeds `LONG_NOTE_CHARS` (400).
- `assets/styles.css` — `.sidenote.long` (clamp + mask-image fade,
  `min-width: 68rem` only) and `.sidenote-expand` (the second label,
  hidden once the checkbox is checked, hidden entirely below the sidenote
  breakpoint since mobile notes are never clamped).
- Regression coverage: a unit test on `withSidenotes` for the classification
  threshold, and a browser check in `scripts/e2e.mjs` asserting a long
  note's rendered height is clamped by default and grows once its checkbox
  is checked.
