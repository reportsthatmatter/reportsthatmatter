# Reader layer and launch: the next stretch

Written 2026-09-25. Ties together the three directions Rufus raised: summaries and excerpts, a fuller highlights page, and a real marketing campaign. Also covers tidying, which runs in the background.

## Where we are

- 11 reports are live with paragraph permalinks, quote-preview links, share cards, og:images, plates, search and changelog. The reading product is well ahead of the distribution work.
- Distribution has been marked "**next**" in `ROADMAP.md` since January. Nothing has been posted. No account exists that we know of, Search Console has not been set up, and `docs/NOW.md` still lists the January launch checklist, all unticked.
- Curated passages: 5, all from Jack Smith (`docs/share-quotes.yaml`). Nothing else feeds cards or posts.
- `/highlights` shows only the reader's own browser-stored highlights, so a first-time visitor sees an empty page.
- A report page opens straight into the report's own contents. Nothing says, in our words, why the report matters. That is `reportsthatmatter-ix4`, which is still an undecided idea.

## The diagnosis: what blocks marketing

1. **Nothing to post.** A campaign that runs "in a fairly automated way" needs a queue of 50 to 150 good, verified, deep-linked excerpts across several reports. We have 5. **The excerpt layer is the campaign's engine, so it comes first.** This is the real blocker and it is ours to fix.
2. **No accounts or credentials.** Only Rufus can create `@ReportsThatMatter` on X and Bluesky, verify Search Console, and hand over posting tokens. This takes about 30 minutes of his time and is the only step that needs him.
3. **No launch date.** "Next" with no date has meant never. Proposed date: **Tuesday 13 October 2026**. That is three weeks before the US midterms on 3 November (Jack Smith is topical) and six weeks before the 20th anniversary of Litvinenko's death on 23 November.

## Decisions (made here so work can start; reverse any of them)

**Editorial layer (settles ix4)**

- One file per report, `editorial/<report-id>.yaml`, in the site repo next to `share-quotes.yaml`. It holds four things:
  - `why_it_matters`: 2 to 3 sentences.
  - `findings`: 5 to 8 one-line findings, each citing one or more paragraph ids.
  - `excerpts`: 10 to 20 per report. Each has a verbatim quote, a paragraph id, a `match` phrase, and a one-line neutral context. `card: true` marks the ones that get a share card.
  - `status`: `draft` or `approved`.
- **Our words are labelled as ours.** A visible "Our note" or "Selected by Reports that Matter" marker, set in the mono kicker style, keeps them separate from the report's own text. The context lines carry no adjectives. Every finding links into the text, so the summary is a door into the report and doesn't replace it.
- **The review bar:** an LLM drafts, and a script checks that every quote is verbatim in the rendered report and that every id resolves. `verify.sh` fails otherwise. Rufus approves each report's file once, from a rendered review page, before `status: approved`. Only approved entries render.
- **Surfaces:**
  - The report's contents page gets "Why it matters", then "What it found", then "Passages", with each passage linking to its paragraph.
  - `/highlights` gets an "Editor's picks" section, Rufus's picks across all reports, shown above the reader's own highlights and in place of the empty state.
  - Later, a site-wide `/excerpts` feed.
- `share-quotes.yaml` gets folded into the editorial files once they exist, so there is one source for cards, picks and posts.
- **Pilots:** Jack Smith first (topical, and the existing 5 quotes seed it), then Wall Street and the Financial Crisis. After that, Saville and Leveson, the reports that most need a way in.

**Campaign**

- **Channels:** Bluesky and X for the `@ReportsThatMatter` excerpt account, plus Rufus's personal X account for the launch thread. Bluesky goes first for automation because its API is free and simple. For X, check the current API pricing; if write access is costly, use a scheduler such as Typefully or Buffer rather than the API.
- **Unit:** one excerpt per day, following the format in `2026-08-02-launch-and-seo.md` Appendix C: the quote, a neutral one-line source, the card image, and a `?p=` deep link.
- **Pipeline:**
  1. `pnpm posts` builds `marketing/queue.yaml` from approved excerpts.
  2. A dry-run preview lets Rufus see the queue.
  3. A scheduled job (GitHub Actions cron) posts the next item and records the post URL back into the queue.
- **Calendar:** themed runs keyed to news hooks. Jack Smith runs during the midterm run-up. Litvinenko runs toward 23 November. Leveson's anniversary is 29 November. Challenger is 28 January and Bloody Sunday is 30 January. Wall Street comes in whenever banking is in the news.
- **Measurement:** add `?src=bsky` and `?src=x` to links, then read Cloudflare analytics and Search Console weekly. Pick the next ingests by what gets clicked.
- **Launch thread:** rewrite Appendix A. It announces one report, but we now have eleven.

## Tracks and order

| # | Track | Who | Depends on |
| --- | --- | --- | --- |
| A1 | Editorial data format and verbatim or id check in verify | agent | – |
| A2 | Draft Jack Smith editorial file | agent, then Rufus approves | A1 (can draft in parallel) |
| A3 | Draft Wall Street editorial file | agent, then Rufus approves | A1 (can draft in parallel) |
| A4 | Render the "Why it matters / What it found / Passages" block on report pages | agent | A1 |
| A5 | Editor's picks on `/highlights` | agent | A1 |
| A6 | Fold `share-quotes.yaml` into the editorial files | agent | A1, A2 |
| A7 | Editorial files for the other 9 reports, one bead each | agents | A1 |
| B1 | Create accounts, verify Search Console and Bing, hand over tokens | **Rufus** | – |
| B2 | Rewrite the launch thread and pinned posts for an 11-report archive | agent, then Rufus approves | – |
| B3 | `pnpm posts`: queue generation and preview | agent | A1, A2 |
| B4 | Scheduled poster (Bluesky first, then X) | agent | B1, B3 |
| B5 | Campaign calendar through January 2027 | agent | – |
| B6 | Launch on 13 October | Rufus and the poster | A2, A4, B1 to B4 |
| C | Tidying backlog (r19 Hillsborough headings, q0m page-break splits, gpy, 7vz, 3rj) | agents, in the background | – |

**Critical path:** A1, then A2 and A4, then B3 and B4, then launch. B1 runs alongside and is Rufus's only blocking task.

## Started 2026-09-25

- Drafted `editorial/jack-smith-vol1.yaml` (8 findings, 20 excerpts) and `editorial/us-psi-financial-crisis.yaml` (7 findings, 17 excerpts). Both are `status: draft`. Every quote has been checked verbatim against the rendered report, and every cited id resolves.
- Two quotes in the January launch drafts are not in the Jack Smith report: "You'll go down as a wimp" and "It doesn't take courage to break the law…". Tracked in `reportsthatmatter-7z2`. From now on, posts come only from checked editorial files.
- Block quotations have no ids, so some of the best lines can't be deep-linked (`reportsthatmatter-dam`).
- Footnote text leaks into the body paragraphs where launch traffic will land (`reportsthatmatter-g1f`). This now blocks the launch milestone.

## Beads

- Reader layer: `reportsthatmatter-g0w` (.1 to .7). It supersedes `ix4`, which is now closed.
- Launch: `reportsthatmatter-y2t` (.1 to .6). `.1` is Rufus's.
- Discovered: `dam`, `7z2`, `g1f`.
