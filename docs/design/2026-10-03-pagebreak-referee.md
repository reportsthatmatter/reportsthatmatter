# Page-break referee: an optional LLM for the joins the rules are unsure of

**Bead:** reportsthatmatter-38s.11 (epic 38s). **Date:** 2026-10-03. **Builds on:** [`2026-10-02-learning-from-aligned-pairs.md`](2026-10-02-learning-from-aligned-pairs.md) §5 and §7 (the 38s.8 pilot), `layoutPageJoins` (38s.10), the adjudicated page breaks (38s.12, [`../scoring.md`](../scoring.md)). **Code:** @rtm/ingest `src/referee.ts` and `src/pagebreaks.ts` (ingest PR `referee-pagebreaks`), `scripts/ingest/referee.ts` here.

## 1. The answer

- **Built, opt-in per report, offline at build time.** A report that wants it declares `layoutPageJoins({ referee: pageBreakCache(new URL("./referee/pagebreaks.json", import.meta.url)), refer: "medium" })`. The build reads the committed answers and never calls out; a page break with no answer keeps the rules' call, so a missing or stale cache builds exactly as today. `pnpm ingest check` is unchanged for all 13 reports with the new ingest.
- **The live measurement is pending: no API key was available.** Everything was built and tested with fakes (a recorded fake through the real CLI path, plus an oracle and an inverting fake for the ceiling and the floor). The commands for the live run are in §6.
- **What a referee can add is small, and it depends on which calls it is asked about.** On the 284 adjudicated page breaks that the evaluation can read (80 development, 204 held-out), the rules are wrong on 4 development and 22 held-out breaks. None of those 26 sits on a call the rules mark ambiguous today, so a perfect referee asked only about those (`refer: "low"`) changes nothing. Asked also about the new medium-confidence calls (`refer: "medium"`), a perfect referee fixes 3 of the 4 development errors (95.0% to 98.8% right) and 1 of the 22 held-out (89.2% to 89.7%). The other 21 held-out errors are upstream of the join decision: a footnote, figure caption, heading or running head sits between the paragraph and its continuation (14), the pair never reaches the layout pass (6), or a bullet was joined by the text rules (1).
- **Cost is negligible.** At `refer: "medium"`, the development reports refer 143 page breaks and the held-out 89; all seven PDF-only reports together 232. Estimated at list price with no prompt caching: about $0.09 (dev) and $0.06 (held-out) with Claude Haiku 4.5, twice that with Claude Sonnet 5.5 before its thinking tokens: well under a dollar for the whole corpus, about $0.0006 a decision with Haiku.
- **The risk is real and measured.** A referee that always answered against the rules would cost 7 held-out breaks at `refer: "medium"` (20 to 27 wrong of 200). `pnpm ingest referee eval` exits 1 when the held-out set loses any break, so no report should take a cache until that gate passes on live answers.

## 2. Design

**Which calls are referred: a confidence from the existing rules.** `decidePageBreak` now gives each decision a `confidence` (the decisions themselves did not change):

| confidence | calls | referred |
|---|---|---|
| `low` (= the old `ambiguous`) | an indent within a quarter em of the 0.6 em flush threshold; every R2 join (a full stop at the end of a full justified line); a line under the first line that is not the block's own; an unfinished last line that stops 5 em or more short of the margin; no line under the first line to compare with | always, when a referee is declared |
| `medium` | a finished sentence, then a first line flush with the line under it in the same face on a page R2 does not cover (a new paragraph in a document that sets them flush, or the paragraph running on: Saville p.162, p.487; Chilcot p.112); a label only the layout sees (a bare number and a space, "24 hours”,2 and…", Saville p.302) after an unfinished sentence | with `refer: "medium"` |
| `high` | a label in the text ("7.44", "(b)", "•"); a change of face (a footnote or caption against body text: the fix is upstream, and a referee joining them would glue a note to a paragraph); an indented first line; R1 with a clean line under; a lower-case opening | never |

`medium` was added after the first measurement showed that the `low` calls hold none of the adjudicated errors (§4).

**What the referee sees.** Our two blocks either side of the break (the paragraph's last 320 characters, the next block's first 320), then the layout's printed lines: the old page's last three with each line's indent and right-margin gap in ems and whether the page is justified, and the new page's first line and the line under it, with the first-line indent against it. Not `pdftotext -layout`: the pilot's two-column pages interleaved. The system prompt names the pilot's one bias (it said JOIN for a new bullet, numbered paragraph, contents entry or heading). Eight worked examples are real page breaks from the ingest test fixtures (Philip Morris, 9/11, Saville, Lehman, Deepwater, Challenger: development and PDF-only reports, never held-out), with their keys recorded so an evaluation can leave them out (`--exclude-examples`). Optionally (`--images`) the two page edges are cropped from the PDF at the layout's own scale (`pdftoppm -r 108`) and sent as images; checked by eye on Philip Morris (`--save-images <dir>`).

**How it is asked.** 20 cases a request, the instructions and examples in the system prompt (marked for caching; at about 3,000 tokens they are under Haiku 4.5's minimum cacheable prefix, so the estimates assume no caching), structured JSON output (`output_config.format`, `{answers: [{id, answer: JOIN|SPLIT}]}`). Default model `claude-haiku-4-5` (cheapest, no thinking); `--model claude-sonnet-5-5` runs at effort `low`. The ingest library has no SDK and no network code: the host supplies a transport (`scripts/ingest/referee.ts` uses `@anthropic-ai/sdk`, a dev dependency of this repo).

**The cache.** `<report repo>/referee/pagebreaks.json`: `{about, version: 1, entries: {<key>: {join, by, prompt, page, prev, next, rules, rule}}}`, keys sorted so a diff reads as the answers that changed. The key is `pageBreakKey`, a hash of the two printed lines (the content, not the page number, so it survives repagination). The build reads `join` only; the rest is for the reviewer: which model (or `human`, for a hand correction), which prompt (`REFEREE_PROMPT_ID`, a hash of the instructions and examples; `--refresh` re-asks answers from an older prompt), the page, the two lines, and what the rules said. **Not under `reference/`** (the task suggested `reference/referee/`): `reference/` holds the answer keys the scorer measures against, and the referee's answers are pipeline input; keeping them apart keeps the answer key independent of what it scores.

**Filling it.** `pnpm ingest referee <id>` runs the report's pipeline with its cache, takes the cases the referee was asked, sends the unanswered ones, writes the file, and repeats until a run asks nothing new (a join can expose another break; up to three rounds). It prints how many answers overrule the rules and how many cached answers are no longer asked. `--dry-run` prints the calls and an estimate; `--record <file>` and `--replay <file>` record responses against the exact request (a changed prompt, model or batch has no recording and throws: re-record); `--fake split|join` answers everything one way, for testing with no key.

## 3. Verification without a key

- @rtm/ingest: 14 new tests (`tests/referee.test.ts`): a missing cache is empty and the rules stand; an entry overrules the rules and round-trips; a high-confidence call is never asked so a cache cannot move it; `refer: "medium"` refers Deepwater p.20 and `"low"` does not; the cache carried through `layoutPageJoins` and `resolvePasses` and through `mergeAcrossPages`; the prompt's content and batching; answer parsing; a fake transport's usage and cost; record then replay with no live call, and a changed request throwing. 711 tests pass; `pnpm ingest check` unchanged for 13/13 reports.
- End to end on a scratch worktree of the Philip Morris repo (not committed): with the referee declared and no cache, `pnpm ingest check` passes against the committed baseline; `pnpm ingest referee us-v-philip-morris --fake split --record` asks 110 breaks in 6 calls and writes the cache (73 overrule the rules: the fake splits every R2 join); replaying the recording writes a byte-identical cache; `pnpm ingest run` with it moves the report by +73 paragraphs, identically on two runs and with `ANTHROPIC_API_KEY` unset. The 73 are Philip Morris's citation strings run on after a full stop, which R2 joins correctly: a reminder that the referee's errors cost real paragraphs.

## 4. Measurement (fakes)

`pnpm ingest referee eval` runs each report twice, rules alone and with the answers, and reads which side of each adjudicated break the two printed lines ended up on from the pipeline's own blocks (the PDF shadow for 9/11 and Saville, which are served from their clean editions). Labels: each report repo's `reference/adjudicated.yaml` (30 a report) and, for the held-out reports, the 38s.8 pilot's adjudicated rows (truth J or S). A break counts when both runs can read it; Duelfer's interleaved columns leave several unreadable, which is why this count of its errors (1) differs from `pnpm score`'s (5). "Wrong" is against the adjudicated truth.

| answers | refer | dev breaks referred | dev wrong (of 80) | held-out breaks referred | held-out wrong |
|---|---|---:|---:|---:|---:|
| none (rules) | – | – | 4 (95.0% right) | – | 22 of 204 (89.2%) |
| oracle (the adjudicated truth where known) | low | 89 | 4 | 12 | 22 of 204 |
| invert (always against the rules) | low | 89 | 6 | 12 | 23 of 204 |
| oracle | medium | 143 | 1 (98.8%) | 89 | 21 of 204 (89.7%) |
| invert | medium | 143 | 3 | 89 | 27 of 200 (86.5%) |
| fake: split everything | medium | 143 | 6 | 89 | 23 of 204 |

At `refer: "low"`, 3 adjudicated breaks are referred (2 Philip Morris, 1 Columbia) and the rules are right on all three. At `"medium"`, 5 development (rules right on 2) and 9 held-out (rules right on 8).

By rules' call, over every page-break pair the layout pass sees (counted with every call referred, development / held-out; "adjudicated" is how many of each are adjudicated breaks matched on both lines, "wrong" how many of those the rules get wrong):

| rules' call | confidence | pairs | adjudicated | wrong |
|---|---|---:|---:|---:|
| R1: unfinished, next line flush | high | 200 / 30 | 22 / 9 | 0 / 0 |
| split: label in the text | high | 140 / 311 | 9 / 42 | 0 / 0 |
| split: finished, next line indented | high | 107 / 10 | 2 / 2 | 0 / 0 |
| split: font changes across the break | high | 77 / 313 | 0 / 25 | 0 / 6 |
| R2: finished, full justified line, flush next | low | 73 / 1 | 2 / 1 | 0 / 0 |
| split: finished, next line flush | medium | 49 / 74 | 2 / 9 | 2 / 1 |
| split: label only the layout sees | medium | 6 / 3 | 1 / 0 | 1 / 0 |
| other low calls (near the threshold, short last line, no line under) | low | 19 / 11 | 0 / 0 | 0 / 0 |

The six held-out font-change errors are a footnote (Hillsborough) or a figure caption (Columbia) between the two halves of a paragraph: the pair the layout pass sees is note-then-continuation, so the right answer for our blocks is still "split", and the fix is to take the note out of the way. The 22 held-out errors under the rules, read one by one: Hillsborough 12 (7 a footnote between the halves, 4 a heading, running head or pull quote between, 1 a bullet joined onto the paragraph above), Columbia 7 (3 a figure caption between, 4 never reach the layout pass), Chilcot 2 (1 a medium call, 1 never reaches it), Duelfer 1 (never reaches it). Upstream fixes (note separation, looking past captions and headings, column order: 7go, a8l, wck) are worth far more on the held-out set than any referee.

PDF-only reports, breaks referred at low / medium: Leveson 46 / 86, Deepwater 9 / 94, Lehman 13 / 19, Litvinenko 5 / 10, PSI 3 / 10, Jack Smith 7 / 9, Challenger 2 / 4.

## 5. Recommendation

1. Run the live measurement (§6) on the development set with Haiku 4.5 and Sonnet 5.5, `refer: "medium"`, read every overruled answer, and tune the prompt there only. Then run the held-out set once per model. Adopt the cheaper model unless the bigger one gains on development and does not lose on held-out.
2. Opt a report in only when `eval` passes on held-out (no adjudicated break lost) and its overruled answers have been read against the page. First candidates: Saville and Chilcot, where the medium calls hold the remaining run-on errors, and the PDF-only reports with no reference (Deepwater, Leveson), where the referee's answers should be spot-checked against the page image and recorded as adjudications (38s.15).
3. Put the held-out gains where they are: the caption and footnote run-overs between the halves of a paragraph.

## 6. Running it live

```bash
# development set, Haiku then Sonnet; the recording makes the run replayable with no key
pnpm ingest referee eval --dev --answers live --refer medium --model claude-haiku-4-5 --record docs/design/learning/results/referee-live-haiku.json --verbose
pnpm ingest referee eval --dev --answers live --refer medium --model claude-sonnet-5-5 --record docs/design/learning/results/referee-live-sonnet.json --verbose
# once the prompt is settled on dev: held-out, once each
pnpm ingest referee eval --holdout --answers live --refer medium --model claude-haiku-4-5 --record docs/design/learning/results/referee-live-haiku-holdout.json
# then, per report that passes: fill and commit its cache in the report repo, on a branch
pnpm ingest referee <id> --refer medium --dry-run
pnpm ingest referee <id> --refer medium
```

The eval prints calls, tokens and the cost at list price; add `--images` to compare with page crops.
