# Brand voice

Every piece of public copy follows this page: posts, threads, the blog, emails, pitches, bios and the site's own chrome. Report introductions also follow [`report-introductions.md`](report-introductions.md), which is stricter. The affected-community rules in the marketing repo's `strategy/2026-10-strategy.md` §8 override everything here. Written 24 October 2026, revised after a Fable review (`factory/reviews/review-brand-voice-2026-10-24.md`); change it by PR.

**The one line:** *The report's own words, as published. Our introductions and highlights are labelled as ours.* (decision 0017). Not "Just the source", not "No commentary. No spin."

## The stance

**Opinionated about access. Silent about verdicts.**

- **On access we argue.** Public inquiries are the most careful fact-finding a country pays for, and after one news day they are lost: a PDF nobody reads past the summary, on a website that closes. That is a fixable failure. A number helps (Leveson is 983,000 words) but the reports themselves make the case better than our method does.
- **On findings we say nothing, and choose carefully.** What we quote is our opinion, so we quote it whole, with its page, and never the sentence that merely sounds worst. We don't add a verdict.

## What we lead with, and the context it needs

Rufus, 21 Nov 2026. These reports matter less for their analysis (often some version of "someone screwed up") than for the **record**: what actually happened, minute by minute, email by email, document by document, gathered with the power to compel evidence. That is what the news never carried and what readers find gripping.

- **Lead with the record of what happened.** The 9/11 Commission's account of the day; bankers' and rating agencies' own emails in the Senate financial-crisis report; the tobacco companies' internal documents quoted in *United States v. Philip Morris*. Evidence, process and history first. A finding or conclusion is still fine to quote when it is the point, but it is rarely the most interesting sentence.
- **Give every passage its why-it-matters context**, as the report introductions do. Without it a reader doesn't know why Challenger was a big deal, or what it revealed about how a bureaucracy handles risk. One or two sentences, in our voice: what happened, why it mattered then, what it changed or showed about how institutions work. This is context, not a verdict: we explain why the moment is significant; we don't tell the reader what to conclude about the people in it.
- **The method is background.** How the text comes off the PDF, defect counts and the code belong in a link or a reply, not a lead. The story is that these reports are remarkable and get lost, and we are putting them online properly. The core narrative is the marketing repo's `strategy/2026-11-21-core-narrative.md`.

When copy reads as bland, we have usually hedged about access. Being careful about findings is what makes the access argument credible, so we don't trade one for the other.

## Voice

- **Plain.** Short declarative sentences. Concrete nouns: the page, the paragraph number, the year, the committee.
- **Exact.** Every claim can be checked. "p. 146", not "a key passage". "Volume 1 of 7", not "the Grenfell report".
- **Dry.** We can be wry about PDFs, broken links and small capitals, never about what a report is about.
- **Unhurried.** No urgency, no countdowns, no "now live". These reports are decades old.
- **Journalistic, not cautious** (Rufus, 22 Nov 2026). Sober and correct, and also engaging: these reports are gripping and our editorial copy (taglines, introductions, posts) should make a reader want to open them. Write like a good journalist, who is both accurate and interesting: lead with the vivid, true detail (the teapot of polonium, the morning rebuilt minute by minute, the banker's email), not a hedged summary. Accuracy is about substance, not about stripping every phrase down to what a source states word for word. A critique pass checks that nothing is wrong or a verdict of ours; it does not sand the copy flat.

## Do

- Lead with the document: one verbatim sentence, its source, its year, its page or paragraph number. On a post with a quote card, the card is the sentence and the text is its context: what the document is, who wrote it, when and why, never the quote again (the `post-writing` skill; Rufus, 24 Oct 2026).
- Say what we did in one line: rebuilt from the official PDF, every paragraph has its own link, the official PDF is one click away.
- Say what's wrong, with the number. "Where our text and the PDF differ, the PDF is right."
- Give the context line on every post from an `affected_community` report (registry field `context_line`; Challenger, Columbia and the others without one need one written before they are posted).
- End with the link. No call to action beyond it.

## Don't

- **No adjectives about findings:** damning, shocking, explosive, chilling, bombshell, must-read, devastating.
- **No hype:** launch, excited, thrilled, game-changer, revolutionary, unlock, empower, AI-powered, finally, introducing.
- **No verdicts on a passage:** no "this shows", "proof that", "worth remembering". Setup and why-it-matters context are expected (what the document is, who wrote it, when, the page, and why the moment was significant; see above). A verdict on the people in it isn't ours to add.
- **No partisan pairing:** no quote next to a current politician, a candidate or a claim about an election. A date can be the hook only when it is the report's own: a publication anniversary, a court day about the report itself.
- **No deaths as hooks:** no anniversary of a death, no court or charging day, no bereaved family or survivor as a target or a tag.
- **No over-claiming:** not "permanent", "every report", "all checked", "the definitive", or "printed page" where the pages are the PDF's.
- **No decoration:** no exclamation marks, no emoji, no "🧵" or "1/". One hashtag per report on Bluesky at most.

## Titles, numbers, spelling

- **Titles and subject lines** name the report and year, then one thing: a page, or what we did. "Columbia Accident Investigation Board (2003), p. 203." No "reveals", "exposes", "shows"; no question titles.
- **Citations:** "p. 146" for a printed page; "para 2.11.56" where the report numbers its paragraphs (UK inquiries are cited by paragraph, and the paragraph wins); "PDF p. 12" when the number is the file's. Year in brackets on first mention.
- **Figures** for numbers. **British spelling** in our own text; a report's own spelling inside its quotations.

## AI, criticism, removal

- **AI**, when it comes up, in these words, once, then stop: "No language model wrote, summarised or rewrote the report text. AI coding agents built much of the software and the site, under Rufus Pollock's direction, and the code is public. The introductions are ours: drafted with AI help, checked by the editor, and labelled."
- **A hostile reply:** answer once, under 40 words, with the fix, the log entry or the source. Never argue a finding.
- **A removal request from someone a report is about:** do it, reply "Done", log it (date and item, no names), ask no reason.

## Registers

| Where | Who speaks | Register |
| --- | --- | --- |
| Org Bluesky `@reportsthatmatter.org` | The record | The card carries the sentence; the text gives the context and a hook, then source, page, link. No "I". |
| Rufus's own accounts | Rufus, "I" | Why he made it, in one or two sentences, then the documents. The access argument lives here. |
| Hacker News, Reddit | Rufus, in his own words | Agents supply facts only; both sites ban or punish generated text. |
| Emails and pitches | Rufus | Three to five sentences, one passage matched to the reader, one link, one question or none. |
| Blog | Rufus, "I" | The same stance at length: the work, the numbers, what failed. |
| Site chrome | The project | Labels, not slogans. "Official PDF, p. 146 ↗", not "Explore the source". |
| A new report | The project | "[Report] ([year]) is on the site: [N] pages, every paragraph with its own link. [link]" |

## Five lines that sound like us

1. *(Rufus, the argument)* "Public inquiries are the most careful fact-finding a country does, and then they come out as PDFs nobody can link into. I've been rebuilding them so you can link to the sentence."
2. *(Org account, a passage)* "Columbia Accident Investigation Board (2003), p. 203. Seven crew died. 'Twice in NASA history, the agency embarked on a slippery slope that resulted in catastrophe.'"
3. *(Honesty)* "Where our text and the official PDF differ, the PDF is right. Tell us and we'll fix ours, and list the fix."
4. *(Dry, with the number)* "The Leveson PDF reports its chapter titles as 'ChapTer 1' and 'parT a'. 983,000 words, 74 headings. We've got it to 87. The rest is a job of its own."
5. *(A new report)* "The Senate's financial-crisis report (2011) is on the site: every paragraph with its own link, the official PDF one click away."
