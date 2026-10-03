# Launch plan and SEO

**Date:** 2026-08-02
**Status:** ready to execute — the drafting is done, the posting is Rufus's

**Update, 2026-09-27 (reportsthatmatter-y2t.2):** Appendices A–C below were drafted when the site carried one report. There are now 11. They are rewritten here for the full archive, and for the channels actually decided on 2026-09-25: Bluesky (`@reportsthatmatter.org`) is the organisation's only account and carries both the launch thread and the pinned post; there is no organisation account on X. X carries only the personal-account thread, which Rufus posts by hand. Section 4 below is updated to match. Nothing is posted by an agent — see AGENTS.md, "No external posting, account creation, or scheduling."

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
- Submit to Search Console, submit the sitemap, request indexing on the reports already live.
- Create `@reportsthatmatter.org` on Bluesky (reportsthatmatter-y2t.1), and hand over its app password. Verify Search Console and Bing.
- Post the pinned post (Appendix B) on `@reportsthatmatter.org`.

**T-0, morning (best engagement for political/news content is 9–11am ET)**
- Rufus posts the X thread (Appendix A) by hand, from his personal account. There is no organisation account on X — decided 2026-09-25 — so this is the only X post in the sequence.
- Post the Bluesky launch thread (Appendix B) from `@reportsthatmatter.org`.

**T-0 onward**
- One excerpt a day from `@reportsthatmatter.org`: a verbatim quotation, its page, and a link to the passage — the format at Appendix C — built from the approved editorial highlights via the posting queue (reportsthatmatter-y2t.3) and posted by the scheduled poster (reportsthatmatter-y2t.4) once it exists; by hand until then.

**T+3 days**
- Check Search Console for impressions. If a report is not indexed, request indexing again.
- Check Cloudflare analytics: how many reached a report page, how far they read.

## 5. What success looks like

Deliberately modest, and about the *loop* rather than the numbers:

- The report page is indexed and appearing for at least one phrase from its text.
- At least one inbound link from somewhere that is not us.
- Someone shares a paragraph link we did not share ourselves. **This is the real signal** — it means the atomic unit of sharing works, which is the entire product thesis.

Vanity metrics to ignore: impressions on the thread, follower count.

---

## Appendix A — the X thread (draft), personal account

Rufus's personal account, posted by hand — there is no organisation account on X (decided 2026-09-25). Plain, no hype; the material is strong enough. Every quotation below is copied verbatim from the approved `editorial/<id>.yaml` files and checked against the rendered report by `pnpm editorial`.

> **1/**
> Important public reports — inquiries, investigations, official findings — are some of the most careful research ever done. And they're almost unreadable: 700-page scanned PDFs on government sites that break.
>
> I've been fixing that. 13 reports live now: reportsthatmatter.org

> **2/**
> Among them: the Jack Smith report on Trump and the 2020 election, the Senate's report on the 2008 financial crisis, the 9/11 Commission, Deepwater Horizon, US v. Philip Morris, Bloody Sunday, Hillsborough, Challenger, Columbia, Leveson, Litvinenko.
>
> Every paragraph in every one has its own link.

> **3/**
> The point is being able to cite the exact passage.
>
> Highlight any sentence and you get a permanent link straight to it — so an argument can point at the evidence, not at "somewhere in the PDF".
>
> [card: "When an advisor at the White House learned this, he rushed to the dining room and informed Mr. Trump, who replied "So what?"" + link to reportsthatmatter.org/reports/jack-smith-vol1/mr-trumps-supporters-attack-the-united-states-capitol?p=trump-has-something-else-left]

> **4/**
> Some of these had never been properly digitised. The Senate's Wall Street and the Financial Crisis report (2011): 8,178 fragments, two headings, across 645 pages, when I found it. Rebuilt through a proper pipeline with automated checks that the text matches the source.

> **5/**
> No commentary. No spin. The documents, made readable.
>
> More coming. If there's one you think belongs, tell me.
>
> reportsthatmatter.org

**Notes**
- Tweet 3 carries a card and is the one most likely to travel — it is the demo and the proof in one.
- Tweet 4 is deliberately unglamorous. "We fixed a badly converted document" signals seriousness to the people who care about primary sources, and they are the audience worth having. (This is the same Senate report and the same fact as the January draft; it was true then and is true now.)
- Avoid partisan framing entirely. The material is contested; the project's credibility depends on being the place both sides can cite.
- Rufus posts this by hand; nothing here is posted by an agent.

## Appendix B — Bluesky (`@reportsthatmatter.org`): launch thread and pinned post

The organisation's only account (X has none — decided 2026-09-25). Same voice as the excerpt account it also runs: evidence first, no commentary (Appendix C). Every quotation is copied verbatim from the approved `editorial/<id>.yaml` files, checked by `pnpm editorial`, and linked with its own `?p=<paragraph-id>` deep link. Each post is under Bluesky's 300-grapheme limit (counted with `Intl.Segmenter`, grapheme granularity); the count is noted after each one.

**Launch thread**

> **1/6**
> Public inquiries and investigations are some of the most careful research done — usually locked in 700-page PDFs that don't load, can't be searched, and can't link to one paragraph.
>
> We rebuilt 13 of them as web pages instead.
>
> reportsthatmatter.org

*(249 graphemes)*

> **2/6**
> 13 reports so far, different countries and decades: the Jack Smith report on the 2020 election, the Senate's report on the 2008 financial crisis, 9/11, Deepwater Horizon, US v. Philip Morris, Bloody Sunday, Hillsborough, Challenger, Columbia, Leveson, Litvinenko, Chilcot (Iraq Inquiry), the Lehman examiner.

*(263 graphemes)*

> **3/6**
> Each report is split into sections that load, and every paragraph has its own permanent link. Highlight any sentence and you get a link straight to that passage, not "somewhere in a PDF".

*(187 graphemes)*

> **4/6**
> From the Special Counsel's report on the 2020 election:
>
> "Until Mr. Trump obstructed it, this democratic process had operated in a peaceful and orderly manner for more than 130 years."
>
> reportsthatmatter.org/reports/jack-smith-vol1/the-results-of-the-investigation?p=trump-aimed-his-deceit-united

*(296 graphemes)*

> **5/6**
> From the Senate's report on the 2008 financial crisis, on the regulator that let Washington Mutual keep making unsafe loans:
>
> "It was a regulatory approach with disastrous results."
>
> reportsthatmatter.org/reports/us-psi-financial-crisis/subcommittee-investigation?p=agency-s-failure-restrain-wamu

*(296 graphemes)*

> **6/6**
> No commentary. No spin. The documents, made readable.
>
> 13 reports and counting. If there's one you think belongs, tell us.
>
> reportsthatmatter.org

*(145 graphemes)*

**Alternative opening post (1/6), if a more concrete hook reads better:**

> Investigations, inquiries, official findings — some of the most careful research that gets done. Most of it sits in scanned PDFs: no search, no section links, no way to point at one paragraph.
>
> 13 of them, rebuilt as web pages.
>
> reportsthatmatter.org

*(250 graphemes)*

**Pinned post**

> Excerpts from public-interest reports — inquiries, investigations, official findings.
>
> Evidence first. No commentary.
>
> Every excerpt links to the exact paragraph in the full report.
>
> 13 reports and counting.
>
> reportsthatmatter.org

*(230 graphemes)*

**Notes**
- Posts 4/6 and 5/6 are the demo-and-proof pair, one per report, each a full sentence that stands on its own without its surrounding paragraph (per `docs/report-introductions.md`, "Quotations must stand on their own").
- No page numbers in the thread or pinned post: unlike the daily excerpt format (Appendix C), these link straight to the passage, and a `?p=` link is itself the checkable reference. Page numbers stay mandatory once the daily excerpt account starts (Appendix C).
- Nothing here is posted, scheduled, or account-created by an agent — see AGENTS.md.

## Appendix C — excerpt format

For the one-a-day excerpt posts from `@reportsthatmatter.org` once the posting queue (reportsthatmatter-y2t.3) and scheduled poster (reportsthatmatter-y2t.4) exist — not the launch thread or pinned post above, which are one-off and link directly to the passage instead.

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
