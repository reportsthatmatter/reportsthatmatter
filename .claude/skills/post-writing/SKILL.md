---
name: post-writing
description: Use when writing or revising the text of a Bluesky post (or an X or Threads post) for a Reports that Matter excerpt — the `hook` field of an item in marketing/queue.yaml, a launch or report-day post, or any post whose image card already carries the quote. Covers the hook formulas, the accuracy check on every claim, the 300-grapheme limit, the voice, and what never to write.
---

# Writing the post text

**Level:** judgement (Opus; Sonnet for a batch once the formulas are settled). Voice: the brand voice doc, docs/brand-voice.md (site PR #361). Affected-community rules (marketing repo `strategy/2026-10-strategy.md` §8) override everything here. Queue mechanics: [`docs/posts-queue.md`](../../../docs/posts-queue.md). Research and the test that shaped this skill: marketing repo `research/post-hooks.md` and `research/2026-10-24-post-writing-test.md`.

**Why this exists.** The first live post (Challenger p. 146, 24 Oct 2026) repeated the quote that was already on the card image. Rufus: "ok but not at all compelling." The card shows the quote. The text's job is what the card cannot do: tell a stranger what this document is, why it existed, and why this sentence is worth reading.

## What a post is

```
[hook: 1–3 sentences of context, ending on the gap the card fills]

— [Report common name], p. [n]
[registry context_line, for Post Office, Grenfell, Hillsborough: added by pnpm posts]
```

You write only the hook, in the queue item's `hook:` field. `pnpm posts` adds the source line (and the context line), checks the total against 300 graphemes and puts the result in `text`, which is what posts. The link card under the post carries the quote card image and the report's title.

## Two hook formulas

**1. Scene, stakes, turn.** For a finding or conclusion.
> In [year], [what happened, in plain facts and one number]. [Who investigated, in a few words: a committee, a judge, a commission]. [The turn: what they were asked, or what they concluded about it, pointing at the card.]

> "In 1986 the space shuttle Challenger broke apart 73 seconds after launch. Nobel physicist Richard Feynman, on the presidential commission, showed why. Months later a House committee went through his analysis and gave its own verdict on NASA."

**2. Who wrote it, when, to whom.** For a quote the report itself quotes: an email, a memo, testimony.
> [Who, by role] [wrote / said] this [when], [the circumstance that makes it matter]. [How it became public: the investigation that found it.]

> "In 2006 a Goldman Sachs trader was asked to buy a mortgage security nobody wanted. His reply turned up four years later in a Senate investigation's files."

Vary the opening across the week (a year, a person, a number, a place) so the feed does not read as a template.

## Rules

**The card is the payoff. Never repeat it.** Do not restate the quote or paraphrase it closely; a short phrase of two or three words from it is the most you may echo, and only to name the subject.

**Every factual claim is checked.** Each name, date, number, role and causal claim in the hook is confirmed in the report's own text (the paragraph, its neighbours, the front matter) or in a reliable source (the official body's site, the report's own introduction on our landing page, a major reference work). Record the check next to the draft (`p. 3`, `full-body: "24 flights per year"`, a URL). If you cannot confirm it, cut it. Nothing the report does not support: no motive, no consequence, no "this led to" unless the report says so.

**Get the document right.** Say which body wrote it (the House Science Committee report is not the Rogers Commission; Leveson is a judge-led inquiry, not a parliamentary one). If the quote is the report quoting someone, say so.

**Setup, not verdict.** Context (what, who, when, why the inquiry existed) is ours to give; meaning is not. No "this shows", "proof", "damning", "shocking", no adjectives about findings, no "you won't believe". The gap must be specific ("what the committee concluded about NASA's schedule"), never vague ("this one detail").

**Deaths are facts, not hooks.** State them plainly when they are why the inquiry exists ("Seven astronauts died"). Never lead with an anniversary of a death, never a victim's name, never a bereaved family or survivor tagged.

**No partisan pairing.** Mueller, Jack Smith, January 6th, Chilcot: describe the document and its findings in its own terms. No current politician, election or campaign framing, even near a vote.

**Length.** The whole post is at most 300 graphemes; aim for a hook of 120–220 characters. Count with `pnpm posts --check`, which fails an item over the limit.

**Form.** One post, never a thread. No emoji, no exclamation marks, no hashtags in the hook (a per-report hashtag is a later decision). British spelling in our words. Figures for numbers. End on a full stop, a colon or a single ellipsis, not a question.

## Procedure

1. Read the item's paragraph and its neighbours in `assets/generated/reports/<id>/full-body.html` (after `pnpm prerender`), the report's `editorial/<id>.yaml`, and the card quote.
2. Write two or three hooks, using different formulas or openings.
3. Check every claim (above) and note the source of each.
4. Pick one: the one a stranger scrolling past would stop for, that a journalist could not fault.
5. Set `hook:` on the item in `marketing/queue.yaml` (leave `text` alone), run `pnpm posts` then `pnpm posts --check`, and read the composed `text`.
6. Commit with the checks in the PR description.

## Exit gate

- [ ] The hook does not repeat the card quote.
- [ ] Every claim in it has a source noted in the PR.
- [ ] `pnpm posts --check` passes (length included).
- [ ] Nothing in it breaks the brand voice doc or strategy §8.
