# Twitter/X Launch Campaign — Jack Smith Report

## Overview

Two-track approach to launching Reports that Matter on Twitter/X:

1. **@ReportsThatMatter** (or similar) — automated excerpt account
2. **Personal account** (~10k followers) — launch announcement + amplification

---

## Track 1: Reports that Matter Account

### Purpose

A "bot-like" account that tweets excerpts from public-interest reports. Evidence-first, minimal commentary. Becomes a reference archive over time.

### Account Setup

**Handle options:**
- @ReportsThatMattr (if @ReportsThatMatter taken)
- @RTM_Reports
- @TheReportSays

**Bio (draft):**
> Excerpts from public-interest reports. Evidence first. No commentary.
> Read the full reports: [link]

**Pinned tweet (draft):**
> This account shares excerpts from important public reports — government inquiries, investigations, official findings.
>
> No spin. Just the source.
>
> First up: The Special Counsel Report on January 6.

### Excerpt Tweet Format

Standard template:
```
"[Direct quote from report]"

— [Source: Report Name, page/section if available]

[Link to highlighted passage on reportsthatmatter.org]
```

Example:
```
"So what?"

— Trump's response when told VP Pence had been rushed to a secure location during the Capitol attack

Source: Special Counsel Report, Vol. 1

[link]
```

### First Batch — Jack Smith Report Excerpts

#### Direct Quotes (Primary)

1. **"So what?"**
   Trump's response when an aide told him Pence had been rushed to a secure location.

2. **"The details don't matter."**
   Trump, when told his lawyer couldn't prove fraud allegations in court.

3. **"You'll go down as a wimp."**
   Trump to Pence, morning of January 6. (From Pence's handwritten notes)

4. **"You're too honest. Hundreds of thousands are gonna hate your guts. People are gonna think you're stupid."**
   Trump to Pence, January 1, 2021.

5. **"It doesn't take courage to break the law. It takes courage to uphold the law."**
   Pence's reply to Trump.

#### Conclusions/Findings (Secondary)

6. **"The throughline of all of Mr. Trump's criminal efforts was deceit — knowingly false claims of election fraud."**

7. **"The admissible evidence was sufficient to obtain and sustain a conviction at trial."**

8. **"When the defendant lost the 2020 presidential election, he resorted to crimes to try to stay in office."**

### Posting Cadence

- **Launch day:** 3-4 excerpts spread across the day
- **Ongoing:** 1-2 excerpts per day, scheduled
- **Goal:** Build a consistent stream that can run semi-automatically

---

## Track 2: Personal Account (Launch)

### Purpose

Announce the project, provide context, amplify RTM account content.

### How to Create the Tweet Series

**Process:**

1. **Start with core message** — Write 3-5 bullet points of what you want to communicate
2. **Expand into announcement page** — A short page on the site (e.g., `/about` or `/launch`) that explains the project
3. **Compress into tweets** — Each bullet becomes a tweet in the thread
4. **Link structure:** Tweets → Announcement page → Report

**Why have an announcement page:**
- Gives context before dropping someone into a 100-page report
- You can update it (tweets are permanent)
- Better for SEO
- Softer landing — "here's what this is and why" before "here's the evidence"

**Link chain:**
```
Tweet thread → reportsthatmatter.org/about → reportsthatmatter.org/reports/jack-smith
```

### Core Message (Bullets)

1. Important public reports are buried in PDFs, hard to read, hard to link to
2. I'm making them readable and quotable on the web
3. First report: Jack Smith Special Counsel Report on January 6
4. @ReportsThatMatter tweets excerpts — no spin, just the source
5. Follow for primary sources, not takes

### Launch Announcement (Draft)

**Thread option:**

> 1/ I built something: @ReportsThatMatter
>
> It's a simple idea: important public reports (government inquiries, investigations) are hard to read, hard to link to, and buried in PDFs.
>
> So I'm making them readable and quotable on the web.

> 2/ First report: The Jack Smith Special Counsel Report on January 6.
>
> The report that documented "sufficient evidence to obtain and sustain a conviction" — before being dismissed because you can't prosecute a sitting president.
>
> Read it: [link]

> 3/ @ReportsThatMatter will tweet excerpts from the report — direct quotes, key findings.
>
> No commentary. Just the evidence.
>
> Follow if you want the primary source, not the takes.

**Single tweet option:**

> New project: @ReportsThatMatter
>
> I'm making important public reports readable + quotable on the web.
>
> Starting with the Jack Smith Special Counsel Report.
>
> The account tweets excerpts. No spin, just the source.
>
> [link to report]

### Amplification Pattern

- Retweet RTM excerpts with brief personal commentary when relevant
- Quote-tweet with context for excerpts that need it
- Don't over-amplify — let RTM build its own rhythm

---

## Open Questions / Next Steps

### Technical

- [ ] **Twitter bot options:** Can we automate posting? Research Twitter API, scheduling tools (Buffer, Typefully, etc.)
- [ ] **Account creation:** Reserve the handle

### Content

- [ ] **Get the PDF:** Download Jack Smith report and extract more/better quotes directly from source
- [ ] **Deep links:** Need the report on reportsthatmatter.org with paragraph-level links before launch

### Timing

- [ ] **Dependencies:** Report must be live on the site before tweeting links
- [ ] **Launch window:** Any news hooks coming up? (Court dates, congressional hearings, etc.)

---

## Success Metrics

- RTM account followers after 2 weeks
- Engagement on excerpt tweets (retweets, quotes)
- Click-throughs to report pages
- Personal account engagement on launch thread

---

## Appendix: Twitter Automation Options

### Option 1: Scheduling Tools (Easiest)

**Buffer** — $6/month per channel
- Schedule tweets in advance via simple UI
- Free plan only allows 10 scheduled posts (not enough for ongoing use)
- No coding required

**Typefully** — $12.50/month
- Twitter-focused, good for threads
- More features than needed for an excerpt bot

### Option 2: X API Free Tier + Custom Bot (Free but technical)

- ~500 tweets/month limit (enough for 1-2/day)
- Requires building a simple bot (Node.js, Python, etc.)
- Can run on GitHub Actions for $0 hosting
- More setup effort, but completely free ongoing
- Need to apply for developer account at developer.x.com

### Option 3: Manual Scheduling (Simplest)

- X/Twitter has built-in scheduling (calendar icon when composing)
- Free, no tools needed
- Batch-schedule a week of excerpts in 15 minutes

### Recommendation

**Start with manual scheduling** using X's built-in scheduler. Validate the concept works before investing in automation.

Once validated:
- If you want zero effort: Buffer at $6/month
- If you want free + automation: Build a simple bot with X API free tier + GitHub Actions

---

## Appendix: Announcement Page Draft

This is the short landing page for Twitter traffic — lives at `/about` or similar.

**Design notes:**
- ~80 words, scannable in 10-15 seconds
- Neutral, institutional tone (personal voice stays on personal Twitter)
- Single CTA: read the report
- Light attribution at bottom

---

**Reports that Matter**

Important public reports — government inquiries, investigations, official findings — contain some of the most careful research ever produced on matters of public importance.

But they're buried. Scattered across broken government websites, locked in huge PDFs, impossible to link to at the level that matters: the specific finding, the key paragraph, the actual evidence.

Reports that Matter makes these reports usable on the web. Searchable. Readable. Linkable at the paragraph level.

No commentary. No spin. Just the source, made accessible.

**First report:** [The Special Counsel Report on January 6 →]

Follow [@ReportsThatMatter]() for daily excerpts.

---

*A project by [Your Name]*
