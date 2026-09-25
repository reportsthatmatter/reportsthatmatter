# Writing a report's introduction

How to write the introduction that turns a report's contents page into its landing page: the standfirst, the background, what it found, and where to start reading. Read this before writing or revising any `editorial/<report-id>.yaml`. For getting the report itself onto the site, see [`report-preparation.md`](report-preparation.md); for the code, [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Status: first version, 2026-09-25**, written from the Jack Smith and Wall Street introductions and Rufus's review of them. When writing one teaches you something this file got wrong or left out, fix it in the same change.

## What it is for

Most readers arrive cold, often from a shared link, and a 500-page inquiry is overwhelming. The landing page answers three questions before they meet the text: what is this, and why should I care; what did it find; where do I start. It is a way into the report, never a substitute for it. Every claim points at the report's own paragraphs, and every quotation opens in context.

A landing page has exactly two parts of ours (Rufus, 2026-09-25):

1. **The summary**: the standfirst, the background, and what it found, with a few key quotations.
2. **What to read if you only have a short time**: the reading guide.

Then the report's own contents. Nothing else. There is no highlights, passages or "most marked" section on a landing page. Rufus's highlights go into the site's highlighting system instead (see below), where they show as marked passages in the text.

A report without an approved file keeps the plain contents page.

## The file

`editorial/<report-id>.yaml`, one per report. [`editorial/jack-smith-vol1.yaml`](../editorial/jack-smith-vol1.yaml) is the reference example; copy its shape.

| Field | What goes in it | Length |
| --- | --- | --- |
| `status` | `draft` until Rufus approves; then `approved` | |
| `why_it_matters` | The standfirst under the title. Also the page's meta description, so it is what search results show | 2–4 sentences, 50–80 words |
| `background` | What happened, who commissioned the report and why, when it was published, and what followed. Paragraphs separated by a blank line | 2–4 paragraphs, 200–300 words |
| `findings` | What the report found. Each has `text` (ours), `cites` (paragraph ids), and optionally an `excerpt` (a quotation) | 5–8 findings; 3–4 with excerpts |
| `reading_guide` | The sections to read first. Each has `section` (slug), optional `title`, `why`, and optional `excerpt` | 4–6 sections |
| `highlights` | Passages for Rufus's highlights, seeded into the marks table. Never printed on the landing page | 8–15 |

An `excerpt` is `{ paragraph, quote }`. A highlight is the same, plus optional `context` and `card`.

## Voice

Our words are shown in the site's sans-serif and the report's in its serif. A note in the header tells the reader that only words in quotation marks are the report's. Write so that promise holds.

- **Plain and neutral.** No adjectives of judgment ("shocking", "damning", "explosive"). The material is strong enough; every editorial word spends the reader's trust.
- **Attribute conclusions to the report.** Write "The report finds he knew he had lost", not "He knew he had lost". Where it is the report's own finding, say whose: the Special Counsel, the Panel, the Chairman.
- **Record the other side where the report does.** If the report prints a response, a dissent or an objection (Trump's lawyers' letter at the end of Jack Smith), the background says so.
- **Say what the report is and is not.** A prosecutor's report was never tested at trial; a public inquiry's findings are not a court's verdict; a Senate staff report is not a law. One clause is usually enough.
- **Absolute dates, and the year early.** A reader needs to place it at once: 1986 or 2025. The header already carries the year; the background should date the events.
- **British spelling** in our text (organised, programme), matching the site. Quotations keep the report's own spelling.
- **No hard wrapping** in the YAML's prose beyond what YAML needs; folded scalars (`>-`, `|`) are fine.

## Writing each part

### `why_it_matters`

One short paragraph that would make a stranger want to read the report. Say what it is (who wrote it, about what), what makes it matter now, and what the reader will find in it. Do not summarise the findings here; that is the next part's job.

### `background`

What a reader needs in order to follow the report and understand its significance:

1. **The event**: what happened, when, and to whom.
2. **The report**: who commissioned it, who wrote it, how (hearings, documents, evidence), and when it was published.
3. **What followed**: prosecutions, resignations, changes in law, what became of its recommendations, and why it is still read. This is the historical significance Rufus asked for; don't skip it.

**Facts must be checkable.** Take what you can from the report itself (its own dates, terms of reference, appointment). Verify anything else against reliable sources before writing it (for example, "Levin referred the report to the Justice Department and the SEC; no criminal charges followed"). Never write a fact from memory alone. If you cannot verify something, leave it out.

### `findings`

Five to eight things the report found, in the report's order of importance, not ours. Each finding:

- is one or two sentences in our words, attributed where it is a conclusion;
- `cites` one to three paragraph ids where the report says it, preferring its summary or conclusions paragraph over a passing mention;
- in three or four cases, carries an `excerpt` quoting the report's key line.

**Quotations must stand on their own.** A reader sees the quotation with no surrounding text. If it needs its paragraph to make sense, quote more of the paragraph. Rufus's example of a quote that failed: `Mr. Trump stated in part, "[I]t's too late for us..."` only made sense once the sentence before it ("Mr. Trump made comments implicitly acknowledging that he knew he had lost the election") was included. Prefer whole sentences. A quotation that starts mid-sentence is shown with a leading ellipsis automatically.

### `reading_guide`

"If you only have a short time": four to six sections that carry the report's argument, in reading order. Typically the report's own summary or conclusions, then the sections where its most important evidence is set out. Each item:

- `section` is the slug from `meta.json` (`pnpm paragraphs <id>` prints them);
- `title` overrides the report's heading only when that heading is unusable (an extraction artefact, a shouted all-caps caption, a quoted memo line). Otherwise leave it out and the report's own heading is used. File a Bead for a broken heading (e.g. `reportsthatmatter-h0l`);
- `why` is one line on what the reader gets from it;
- `excerpt`, optional, is a short quotation from **within that section** (the check enforces this) that shows its flavour.

### `highlights`

Rufus's highlights: 8–15 short, striking passages, the kind a reader would mark or share. They are not shown on the landing page. `pnpm seed-highlights --remote` writes them into the site's marks table, so they appear highlighted in the text as any reader's marks do. They are anonymous today, shown as "1 reader"; named highlights are `reportsthatmatter-38k`.

A highlight must be inside a paragraph with an id. Block quotations have no id yet (`reportsthatmatter-dam`), so the check rejects them as highlights. Mark `card: true` on the ones worth a share card.

## Quotations: the rules

- **Verbatim, as rendered.** Copy from `pnpm paragraphs`, not from the PDF. Keep the report's OCR slips, straight quotes, hyphens-for-dashes and `[sic]`s. `pnpm editorial` forgives only whitespace and soft hyphens, and fails the build on anything else. That is deliberate: a misquote is the one error this project cannot ship. (The January launch drafts carried four quotes that were not in the Jack Smith report; see `reportsthatmatter-7z2`.)
- **If the text is garbled, pick another passage.** Fix the OCR in the pipeline (a Bead), never in the quote.
- **Mind where the link lands.** A reader who follows a quotation sees its whole paragraph. Avoid paragraphs with leaked footnote text (`reportsthatmatter-g1f`) or merged captions when an equally good one exists.
- **Block quotations** (testimony, emails quoted at length) have no id. Name the paragraph that introduces them; the check looks in the block quotations that follow it, and the link opens at that paragraph.
- **YAML**: a value containing `: ` must be quoted or folded (`>-`). A quote that begins with `"` needs single quotes around it.

## Workflow

1. **Set up** a sibling worktree as in [`report-preparation.md`](report-preparation.md) §2, then `pnpm prerender`.
2. **Read the report's own summary and conclusions first**, then the sections they point to. `pnpm paragraphs <id>` prints the whole report by section; `pnpm paragraphs <id> <words…>` searches it.
3. **Research the background** and verify every fact that is not in the report.
4. **Write `editorial/<id>.yaml`** with `status: draft`.
5. **Check**: run `pnpm editorial` until it passes, then `./scripts/verify.sh`.
6. **Review in the browser**: run `pnpm dev` and open `/reports/<id>?draft`. Read it as a stranger would. Does the standfirst make you want to read on? Does every quotation make sense alone? Does every link land somewhere readable?
7. **Ship the draft**: PR, merge, deploy. Rufus reviews at `https://reportsthatmatter.org/reports/<id>?draft`. Drafts are hidden without `?draft` and are `noindex`.
8. **Approve**: set `status: approved`, then PR, merge and deploy. After deploying, run `pnpm seed-highlights --remote`.
9. **Record it**: add a `docs/CHANGELOG.md` entry and screenshots per AGENTS.md, and close the Bead.

## Checklist

- [ ] `why_it_matters` says what the report is and why it matters, in 50–80 words, with no judgment adjectives
- [ ] `background` covers the event, the report, and what followed, with every fact verified
- [ ] 5–8 findings, each attributed and cited; 3–4 with a quotation that stands on its own
- [ ] 4–6 reading-guide sections in reading order, each with a `why`; `title` only where the heading is broken
- [ ] 8–15 highlights, all inside paragraphs, the best marked `card: true`
- [ ] `pnpm editorial` and `./scripts/verify.sh` pass
- [ ] Reviewed at `?draft` as a cold reader
- [ ] Beads filed for anything broken in the report text that you found on the way
