# Highlighting, sharing, and social proof

**Date:** 2026-08-21
**Status:** design — phases 1 and 2 approved to build, phase 3 needs a look before it ships, phase 4 deliberately deferred
**Context:** Highlight-to-share shipped in `assets/share.js` and links to the
*paragraph a selection starts in*. Everything below starts from the gap that
leaves.

---

## 0. The short version

The product proposition is "cite the exact passage". Today a reader can select
half a sentence and we hand them a link to the whole paragraph — which is a
different claim than the one they were trying to make. Four things follow, in
the order they should be built:

1. **A selection needs its own address.** Sub-paragraph anchoring is the
   foundation; everything else here is built on it, including search results.
2. **A reader's own highlights are worth keeping**, and they are worth keeping
   *without an account* — local storage and a Markdown export get most of the
   value at none of the cost.
3. **What other readers marked is the signal we are uniquely able to give.** An
   archive of long documents where the passages that mattered to other readers
   are visible is a genuinely different reading experience from a PDF.
4. **Accounts are last, not first.** They are the only part with an ongoing
   external dependency, and the first three phases produce the evidence for
   whether they are wanted.

---

## 1. What exists

`assets/share.js`, 128 lines, no dependencies:

- Watches selection inside `#report-body`, suppressed on coarse pointers.
- Walks up from `range.startContainer` to the first ancestor carrying an `id`
  — in practice the paragraph — and builds `?p=<id>#<id>`.
- Popover offers *copy link* and *copy quote + link*.

The two design choices already made here are good and are kept: the **query
string is what the server sees** (so a link preview in a feed can be built from
it), and the **fragment is what positions the reader**. What is missing is that
the selection itself is thrown away.

Paragraph ids are text-derived (`src/lib/markdown.ts`), deliberately, so that
re-ingesting cannot silently repoint a citation. The anchoring scheme below
inherits that property rather than inventing a second one.

---

## 2. Phase 1 — a selection has an address

### The anchor

A shared selection is described the way the W3C Web Annotation model describes
one: by its text, plus enough of its surroundings to disambiguate.

```
?p=<paragraph-id>&h=<prefix>|<exact>|<suffix>
```

- `exact` — the selected text, normalised (collapsed whitespace, sidenote
  markers and permalink glyphs stripped).
- `prefix` / `suffix` — up to 24 characters either side, which is what makes the
  anchor survive the same phrase appearing twice in a paragraph.
- `p` — the paragraph the selection *starts* in, kept from today's scheme. It
  scopes the search for `exact` to one paragraph, so re-anchoring is a scan of a
  few hundred characters rather than a document.

Encoded compactly (URI-encoded, `|`-joined) and capped: an `exact` longer than
~300 characters degrades to a paragraph link, because a link that long is not a
citation, it is a copy.

### Why not `#:~:text=`

Text fragments are the browser-native answer and they are the wrong tool here
for one decisive reason: **a fragment is never sent to the server**. Quote
preview links (`?p=`) are already the mechanism that makes a shared link show
the damning quote rather than the site description, and that is the highest
value part of sharing this material. An anchor the Worker cannot read cannot
produce a quote card, cannot produce an OG description, and cannot be counted
for phase 3.

We can still emit a text fragment *alongside* the query string for readers who
paste the URL into a browser that honours it, but the query string is canonical.

### Re-anchoring

On load, if `h` is present:

1. Find the paragraph by `p`. If it is gone, fall back to scanning the section.
2. Search its text content for `prefix + exact + suffix`, then `exact` with one
   side, then `exact` alone.
3. Wrap the match in `<mark class="hl">` and scroll it into view.
4. If nothing matches, fall back to highlighting the paragraph and say so
   quietly — a stale anchor should degrade to "this paragraph, roughly", never
   to a silent lie about which words were quoted.

Step 4 is the load-bearing one. The house rule for permalinks is that a citation
must never resolve to *something else*; the same standard applies here.

### The popover

Gains a third state: when the selection is a strict subset of its paragraph, the
copy actions use the selection anchor and the popover says so. When the whole
paragraph is selected, behaviour is exactly as today.

### Verification

- Unit tests for encode/decode and for the three-tier re-anchor fallback,
  including the "same phrase twice in one paragraph" case and the "text has
  since changed" case.
- A browser check in `verify.sh`: select a range mid-paragraph, follow the
  produced URL, assert the `<mark>` covers exactly the selected words.

---

## 3. Phase 2 — a reader's own highlights, without an account

Storage is `localStorage`, keyed by report. A record is the anchor from phase 1
plus what is needed to render it back without re-fetching: report id, section,
printed page, the quote, and when it was made.

Three surfaces:

- **Highlights persist on the page** they were made on, rendered on load through
  the same re-anchoring code as phase 1.
- **`/highlights`** — everything this browser has marked, grouped by report,
  newest first.
- **Export** — Markdown, and JSON for anyone who wants to script against it.

Markdown export is the one to get right, because it is how this becomes useful
to the people the project is for:

```markdown
## The Litvinenko Inquiry

> The FSB operation to kill Mr Litvinenko was probably approved by
> Mr Patrushev and also by President Putin.

— *The Litvinenko Inquiry*, § Conclusions, at 246 ·
  [permalink](https://reportsthatmatter.org/reports/litvinenko-inquiry/conclusions?p=…&h=…)
```

Quote, source, printed page, permalink. That is a citation a journalist can
paste into a draft, which is the entire point.

**No account is required for any of this**, and that is a deliberate product
position rather than a shortcut: a reader who highlights six passages and
exports them has got the whole value of the feature and given us nothing.

---

## 4. Phase 3 — what other readers marked

The first phase that needs a backend.

### Storage

**D1.** Not KV — counters under eventual consistency are wrong, and we want to
*query* (most-marked passages in a report), not just read a key. Not Durable
Objects — the write rate does not justify them, and D1 is also the answer for
full-text search, so the site gets one data layer instead of two.

```sql
-- one row per marking event
CREATE TABLE marks (
  id INTEGER PRIMARY KEY,
  report TEXT NOT NULL,
  section TEXT NOT NULL,
  paragraph TEXT NOT NULL,   -- text-derived paragraph id
  exact TEXT NOT NULL,       -- the quoted text, normalised
  prefix TEXT, suffix TEXT,
  page INTEGER,
  kind TEXT NOT NULL,        -- 'share' | 'save'
  actor TEXT NOT NULL,       -- salted daily hash, see below
  created_at INTEGER NOT NULL
);
CREATE INDEX marks_report_para ON marks (report, paragraph);
```

### What is recorded, and what is not

- **`actor` is a salted hash of IP + user agent, with the salt rotated daily.**
  Enough to deduplicate one reader hammering the same passage; useless for
  tracking anyone across days by design.
- No IP, no user agent, no referrer stored. No cookie set.
- Rate limited per actor per report.

### Display

Restraint is the whole game — the design is Co-Star-derived and a passage
covered in social chrome would wreck it.

- A passage marked by enough readers carries a **hairline underline** in the
  text and a count in the margin, in the uppercase mono already used for chrome:
  `UNDERLINED BY 12 READERS`.
- **A threshold of 3.** Below it, nothing renders. One reader's highlight
  displayed back to them as "1 reader" is both noise and, on a report about a
  living investigation, a small privacy leak.
- The report's contents page grows a **Most marked passages** block — which is
  also, incidentally, the best possible input to the quote-card pipeline, since
  it tells us which passages readers actually chose.

### Serving it

Counts are read on page render, aggregated per report, and cached at the edge
with a short TTL. The page must render correctly with the count query failing —
social proof is an enhancement, and a D1 hiccup must never cost a reader the
document.

---

## 5. Phase 4 — accounts, deferred

Deferred until phases 1–3 are live, and stated here so the deferral is a
decision rather than an omission.

What an account adds over phase 2 is exactly one thing: **highlights that follow
you between devices**. That is real, and it is also the only part of this design
with an ongoing external dependency and an ongoing duty of care.

Recommendation when it is time: **magic-link email**, not OAuth and not
passwords. GitHub sign-in is wrong for the audience (journalists, researchers,
lawyers), Google sign-in is a heavy ask for a reading site, and an email address
is the same asset the roadmap's newsletter item needs. Passkeys are tempting for
the no-infrastructure reason and lose on recovery.

The migration path is designed in from phase 2: local records carry their own
ids, so signing in uploads what is already there rather than starting over.

---

## 6. Annotation is a separate product

Gdocs-style commenting — a threaded note attached to a passage, visible to
others — shares the anchoring layer with this design and nothing else. It brings
moderation, abuse, notification, and identity, all of which are absent above and
none of which are small.

Tracked as its own issue. Not part of this design.

---

## 7. Order, and what each phase risks

| Phase | Ships | Risk if wrong |
| --- | --- | --- |
| 1. Selection anchors | Sub-paragraph share links, highlight on arrival | Contained — client-side, reversible |
| 2. Local highlights + export | Saved highlights, Markdown export | Contained — no server, no data held |
| 3. Social proof | Marks recorded, counts displayed | First stored data; needs a look before it ships |
| 4. Accounts | Cross-device sync | External dependency, ongoing duty of care |

Phases 1 and 2 are strictly better versions of what exists and hold no reader
data. Phase 3 is where this project starts storing something about readers, and
its details — the threshold, the rotating salt, what is never recorded — are
where the care belongs.
