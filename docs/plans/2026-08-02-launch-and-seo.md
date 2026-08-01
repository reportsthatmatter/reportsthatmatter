# Launch plan and SEO

**Date:** 2026-08-02
**Status:** ready to execute — the drafting is done, the posting is Rufus's

---

## 1. The two channels, and why they are different

**Search is the durable one.** Someone googling *"Trump so what Pence secure location"* should land on the exact paragraph of the Special Counsel report that says it. That traffic compounds, needs no upkeep, and is the closest thing this project has to a moat: nobody else has these documents as clean, section-level, linkable pages.

**Social is the ignition.** It supplies the first inbound links, and inbound links are what makes search work at all. On its own it decays within days.

So the sequence is: social provides the spike, the spike provides the links, the links make search work, and search is what is still delivering readers in six months. Doing social without the SEO groundwork wastes the spike.

## 2. SEO — what is already done

| | Why it matters |
| --- | --- |
| **Reports split into sections** | A 2.9 MB single page ranked for nothing. ~80 section pages, each about one subject, is the unit Google can actually rank. |
| **`/sitemap.xml`** | Lists every section. A crawler will not find 80 pages from a homepage that links two reports. |
| **`/robots.txt`** | Points at the sitemap. |
| **Per-passage descriptions** | `?p=` gives each shared link a description drawn from the passage. |
| **Semantic markup, no JS to read the text** | The whole document is in the HTML. |
| **Stable URLs** | Text-derived paragraph ids, redirects for renames. Link equity survives re-ingestion. |

### Still to do

**Google Search Console — yes, submit.** It is the single highest-value SEO action available and takes ten minutes:

1. <https://search.google.com/search-console> → Add property → **Domain** → `reportsthatmatter.org`
2. It gives a TXT record; add it in Cloudflare DNS → Verify.
3. Sitemaps → submit `sitemap.xml`.
4. URL Inspection → paste the Jack Smith report → **Request indexing** (nudges the crawler for the launch).

Worth it beyond indexing: Search Console is the only place that tells you *which queries you are appearing for*. Cloudflare says ~3k uniques a month and we have never known what they came for. That answer should shape which reports we ingest next.

**Bing Webmaster Tools** — same idea, ten more minutes, and it imports directly from Search Console. Worth doing because it also feeds ChatGPT search.

**Structured data (later).** `Article` / `Report` schema on report pages, `BreadcrumbList` on sections. Cheap, and makes rich results possible. Not before launch.

## 3. Where the announcement should live

Options considered:

- **Abuse the changelog.** It exists, it is already public, and the entries read reasonably. But a changelog is a record of *changes*, and an announcement is an argument. Mixing them makes the changelog worse at its job and gives the announcement a strange frame.
- **A full blog.** Correct eventually, wrong now. A blog with one post looks abandoned; a blog with no publishing cadence *is* abandoned. It also invites the project to become a commentary site, which is precisely what it says it is not.
- **Use `/about`, which already exists.** ← **recommended**

`/about` is already the landing page for campaign traffic and already carries the argument. The announcement is not new content so much as the same argument told once, in public, on a particular day. The thread points at `/about`, `/about` points at the report.

**When a blog becomes right:** when there is a second thing to say — a report worth its own essay, a finding worth writing up, a methodology post about the ingestion pipeline. At that point add `/writing` and move on. Not before. Logged in the roadmap.

## 4. The launch sequence

**T-1 day**
- Submit to Search Console, submit the sitemap, request indexing on the report.
- Create the `@ReportsThatMatter` account (handle check: `@ReportsThatMattr`, `@RTM_Reports` as fallbacks).
- Post the pinned tweet on that account.

**T-0, morning (best engagement for political/news content is 9–11am ET)**
- Post the thread from the personal account (drafted below).
- Quote-tweet it from `@ReportsThatMatter`.

**T-0 onward**
- One excerpt per day from the excerpt account, each using a card and linking to the passage.
- Five cards are ready; the passages are in `docs/share-quotes.yaml`.

**T+3 days**
- Check Search Console for impressions. If the report is not indexed, request indexing again.
- Check Cloudflare analytics: how many reached a report page, how far they read.

## 5. What success looks like

Deliberately modest, and about the *loop* rather than the numbers:

- The report page is indexed and appearing for at least one phrase from its text.
- At least one inbound link from somewhere that is not us.
- Someone shares a paragraph link we did not share ourselves. **This is the real signal** — it means the atomic unit of sharing works, which is the entire product thesis.

Vanity metrics to ignore: impressions on the thread, follower count.

---

## Appendix A — the announcement thread (draft)

Personal account. Plain, no hype; the material is strong enough.

> **1/**
> Important public reports — inquiries, investigations, official findings — are some of the most careful research ever done. And they're almost unreadable: 700-page scanned PDFs on government sites that break.
>
> I've been fixing that. reportsthatmatter.org

> **2/**
> First up: the Jack Smith Special Counsel report on the 2020 election.
>
> 169 pages. Every paragraph has its own link. Footnotes sit in the margin next to the sentence they support, instead of 70 pages away.

> **3/**
> The point is being able to cite the exact passage.
>
> Highlight any sentence and you get a permanent link straight to it — so an argument can point at the evidence, not at "somewhere in the PDF".
>
> [card: "So what?" + link]

> **4/**
> Also live: the Senate's Wall Street and the Financial Crisis report (2011).
>
> It had been converted badly years ago — 8,178 fragments, two headings in 645 pages. Rebuilt through a proper pipeline with automated checks that the text matches the source.

> **5/**
> No commentary. No spin. The documents, made readable.
>
> More reports coming. If there's one you think belongs, tell me.
>
> reportsthatmatter.org

**Notes**
- Tweet 3 carries a card and is the one most likely to travel — it is the demo and the proof in one.
- Tweet 4 is deliberately unglamorous. "We fixed a badly converted document" signals seriousness to the people who care about primary sources, and they are the audience worth having.
- Avoid partisan framing entirely. The material is contested; the project's credibility depends on being the place both sides can cite.

## Appendix B — pinned tweet, `@ReportsThatMatter`

> Excerpts from public-interest reports — inquiries, investigations, official findings.
>
> Evidence first. No commentary.
>
> Every excerpt links to the exact paragraph in the full report.
>
> reportsthatmatter.org

## Appendix C — excerpt format

```
"[verbatim quote]"

— [Report name], p. [n]

[link to the paragraph]
[card image attached]
```

Rules that keep the account credible:
- **Verbatim only.** No paraphrase, ever.
- **Always the page number.** It is what makes an excerpt checkable.
- **Never add commentary**, not even a framing adjective. The account's value is that it can be trusted; every editorial word spends that.
- **Link to the passage, not the report.**
