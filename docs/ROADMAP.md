# Roadmap

The master list of what we might build and why. Ordered by **what gets people
to the reports**, not by what is technically interesting — we can build the most
beautiful archive on the web and it will not matter if nobody visits.

Working state lives in [`v2-features.yaml`](v2-features.yaml) (per-item, machine
checked). This file is the thinking: what, why, and how much it is worth.

Status: **shipped** · **next** · **soon** · **later** · **someday**

---

## Distribution — getting people here

Nothing else on this list matters until this does.

| | Item | Why it earns its place |
| --- | --- | --- |
| shipped | **Paragraph permalinks** | The atomic unit of sharing. Without it there is nothing to link to but a 174-page document. |
| shipped | **Highlight-to-share** | Turns a reader into a distributor at the moment they find something worth quoting. |
| shipped | **Stable ids** | A shared link that rots is worse than no link. Text-derived, so re-ingestion cannot silently repoint it. |
| shipped | **Quote-preview links** | `?p=<id>` makes a shared link preview *the passage*, not boilerplate. A tweet showing the damning quote is a different object from one showing a site description. |
| **next** | **Launch the Jack Smith report** | The whole point. Thread + first excerpts, drafted in-repo, posted by Rufus. |
| shipped | **Quote cards** | Curated passages render as PNG cards carrying the quote, the page and the source. Pre-rendered at build time (`pnpm cards`) — feeds will not display SVG and a runtime rasteriser would cost more bundle than the whole site. Listed in `docs/share-quotes.yaml`. |
| soon | **Cards for arbitrary passages** | Cards are curated today, which is right for launch. If readers start sharing their own passages, generating on demand needs either Browser Rendering (paid) or satori+resvg in the Worker (~700 KB gzip against a 3 MB budget). Wait for evidence anyone wants it. |
| soon | **@ReportsThatMatter excerpt account** | Evidence-first, no commentary; a reference archive that accretes. Plan in `2026-01-13-twitter-launch-campaign.md`. |
| soon | **Sitemap + structured data** | These documents should be *the* search result for phrases they contain. Cheap, compounding. |
| later | **Analytics we actually read** | Cloudflare says ~3k uniques/month and we do not know what they look at. Answering that should precede guessing. |
| someday | **Newsletter / alerts on new reports** | Only once there is a publishing cadence to subscribe to. |

## Reading — making it worth the visit

| | Item | Why |
| --- | --- | --- |
| shipped | **Design system** | Pared-down editorial after Co-Star. Serious documents should look serious. |
| shipped | **Sidenotes** | A footnote you travel to is a footnote nobody reads, and in these reports the citation *is* the evidence. |
| shipped | **Printed page anchors** | Cite the way lawyers and journalists already cite: "Report at 62", checkable against the PDF. |
| **next** | **Split reports into sections** | Wall Street is a **2.9 MB page**. The document's own structure gives 17 parts, median 9.5 KB. Currently the worst thing about actually reading here. |
| soon | **Contents / in-page navigation** | Follows directly from splitting; a 169-page document needs a spine. |
| soon | **Reading position + progress** | Long documents; cheap to do, disproportionately nice. |
| shipped | **Changelog** | `/changelog`, hand-written from `docs/CHANGELOG.md`. Shows the project is alive and gives improvements somewhere to be announced from. |
| later | **Full-text search** | Big item, wants its own design pass — see below. Becomes *necessary* once we split, because splitting removes ctrl-F as the way to find things. |
| soon | **Visual texture / illustration** | Co-Star's illustration is a large part of why it reads as designed rather than merely clean. We have no visual texture at all. Likely direction: a treated facsimile of a real report page — aged, high-contrast, possibly lightly animated — so the homepage shows the thing we rescue documents *from*. Direction is open; the point is that the touches matter. Two notes: it is a **distribution** item as much as a reading one (an illustration is what makes the site screenshot-able, and it is the raw material for the quote cards above — build them together), and if the source is a facsimile of a real document it should be one we have the rights to and ideally one we have published, so the image is itself evidence rather than decoration. |
| later | **Better report landing pages** | Provenance, summary, why this report matters. Currently we drop readers straight into the text. |
| someday | **Side-by-side original page images** | The strongest possible answer to "is this faithful?". Expensive. |

## Content — more to read

| | Item | Why |
| --- | --- | --- |
| shipped | **Ingestion pipeline + fidelity gates** | The reusable engine. Every report goes through it. |
| **next** | **Footnote recall** | 206 of ~283 notes are placed; the rest leave bare markers in the prose and no sidenote. Most visible remaining quality gap. |
| soon | **Heading completeness** | Titles wrapping more than twice still truncate. |
| soon | **More reports** | The archive is two. Candidates in `brief-2026-01-13-good-reports.md`. |
| soon | **Re-ingest the Wall Street sample** | Predates the pipeline; page numbers stranded mid-text, almost no headings. Needs its source PDF, which we do not hold. |
| later | **OCR review workflow** | 91 suspects sit in `fidelity.md` with nothing to action them. |
| later | **Contributor path for reports** | `contribute-reports.md` exists; nothing implements it. |

## Platform — keeping it standing

| | Item | Why |
| --- | --- | --- |
| shipped | **Cloudflare deploy + prod verification** | Including a `VERIFY_BASE` mode, after `/health` flapped 200/404 in production only. |
| **next** | **Custom domain** `v2.reportsthatmatter.org` | One dashboard route. It is what we would actually put in a tweet. |
| soon | **Reports out of the main repo** | Ingestion is per-report and messy; the site repo should not carry that churn. See the architecture doc. |
| soon | **Pre-render at build time** | Stop re-parsing 2 MB of markdown per request; serve prepared HTML from static assets. |
| later | **R2 for report storage** | Bundling caps out at ~20-25 reports. Not urgent at two; put the lookup behind an interface now so the swap is one module. |
| later | **Redirects / alias table** | For when ids or URLs do move, so citations survive. |
| someday | **Multiple environments** | Only when a broken deploy would actually cost something. |

---

## Full-text search — parked, deliberately

The biggest single item on the list and the one most likely to be built badly if
rushed. Parked until it can have its own design pass. What that pass has to
settle:

- **Where the index lives.** Client-side (ship the index, works offline, but a
  174-page report is a big download) versus server-side in the Worker
  (D1? KV? an inverted index in R2?). These are different products.
- **Scope.** Within a report, or across the archive? Cross-report is far more
  valuable and considerably harder.
- **What a result *is*.** For this project a search result should be a citable
  passage with its page number — not a page title and a snippet.
- **Index size and freshness** against the bundle limits already documented.

Related but separate, and cheap: exposing a sitemap and letting Google do the
indexing. Worth doing first, and it may reveal that external search covers more
of the need than expected.

---

## Recording new ideas

Add them here, in the section they belong to, with a one-line *why*. An item
with no why does not get built. When something becomes active work it moves into
`v2-features.yaml` with a verification condition attached.
