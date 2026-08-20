# Full-text search — the four questions, answered

**Date:** 2026-08-21
**Status:** decided, ready to build
**Supersedes:** the "parked, deliberately" block in `docs/ROADMAP.md`

Search was parked because four questions had no answers, not because it was
hard. Here are the answers and the reasoning, so the build can start.

---

## Q1. Where does the index live?

**D1, using SQLite's FTS5.** Not client-side, not in the Worker bundle.

The three candidates and why the other two lose:

| | Verdict |
| --- | --- |
| **Client-side index shipped to the browser** | A different product. It works offline and costs nothing to run, but the archive is four reports and ~1.5 M words already; shipping an index for cross-report search means a multi-megabyte download before the first query. Reasonable for one report, incoherent for an archive that intends to grow to dozens. |
| **Index bundled into the Worker script** | Ruled out by arithmetic. The script is at 1.43 MB gzipped of a 3 MB cap and reports already own that budget; adding an inverted index accelerates the exact ceiling the architecture doc says to stop pushing against. |
| **D1 + FTS5** | Chosen. |

D1 wins on four counts. It is a managed inverted index with **BM25 ranking
already implemented**, which is otherwise the part most likely to be built
badly. It costs **zero bundle bytes**, which directly relieves the constraint
that is closest to biting. Its size limits are irrelevant at this scale — four
reports is roughly 20–30k paragraph rows against a 5 GB allowance. And it is the
**same data layer phase 3 of the highlights design needs**, so the site acquires
one piece of infrastructure rather than two.

The row is the paragraph, not the page or the report:

```sql
CREATE VIRTUAL TABLE passages USING fts5(
  report, section, paragraph_id, page UNINDEXED, body,
  tokenize = 'porter unicode61'
);
```

The lookup goes behind a small interface, as the architecture doc asks of report
storage, so replacing D1 later is one module.

## Q2. Within a report, or across the archive?

**Across the archive by default; within a report as a mode.**

Cross-report is where the value is, and it is the thing no PDF and no
`site:` query can do: *which of these four investigations mention this bank, this
official, this date.* An archive that can only search one document at a time is a
document viewer.

Concretely: `/search?q=…` searches everything; `/search?q=…&report=<id>` scopes,
and the search box on a report page pre-fills that scope with an obvious way to
widen it. Within-report is a `WHERE` clause, not a second implementation.

## Q3. What is a result?

**A citable passage, not a page with a snippet.** This is the answer that makes
search consistent with the rest of the project rather than bolted onto it.

Each result carries:

- the matched text, with the match marked;
- the report, and the section it sits in;
- the **printed page number** — the way this material is actually cited;
- a link that is the *quote anchor from the highlights design*, so following a
  result lands on the exact matched sentence with it highlighted, not at the top
  of a section for the reader to hunt through.

That last point is why these two features should be built in this order and by
the same hand. Search results and shared highlights want to be the same object:
an addressable passage. Build the anchor once (highlights phase 1), and search
inherits precise deep links for free.

Ranking is BM25 as FTS5 supplies it, with column weights favouring `body` and a
mild boost for matches inside a section heading. No hand-tuned relevance until
there is a query log to tune against — which is another reason Search Console
matters.

## Q4. Index size and freshness

**Built at deploy time, versioned with the content, checked by `verify.sh`.**

- The index is generated from the *rendered* output, from the same source the
  pages are served from, so a passage that is searchable is guaranteed to exist
  at the link the result gives. Generating from markdown instead would let the
  two drift.
- Each report gets a `content_version` in the registry. The index records the
  version it was built from.
- **`verify.sh` fails if any published report's `content_version` is not the one
  in the index.** Staleness in a search index is the same class of defect as a
  citation that resolves to the wrong text: silent, and only visible to the
  reader.
- Rebuilds are per-report, so re-ingesting one document does not mean rebuilding
  the archive.

Size at four reports is single-digit MB. The number to watch is not storage but
D1's read units on the free plan; at 3k uniques/month it is not close.

---

## What this does not settle

**Search UI design.** The questions above are architecture; how the results page
looks is a design pass, and it should follow the same restraint as the rest of
the site. Sketches belong with the visual work, not here.

**Whether external search covers more of the need than expected.** The roadmap's
instinct — ship the sitemap, let Google index it, then look at what people
actually search for — is still right, and Search Console is still the cheapest
possible input to this feature. It does not block the build, but the query log
should shape the ranking work.

---

## Build order

1. Extraction: rendered output → passage rows, per report, with page numbers.
2. D1 schema + loader, behind an interface, with `content_version` recorded.
3. `/search` route: query, scope, BM25 ranking, results as citable passages.
4. Results link through the highlight anchor (**depends on highlights phase 1**).
5. `verify.sh`: index freshness gate, and an assertion that a known phrase in
   each published report is findable and links to the right passage.
