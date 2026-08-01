# Architecture — where reports live, how they get served, how they get cited

**Date:** 2026-08-01
**Status:** for discussion
**Context:** V2 is live at <https://reportsthatmatter.office-d34.workers.dev>
with two reports. Everything below is measured against that deployment, not
estimated.

---

## 0. The short version

Four findings, in order of how much they should change what we do:

1. **One report = one page is already broken.** The Wall Street report is a
   **2.9 MB HTML page**. That is not a reading experience, it is a download. The
   document's own section structure gives 17 natural parts with a median of
   9.5 KB. Split it.
2. **Bundling reports into the Worker script has a hard ceiling of roughly 20–25
   reports**, and we are already 31% of the way to the free-plan limit with two.
   This is the constraint that forces the storage decision, and it forces it
   soon.
3. **Rufus is right that reports belong outside the main repo — for processing.**
   He is right for a reason worth stating precisely: ingestion is per-report,
   iterative, and messy, while rendering is uniform. But that is an argument
   about *authoring*, not about *serving*, and conflating the two is what makes
   this question feel hard.
4. **The thing most at risk is the permalink**, which is the entire product
   proposition. Paragraph ids are currently positional (`p-1`, `p-2`, …), so
   *re-ingesting a report silently renumbers every citation ever made against
   it*. This is the most important item in this document and it is not on
   anyone's list yet.

---

## 1. What we have now

```
PDF ──(local, manual)──> markdown ──(committed to main repo)──> bundled as a
text module into the Worker script ──> markdown-it at request time ──> HTML
```

Measured on the live deployment:

| | Raw | Notes |
| --- | --- | --- |
| Worker bundle | 3,065 KiB (932 KiB gzip) | two reports |
| `/` | 4.0 KB | fine |
| `/reports` | 2.4 KB | fine |
| `/reports/jack-smith-vol1` | **482 KB** | one page, 169 PDF pages |
| `/reports/us-senate-…` | **2,904 KB** | one page |

Cloudflare Workers limits: **3 MB gzip (free), 10 MB gzip (paid), 64 MB
uncompressed**. Static assets are governed separately and far more generously:
20,000 files (free) / 100,000 (paid), 25 MiB per file.

The two facts to hold together: the *script* is tightly limited, the *assets*
are not. We are currently putting reports in the tightly limited one.

### The ceiling, concretely

Average of the two reports is ~1.25 MB of markdown, ~380 KB gzipped once
bundled. Against the paid 10 MB gzip limit that is **~26 reports**; the 64 MB
uncompressed limit bites at a similar point. Call it **20–25 reports** before
deploys start failing, with every deploy re-uploading every report along the
way.

For a project whose ambition is an archive, a 20-report ceiling is not a
long-term architecture. It is also not an emergency — it is the third or fourth
thing to fix, not the first.

---

## 2. Is Hono the right approach?

**Yes — keep it.** But the reason matters, because it changes how we use it.

Hono is doing almost nothing for us today: three routes, no middleware, no state.
Any of the alternatives would be equally fine for *that*. The argument for
keeping it is about where the product is going, not where it is:

- Reports that Matter wants **search**, and eventually cross-report search. That
  is a request-time query against an index. A purely static build cannot do it
  without shipping the whole index to the browser.
- **Highlight-to-share** wants canonical short links, and share cards want
  per-passage OG images. Both are request-time.
- Redirect and alias handling — old URLs, renumbered paragraphs, PDF page
  numbers — needs a live routing layer, and this project will accumulate those.

So the recommendation is not "static vs dynamic". It is:

> **Pre-render everything that can be pre-rendered; keep the Worker for the
> things that genuinely cannot be.**

Which means the change to make is not replacing Hono. It is **moving report
rendering out of request time**, so the Worker stops re-parsing 2 MB of markdown
on every page view and starts serving prepared HTML.

That single change fixes the CPU cost, most of the size problem, and the
latency, without giving up any dynamic capability.

---

## 3. Where should reports live?

Rufus's instinct — one repo per report, outside the main repo — is right, and
worth separating into the two questions it actually contains.

### Authoring: per-report repos. Agreed.

Ingesting a report is iterative and specific: extraction settings, OCR
corrections, structural fixes, provenance notes, sometimes the source PDF
itself (28 MB for Jack Smith). Committing all of that into the site repo means:

- the site repo's history fills with content churn that has nothing to do with
  the site;
- `git clone` gets slower forever, because deleted blobs stay in history;
- report corrections and site deploys are coupled for no reason.

The Jack Smith source PDF is already 28 MB and deliberately *not* committed. That
instinct was correct and should be the rule.

### Serving: not from the report repos. Also agreed.

Reading GitHub at render time is wrong for the reasons Rufus named and one more:

- **latency** — a cross-origin fetch on every page view, from every edge;
- **rate limits** — GitHub's raw endpoints are not a CDN and will throttle;
- **availability** — the site would go down when GitHub does;
- **integrity** — the live site would silently change whenever someone pushed to
  a content repo, with no review and no way to reproduce what a citation pointed
  at. For an evidence project, that last one is disqualifying on its own.

### So: a build step, and this is the piece that was missing

```
report repos (per report)              site repo
  source.pdf                             src/ templates, routes
  ingest.config.yaml          ──build──> reports.json (index)
  full.md (generated)                    parts/*.html (pre-rendered)
  fidelity.md                                   │
                                                ▼
                                     Cloudflare static assets
                                        (+ Worker for search,
                                         redirects, share links)
```

The build pulls report content from wherever it lives, renders it once, and
produces immutable artifacts. Deploys become reproducible: a given site version
serves exactly one version of each report, forever.

**On submodules:** they would work, and I would avoid them. Submodules make
every clone and CI checkout a multi-repo operation, they pin by commit in a way
that is easy to get wrong, and the failure modes are notoriously confusing. A
plain manifest — report id, repo URL, tag — fetched by the build script gives the
same reproducibility with none of the sharp edges, and lets the build fetch only
what changed.

---

## 4. Where do the rendered files go?

Three options, and the honest answer is that the middle one is right *now* and
the third one is right *later*.

| | Static assets binding | R2 | KV |
| --- | --- | --- | --- |
| Limit | 20k files free / 100k paid, 25 MiB each | effectively unbounded | 25 MiB/value |
| Read latency | edge, cached | good, needs a binding call | good |
| Cost | free | cheap, no egress fee | fine |
| Deploy | uploaded with the Worker, atomic | decoupled from deploy | decoupled |
| Rollback | version-pinned with the Worker | manual | manual |

**Recommendation: static assets now, R2 when we outgrow it.**

At 17 parts per report, 20,000 files is roughly **1,000 reports** on the free
plan. We have two. Static assets also give something R2 does not: the report
content is versioned *with* the Worker, so a rollback rolls back everything
together and a given deployment is one coherent thing.

The migration to R2, when it comes, is a change to one module — which is an
argument for putting the lookup behind a small interface now, not for adopting
R2 today. Cloudflare's own guidance points the same way: static assets by
default, R2 at tens of thousands of documents.

**Caching to R2 as a layer in front of GitHub** — one of the options raised — is
the one I would rule out. It has the availability and integrity problems of
reading from GitHub, plus cache invalidation, and buys nothing over rendering at
build time.

---

## 5. Splitting reports into parts

**Yes, and this is the most user-visible fix available.**

Currently one report is one page. Wall Street is a **2.9 MB** page — several
seconds to first paint on a good connection, and painful on mobile.

The document already tells us where to cut. Jack Smith Volume One has 17
level-2 sections:

| Section | Markdown |
| --- | --- |
| THE LAW | 70 KB |
| Notes (endnotes) | 71 KB |
| INVESTIGATIVE CHALLENGES AND LITIGATION ISSUES | 59 KB |
| THE RESULTS OF THE INVESTIGATION | 45 KB |
| THE PRINCIPLES OF FEDERAL PROSECUTION | 44 KB |
| … 12 more | median 9.5 KB |

Largest part ~85 KB of HTML — a normal long article. Proposed URLs:

```
/reports/jack-smith-vol1                     overview + contents + provenance
/reports/jack-smith-vol1/the-law             one section
/reports/jack-smith-vol1/the-law#p-46        a passage
/reports/jack-smith-vol1/full                everything, for print and download
```

Keeping `/full` matters: researchers ctrl-F across a whole document, and taking
that away to fix page weight would be a bad trade. It just should not be the
default.

Two things follow that are easy to miss:

- **Endnotes are 71 KB and every section links into them.** If notes live on
  their own page, every footnote click becomes a page load. Better: render each
  section's own notes at the foot of that section, and keep a complete notes
  page as well.
- **Search becomes necessary rather than optional.** Splitting removes ctrl-F as
  the default way to find things, so the split and the search index should ship
  together.

---

## 6. The permalink problem (the important one)

This is not on anyone's list and it should be at the top of it.

Paragraph ids are assigned **positionally at render time** — first paragraph is
`p-1`, second is `p-2`. So:

> Re-ingesting a report — fixing one OCR error, recovering the missing
> footnotes, improving heading detection — **renumbers every paragraph after the
> change**. Every link anyone has shared then points at the wrong text. Silently.
> It still resolves; it just resolves to something else.

For a project whose entire proposition is "cite the exact passage", that is the
worst available failure: not a broken link, a *quietly wrong* one. And we are
about to re-ingest — footnote recall and heading completeness are both open
items.

### What the source gives us

The PDF carries printed page numbers, and **149 of 169 pages have one**. The
pipeline already extracts them (`splitPage` returns `printed`) — and then throws
them away. That is a small fix with a large payoff, because the printed page
number is:

- **stable** — it is a property of the document, not of our parser;
- **canonical** — it is how these documents are actually cited ("Report at 62");
- **verifiable** — a reader can check the citation against the original PDF.

The numbering is not globally monotonic (front matter numbers separately, then
the body restarts), so it needs to be section-scoped rather than used raw.

### Proposal

Anchor on the document, not on our parse:

```
/reports/jack-smith-vol1/the-law#page-46          printed page 46
/reports/jack-smith-vol1/the-law#page-46-p2       2nd paragraph on that page
```

Paragraph-within-page is still positional, but the blast radius is one page
rather than the whole document, and the page anchor alone stays correct
regardless. Add a redirect table so old `p-N` links keep working, and a
`content_version` in the registry so we can tell which numbering a link came
from.

**Whatever else is decided here, this should be settled before the next
re-ingestion**, because every re-ingestion between now and then quietly
invalidates citations.

---

## 7. Recommendation, in order

1. **Stabilise permalinks** — page-based anchors, redirects for existing ids.
   Before the next re-ingest. *Cheap, and the cost of delay is unrecoverable.*
2. **Split reports by their own section structure**, with a `/full` view kept.
   *Biggest visible improvement; fixes the 2.9 MB page.*
3. **Pre-render at build time**, serve prepared HTML from static assets; Worker
   keeps routing, search, and share links. *Removes per-request markdown
   parsing and most of the bundle pressure.*
4. **Move report sources to per-report repos** with a manifest the build reads.
   *Decouples content churn from the site; matches how ingestion actually
   works.*
5. **Add search** — same release as the split.
6. **R2** only when static assets stop being enough. Put the lookup behind an
   interface now so this is a one-module change.

Steps 1 and 2 are worth doing next. Steps 3 and 4 are the ones that need
agreement first, because they change the repo layout and the release process.

---

## 8. Open questions for Rufus

- **Report repo granularity** — one repo per report, or one `reports` repo with
  a directory per report? Per-report is cleaner for big PDFs and independent
  history; one repo is far less admin. I lean to one `reports` repo with a
  directory each until the count or the PDF sizes force a split.
- ~~**Do we commit the source PDFs?**~~ **Decided 2026-08-02: yes, archive them
  in the report repos.** They are key source material and government sites are
  exactly the thing that rots — `us-psi-financial-crisis` already does this and
  it is why the Wall Street report could be re-ingested at all. Note the size:
  that repo carries 275 MB of PDFs, mostly hearing transcripts. Worth adding
  checksums alongside so tampering is detectable, but the binaries stay.
- **Is `/full` the canonical URL or is the split one?** Affects what we
  put in `<link rel="canonical">` and what gets shared.
- **How much does matching the PDF's own pagination matter to you?** It drives
  §6, and it is a judgement about your readers that I should not make alone.
