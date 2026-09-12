# remark/unified spike: findings and recommendation (issue #114)

**Date:** 2026-09-12
**Status:** recommendation
**Context:** #114 asked for a prototype, not a migration — render every
ingested report's `full.md` through both markdown-it (current,
`@rtm/ingest/src/markdown.ts`) and a remark+remark-gfm+custom-plugin
pipeline, diff the two outputs across the whole corpus, and characterize
every difference rather than eyeball a sample. This is that prototype and
that diff, run against all 10 currently-ingested reports (the issue's own
text says "four", written when only four existed).

Prototype code, the comparison harness, and the full machine-readable diff
(`comparison-report.json`) live in scratch, not this repo — this document
is the artifact meant to last. Ask if you want the prototype itself
resurrected to continue the work.

---

## 0. The short version

1. **The core architectural claim in #114 is correct and confirmed.**
   remark-gfm parses `[^N]` as real `footnoteReference`/`footnoteDefinition`
   tree nodes — including preserving **every** definition under a reused
   identifier, in document order, with distinct text, which is exactly what
   a restart-per-chapter report (Leveson) needs. Verified directly, not
   assumed: a two-chapter fixture with two different `[^20]:` definitions
   round-trips both, never collapsing to one the way a plain lookup would.
   §1.
2. **But this is not a low-risk drop-in swap, and the spike surfaced three
   real correctness risks a theoretical comparison would not have found:**
   - remark-gfm's GFM strikethrough treats a lone `~` as a valid delimiter
     by default. OCR garble drops stray `~` into running text routinely
     (`C~MPILATION`, `B~CKGROUND` — Challenger, page 1). Two unrelated
     stray tildes anywhere in the same block pair up and wrap everything
     between them in `<del>`. One-line fix (`{ singleTilde: false }`), but
     a real trap, found on the very first report checked. §2.
   - remark-gfm's spec-compliant autolinking and markdown-it's `linkify`
     disagree in both directions, at real scale. §3.
   - Where a footnote marker sits directly against a URL with no space —
     Deepwater Horizon's own citation style, `www.site.gov/page.[^90]` —
     remark's autolink scanner swallows the `[^90]` into the `href`,
     corrupting the link and losing the footnote as a resolvable reference
     entirely. **54 confirmed instances, one report.** This is the spike's
     most serious finding. §4.
3. **The spike also found two bugs in the *current* pipeline**, not
   introduced by remark — surfaced only because building a second,
   independent implementation is what exposed them. Worth their own fix
   regardless of this decision. §5.
4. **Recommendation: migrate, but as its own scoped project with the
   findings below as its literal checklist — not urgent, not a quick
   swap.** The footnote-structure win is real. The autolink picture is a
   net quality improvement once the swallowing bug is fixed. Neither
   changes the fact that every id-assignment change here touches a
   permalink, and this project's stated contract is that a paragraph id is
   the product. §6.

---

## 1. Footnotes: the claimed win, verified

`collectNotes`/`withSidenotes` today: parse `[^N]:` definitions with a
regex over raw markdown text into `Map<string, string[]>`, render the body
with markdown-it (which does not understand `[^N]` at all — it survives as
literal text), then run a **second regex pass over the already-rendered
HTML string** to find `[^N]` and replace it with sidenote markup,
resolving each occurrence against its number's definition list
positionally.

With `remark-gfm`, `[^N]` is real tree structure:

```
root
  paragraph
    text "...cited note twenty in chapter one."
    footnoteReference [20]
  footnoteDefinition [20] → "Chapter one's note twenty."
  paragraph
    text "...cited note twenty in chapter two."
    footnoteReference [20]
  footnoteDefinition [20] → "Chapter two's DIFFERENT note twenty."
```

Both definitions survive, distinct, in order — confirmed by direct tree
walk (not `unist-util-visit`, which double-visited for a reason not
chased down; a plain recursive walk over `.children` is unambiguous and
is what the prototype actually uses).

The prototype's `rtmTransform` plugin replaces the two fragile assumptions
in the current code with tree operations:

- `tokens.splice(i, 3, anchor)` for a page marker (three tokens, always,
  is a token-*count* assumption, not a structural one) becomes: find the
  top-level `paragraph` node whose only content matches `%%page N%%`,
  replace it in the children array.
- The post-render string regex for sidenotes becomes: collect
  `footnoteDefinition` nodes, remove them from the tree, walk
  `footnoteReference` nodes in document order resolving each against its
  identifier's definition list (the exact same positional rule
  `withSidenotes` uses today), replace the reference node in place.

Both paragraph ids and page anchors reproduced byte-for-byte once two
placement details were found and fixed (§2 of the *process*, not the
findings — noted here because they're easy to get wrong and not obvious
from reading the current renderer alone):

- The permalink pilcrow is the paragraph's **first** child in the real
  output, not its last — `paragraph_open`'s override renders the opening
  tag plus pilcrow as one unit, and the inline content is a separate token
  rendered after it.
- The list pilcrow sits **inside** the `<ul>`, before any `<li>` — a shape
  mdast's `list` node has no slot for (it isn't a list item), reproduced
  by giving a synthetic child `data.hName: "a"` instead of "li", which
  remark-rehype respects.

## 2. Configuration trap: `singleTilde`

GFM strikethrough's `~~text~~` is remark-gfm's default, but the spec (and
this library) also accepts a lone `~...~` unless you opt out. Challenger's
own contents page reads `C~MPILATION OF ISSUES...` and `B~CKGROUND` —
"COMPILATION" and "BACKGROUND" with an OCR-mangled "O". Two unrelated
single tildes, same block, pair up:

```
current: C~MPILATION OF ISSUES,FINDINGS, AND RECOMMENDATIONS ... B~CKGROUND
remark:  C<del>MPILATION OF ISSUES,FINDINGS, AND RECOMMENDATIONS ... B</del>CKGROUND
```

Fixed by `remarkGfm({ singleTilde: false })` — GFM's own strikethrough
spec recommends requiring the doubled form for exactly this reason. Not
optional for this corpus; every report has OCR noise, and there is no
reason to believe Challenger is the only one carrying a stray tilde.

## 3. Autolinking: markdown-it `linkify` vs remark-gfm `autolink-literal`

This is where most of the raw diff volume comes from — categorized
mechanically, not eyeballed, over all 10 reports' full hunks
(`comparison-report.json`):

| Category | Count | Direction |
|---|---:|---|
| Link markdown-it made that remark drops | ~266 confirmed | mostly a fix |
| Link remark makes that markdown-it didn't | ~7 confirmed | mixed |
| Cosmetic entity-escaping (`&quot;`/`&gt;` vs literal) | 11 | no-op |

**The 266: markdown-it's `linkify` is badly over-eager on OCR garble.**
Nearly every one of these is markdown-it auto-linking a short, meaningless,
OCR-mangled fragment as if it were a domain: `Z.TZ`, `a.cz`, `aU.SE`,
`q.cn`, `NqUu.at`, `Crit.lR`, `S.Ir`, `ir.rs`, `Diamclcr.mm` — none of
these are real links; they're `<a href="http://...">` wrapped around
scanner noise, live on the production site today. remark-gfm's
spec-compliant `autolink-literal` (requires `www.`, a scheme, or an
email-like shape) correctly declines every one of these. **This is a
genuine, sizeable, pre-existing defect in the current site, findable with
`renderMarkdown` alone — worth its own bead independent of this decision**
(a report or two of these — a citation reading `Z.TZ` as a live blue link
— would be worth fixing on its own).

**The ~7: a genuinely mixed picture.**
- `www.defenselink.mil/pubs/...)`, `www.nato.int/issues/afghanistan)` —
  remark correctly autolinks `www.`-prefixed URLs that linkify, for
  whatever reason, missed. A real gain.
- `nationalarchives.gov.uk/doc/open-government-licence/version/3` — a
  legitimate, bare (no `www.`, no scheme) domain-plus-path that
  linkify catches and GFM's spec does not. A real, if narrow, loss:
  GFM's autolink-literal simply doesn't cover schema-less bare domains.
  Recoverable with a small custom inline rule if this class of URL
  matters enough to chase; a handful of instances corpus-wide, not
  hundreds.
- `www.oilspillcommission.` → `<a href="http://www.oilspillcommission">`
  (Deepwater Horizon) — a genuine remark-side false positive: the source
  wrapped mid-domain (`www.oilspillcommission.\ngov)`, an OCR line-wrap
  artifact), and remark's scanner stopped at the first period, producing
  a link to a domain that does not exist. linkify correctly declined the
  whole malformed fragment. One confirmed instance; there may be more
  of this shape uncounted, since it wasn't mechanically categorized.

**Net assessment:** migrating fixes far more spurious links than it
creates or loses, but "net positive" is not the same as "no review
needed" — the schema-less-bare-domain loss and the line-wrap false
positive both need either a custom rule or a deliberate, documented
decision to accept them, the same discipline this session's other fixes
have applied to every OCR-adjacent change.

## 4. The serious one: a footnote marker swallowed into a URL

Deepwater Horizon cites sources as `www.site.gov/page.pdf.[^90]` — URL,
period, footnote marker, **no space**. remark's autolink scanner does not
treat `[` as a URL terminator, so it consumes the marker into the link:

```
current: <a href="http://www.eia.gov/emeu/aer/petro.html">...</a>.<sup>39</sup>...
remark:  <a href="http://www.eia.gov/emeu/aer/petro.html.%5B%5E39">...html.[^39</a>]
```

The `[^39]` is gone as a structural footnote reference — trapped as
literal, URL-encoded text inside a broken `href`, never resolved to a
sidenote. **54 confirmed instances, all in this one report** (mechanically
counted via the `%5B`/`%5E` URL-encoding signature left in the output;
not chased in the other 9, but Deepwater's citation convention — no space
before the marker — is plausibly report-specific, not universal).

This is exactly the kind of thing #114 asked this spike to find rather
than assume away, and it's the strongest reason not to treat this as a
quick swap: fixing it needs either a plugin ordering change (resolve
footnote references before autolink-literal ever scans the text) or an
explicit rule that a URL match stops before a following `[^`. Untested
against the other 9 reports' own citation conventions.

## 5. Two bugs the current pipeline has, found only by building a second implementation

**Empty list items borrow unrelated later text for their permalink id.**
Challenger page 184 has an OCR-garbled figure caption: a bare `-` on its
own line (an empty bullet item — nothing follows it before the blank
line), immediately followed by a heading, `## DOWNSTREAM SECONDARY`. The
current renderer's list-id logic is:

```ts
const firstItem = tokens.slice(i).find((later) => later.type === "inline");
```

— not scoped to the list's own item. For a genuinely empty item, this
walks *past* the empty list and grabs the next inline token anywhere
later in the document — here, the heading four elements on. The list's
permalink id becomes `downstream-secondary`, borrowed from unrelated
heading text, not from its own (nonexistent) content. The prototype,
correctly scoped to the list's own first child, falls back to the
documented "para" default instead — which is the *correct* behaviour per
the code's own stated intent ("its id comes from its first item"), and
what exposed the bug.

This cascades: once one list's fallback id diverges (`para-2` in one
pipeline where the other assigned real words), every subsequent
generically-numbered `para-N` paragraph in the rest of that document
shifts by one. That's the bulk of the ~1,150 "different id" hunks in the
raw diff — nearly all of them are this one root cause propagating through
Challenger and a couple of other reports with similar OCR-garbled
figures, not 1,150 independent problems. Worth its own bead: scope the
list-id lookup to the list's own subtree.

**`<s>` vs `<del>` for strikethrough.** markdown-it's built-in
(non-GFM-plugin) strikethrough renders `<s>`; remark-gfm renders the
GFM-spec canonical `<del>`. Different tag, same default browser styling,
no CSS in this repo currently targets either specifically. Trivial either
way; noted so it isn't mistaken for a content difference when re-reading
the diff.

## 6. Recommendation

**Migrate — eventually, deliberately, not as an urgent swap.** The
original framing in #114 ("not urgent on its own... worth doing alongside
ingestion odds and ends") holds up better after building the prototype
than a purely theoretical read would suggest, for a reason the theoretical
version couldn't have surfaced: real content has real edge cases
(OCR-garbled tildes, footnote markers glued to URLs, empty list items)
that only show up by actually running the two pipelines against the whole
corpus and diffing, which is what this spike did.

A scoped migration should treat this document's findings as its
checklist, not as background reading:

1. `remarkGfm({ singleTilde: false })` — mandatory, not optional.
2. Fix the footnote-into-autolink swallowing (§4) and re-check Deepwater
   Horizon plus every other report's own citation-to-URL spacing
   convention — this is the one correctness risk with no easy config
   toggle.
3. Decide, explicitly, what to do about schema-less bare-domain autolinks
   (§3) — write a small custom rule, or accept the loss and document it
   report by report.
4. Fix the list-id scoping bug (§5) in whichever pipeline ships — it's a
   real defect independent of this decision.
5. File the OCR-garble autolink defect (§3) as its own bead regardless of
   whether the migration happens — it's live on the site today.
6. Every id/permalink change gets the same treatment this session's other
   fixes got: read the corpus diff, accept it deliberately
   (`pnpm corpus accept`), never wave it through because the tool passed.

None of this blocks other work. The current pipeline is not broken — this
session hardened exactly the footnote-identity logic remark would replace
(`reportsthatmatter-ooj`, `reportsthatmatter-axw`) and it is correct today,
verified against real data. remark buys cleaner code and fixes more than
it breaks, but "cleaner" is not "urgent" when the thing it replaces works.
