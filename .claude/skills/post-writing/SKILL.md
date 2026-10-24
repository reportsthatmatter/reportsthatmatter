---
name: post-writing
description: Use when writing or revising the text of a Bluesky post (or an X or Threads post) for a Reports that Matter excerpt — the `hook` field of an item in marketing/queue.yaml, a launch or report-day post, or any post whose image card already carries the quote. Covers the hook formula, the accuracy check on every claim, the 300-grapheme limit, the voice, and what never to write.
---

# Writing the post text

**Level:** judgement (Opus; Sonnet for a batch once a week's hooks are drafted). Voice: [`docs/brand-voice.md`](../../../docs/brand-voice.md). Affected-community rules (marketing repo `strategy/2026-10-strategy.md` §8) override everything here. Queue mechanics: [`docs/posts-queue.md`](../../../docs/posts-queue.md). Evidence: marketing repo `research/post-hooks.md` (what hooks people) and `research/2026-10-24-post-writing-test.md` (30 variants, a four-reader panel, what won).

**Why this exists.** The first live post (Challenger p. 146, 24 Oct 2026) repeated the quote that was already on the card image. Rufus: "ok but not at all compelling." The card shows the quote. The text does what the card cannot: tells a stranger what this document is, why it existed, and why this sentence is worth reading.

## What a post is

```
[hook: 2–3 sentences, ending where the card begins]

— [Report common name], p. [n]

[registry context_line, for Post Office, Grenfell, Hillsborough: added by pnpm posts]
```

You write only the hook, in the queue item's `hook:` field. `pnpm posts` adds the source line (and the context line), checks the total against 300 graphemes and puts the result in `text`, which is what posts. The link card under the post carries the quote card image and the report's name.

## The formula

**Event, with one concrete odd detail. Who investigated, in a few words. A turn that names what the card answers.**

> In mid-2014 the Internet Research Agency, based in St Petersburg, sent employees to the US with instructions to obtain photos of vacant houses and broken windows. The Mueller report describes what the agency did next.

> In December 1953, as studies linked smoking to lung cancer, tobacco executives met at New York's Plaza Hotel. On 4 January 1954 their advert ran in 448 newspapers. A federal judge reprinted it in full in 2006.

> Deutsche Bank's top CDO trader, Greg Lippmann, bet against the US mortgage market and made the bank about $1.5 billion. Its own mortgage investments lost about $4.5 billion. A Senate subcommittee later read his emails.

What won in the test, and what lost:

- **Won:** a strange, specific fact from the card's own page or the next paragraph (vacant houses, 448 newspapers, $1.5bn made against $4.5bn lost); the mechanism that makes an odd card make sense (the 2000 Justice Department opinion that a sitting President cannot be indicted, for "does not exonerate him"); "their own emails", "his own memo": people like reading what insiders wrote.
- **Lost:** timelines and biographies ("appointed in May 2017", "FBI Director 2001 to 2013", "in four volumes", "10 hearings with 60 witnesses"); jargon with no gloss (CDO squared, prosecutorial judgment, racketeering act); a hook that hands over the card's key phrase first ("Saturday Night Massacre" before the card says it).

Vary the shape across the week: lead with a year, a person, a number or a place, and don't close two posts in ten days the same way ("A Senate subcommittee read the emails" twice is once too many).

## Rules

**The card is the payoff. Never repeat it.** No restating or close paraphrase of the quote, and never its key phrase. Naming its subject in plain words ("the schedule NASA was aiming for") is fine.

**The card must answer the hook.** Read the card straight after the hook. If the hook promises something the card does not deliver (who pushed for the schedule, why the system failed), cut the promise.

**Every factual claim is checked.** Each name, date, number, role and causal claim is confirmed in the report's text (`assets/generated/reports/<id>/full-body.html` after `pnpm prerender`: the paragraph, its neighbours, the front matter, the footnote, quoted verbatim in your notes) or, only when the report has nothing, in a reliable source (the official body's site, the report's introduction on our landing page, a major reference work for a basic date). Note the source of each claim in the PR. Cannot confirm it: cut it. Nothing the report does not support: no motive, no consequence, no "this led to" unless the report says it.

**Check the critics too.** In the test, reviewers confidently called three correct facts wrong ("vacant houses", "9 additional CDOs", a page date). Settle every dispute in the text, not by vote. Where the report contradicts itself (Leveson dates Mellor's "last chance saloon" to 1989 in one chapter and July 1992 in another), leave the claim out.

**Get the document right.** Say which body wrote it: the House Science and Technology Committee's Challenger report is not the Rogers Commission; Leveson is a judge-led public inquiry; US v. Philip Morris is Judge Gladys Kessler's 2006 opinion quoting the companies' own documents. When the quote is someone the report quotes (a trader, an analyst, a memo, an advert), make that unmistakable so nobody reads it as the report's or the court's view. Use the report's own verbs: "records", "says", "wrote", "quotes"; never "reveals" or "exposes".

**Setup, not verdict.** Context (what, who, when, why the inquiry existed) is ours; meaning is not. No "this shows", "proof", "damning", "shocking", no adjectives about findings, no villain framing the report doesn't make, no "you won't believe", no question hooks. An analysts' finding the report cites is attributed ("analysts later found"), not stated as fact.

**Deaths are facts, not hooks.** For an `affected_community` report with no registry context line (Challenger, Columbia, 9/11, Deepwater), the hook says plainly what happened and how many died, once ("killing its 7 crew"). Never a victim's name, never a bereaved family or survivor, never an anniversary of a death as the hook. A publication anniversary is allowed ("Forty years ago today a House committee reported"); put the date in the PR notes and keep the item on that date.

**No partisan pairing.** Mueller, Jack Smith, January 6th, Chilcot: describe the document in its own terms ("the President", as the report says). No current politician, election or campaign framing, even in the week of a vote.

**Length.** The whole post is at most 300 graphemes; long common names (Challenger's is 52 characters) leave about 230 for the hook. Aim for 150–230. `pnpm posts --check` fails an item over the limit.

**Form.** One post, never a thread. No emoji, no exclamation marks, no hashtags in the hook. British spelling in our words, the report's spelling for its names. Figures for numbers. End on a full stop; a closing colon at most once a week.

## Procedure

1. Read the card quote, its paragraph and neighbours in `full-body.html`, the footnotes for any quoted document, and the report's `editorial/<id>.yaml`.
2. Write two or three hooks with different openings.
3. Check every claim and note its source; settle any doubt in the text.
4. Read each hook, then the card. Keep the one a stranger would stop for and a journalist could not fault.
5. Set `hook:` on the item in `marketing/queue.yaml` (never edit `text` by hand; quote the value if it contains ": "), run `pnpm posts`, then `pnpm posts --check` and `pnpm posts --verify`, and read the composed `text`.
6. Read the week's hooks together for repeated openings and closings.
7. PR with the checks. The poster reads `queue.yaml` from main: merge before 13:40 UTC on the item's day.

## Exit gate

- [ ] The hook does not repeat the card quote or its key phrase, and the card answers the hook.
- [ ] Every claim has a source noted in the PR, quoted from the report where it can be.
- [ ] `pnpm posts --check` and `pnpm posts --verify` pass.
- [ ] Nothing breaks the brand voice doc or strategy §8; no two posts in ten days open or close the same way.
