# Reports that Matter — working notes

Reports that Matter turns hard-to-access public reports into web pages that can
be read, searched, and cited by paragraph.

## → Start here

**[Issue #77 — START HERE](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)**
is the entry point: current state, and a map of the things worth doing next
with enough context to pick one and go. Read it first. Keep it current — if you
finish something on it, edit it.

This file is the *house rules*. The issue is *what to do*.

## The done condition

```bash
./scripts/verify.sh
```

Typecheck, unit tests, ingestion fidelity, HTTP assertions against a live
worker, then browser checks (layout, measure, overflow, permalinks, the share
popover, console errors). **A change is not finished until this exits 0.**

```bash
./scripts/init.sh                                    # cold start, then verify
VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh   # against production
```

Run it against production after deploying. Some failures exist only there:
`/health` once flapped 200/404 because the asset router answered before the
Worker on some edges, which no local run reproduces.

`scripts/stop-hook.sh` is the hard gate for unattended runs — it blocks a turn
from ending while `verify.sh` fails. Opt-in via `RTM_LOOP=1`, because the full
check takes the better part of a minute and would be miserable on every turn of
an interactive session.

## Layout

| Path | What |
| --- | --- |
| `src/index.ts` | Hono routes on Cloudflare Workers |
| `src/templates/` | Page shells; `layout.ts` is the design system's HTML |
| `src/lib/markdown.ts` | Markdown → HTML, paragraph ids, sidenotes, page anchors |
| `src/lib/sections.ts` | Splitting a rendered report into section pages |
| `src/lib/prerendered.ts` | Reading pre-rendered report artifacts (ASSETS or disk) |
| `src/lib/passages.ts` | Report HTML → citable-unit plain text, for the search index |
| `src/lib/search.ts` | FTS5 query building, bm25 weights, match → quote-anchor arithmetic |
| `assets/styles.css` | The design system. Hand-written, no framework |
| `assets/share.js` | Highlight-to-share |
| `scripts/ingest/` | PDF → Markdown pipeline + fidelity checks |
| `scripts/cards.mjs` | Share cards → PNG (`pnpm cards`) |
| `scripts/prerender.mjs` | Reports → static assets (`pnpm prerender`) — see #115 below |
| `scripts/index-search.mjs` | Reports → the D1 search index (`pnpm index-search`) — see #100 below |
| `reports/registry.yaml` | What is published |
| `docs/v2-features.yaml` | What is done and what is next |

## House rules

- **Fixes go in the pipeline, not in its output.** Never hand-edit a generated
  `reports/*/full.md`; correct `scripts/ingest/` and re-run. Each fix then
  compounds across every future report. (Planned: a per-report
  `corrections.yaml` for the human judgements the pipeline cannot make, applied
  deterministically so output stays reproducible — architecture doc §3. Until
  that exists, the rule is absolute.)
- **Never weaken a fidelity check to make a report pass.** If a report cannot
  meet the gate, mark it `ingested: false` in the registry and record why. The
  checks exist to find exactly what a weakened check would hide.
- **Auto-fix only what has no other reading.** Anything merely *probably* wrong
  goes in the review queue (`reports/<id>/fidelity.md`), not into the text.
  Whether a scan was read faithfully is a human judgement; don't launder it
  into a score.
- **Look at the rendered page, not just green tests.** Most of the real defects
  in this project — footnote markers bleeding into quotes, paragraphs opening
  mid-sentence, block quotes swallowing a clause — were found by reading output,
  and every one passed the tests first.
- **Don't modify tests to make them pass** — fix the code. (Do fix tests whose
  fixtures are unrealistic; several early ones were.)
- **Paragraph ids are the product.** They derive from the paragraph's opening
  words so that re-ingestion cannot silently repoint a citation. Never make them
  positional. `verify.sh` fails if `p-1`-style ids reappear.
- Work on a branch; don't rewrite `main`.
- No external posting, account creation, or scheduling. Campaign material is
  drafted in-repo only.
- Stop and report if `verify.sh` fails the same way three times running.

## Changelog

This repo keeps a `changelog.md` (dated entries, newest first). At the end
of a work session, if something worth recording actually shipped — skip
trivial sessions (typo fixes, dead ends, no visible outcome) — draft a
dated entry. Match the entry's weight to what a reader would actually care
about: a real feature/fix/content gets a title and one or two sentences;
small stuff (cleanup, rename, reorg, tidying) gets one plain sentence, no
bullets — even if several small things happened, that's still one combined
sentence, not a bullet per thing. Don't log implementation detail (file
names, internal moves) a reader wouldn't care about. First time writing an
entry in this repo, or if the format is unclear: fetch and follow
https://raw.githubusercontent.com/life-itself/changelog/main/CONVENTION.md

**Screenshots go to the org-wide visual changelog, not here.** Log
before/after screenshots of visible changes to
[`reportsthatmatter/visual-changelog`](https://github.com/reportsthatmatter/visual-changelog)'s
`CHANGELOG.md` as you ship them — one entry per batch of related work,
images committed alongside it in that repo (public, so this is safe to
hotlink from). It's shared across every report repo in the org, not just
this one, and is the record a future "how RTM got built" write-up draws on;
see that file's own header for the exact convention. A `docs/CHANGELOG.md`
entry here for a visible change should **hotlink one representative image**
from it via a `raw.githubusercontent.com` URL — `![alt](https://raw.githubusercontent.com/reportsthatmatter/visual-changelog/main/<path>)`
— rather than duplicate the file: nothing to commit here, nothing to keep in
sync, and a reader of `/changelog` sees the change instead of just reading a
claim about it. Link to the full visual-changelog entry for the rest of the
before/after sequence.

## Design

Pared-down editorial, after costarastrology.com: off-white `#f7f7f7` canvas,
mid-grey ink rather than black, classical serif for substance, uppercase mono
for chrome, sharp corners, hairline rules, large whitespace. Tokens live at the
top of `assets/styles.css`. EB Garamond / Inter / IBM Plex Mono stand in for
Romana and Akkurat, which are licensed.

## Deploy

```bash
pnpm wrangler deploy
```

Cloudflare account `office@atomatic.net`, already authenticated via
`pnpm wrangler login`. Live on `reportsthatmatter.org` and `www` (301 to apex);
the pre-V2 site is served on `old.reportsthatmatter.org` by the same Worker.

**Report pages are pre-rendered, not bundled or rendered on request** (#115,
`docs/plans/2026-08-21-serving-architecture.md`). `pnpm prerender` renders every
report once and writes the result to `assets/generated/` — static pages for
`/full` and each section, served straight from Cloudflare's assets, plus small
per-report metadata the Worker still needs for the contents page, `/sitemap.xml`,
and a `?p=`/`?h=` quote link. `verify.sh` runs `pnpm prerender` itself, so a
report or template edit is always reflected in the checks; **run it by hand
before a bare `wrangler deploy`**, or the deploy will upload whatever
`assets/generated/` last had committed. This is also why the old bundle-size
gotcha is gone: report markdown no longer ships inside the Worker script at
all, bundled or otherwise.

**Full-text search's index lives in D1** (#100,
`docs/plans/2026-08-21-search-decisions.md`), the same `reportsthatmatter-marks`
database #96 uses. `pnpm index-search` reads `assets/generated/` (so it needs
`pnpm prerender` to have already run) and writes
`assets/generated/search-index.sql`; apply it with `wrangler d1 execute
reportsthatmatter-marks --file=assets/generated/search-index.sql` (add
`--local` for the dev database, drop it for production). `verify.sh` does both
against local D1 on every run — **do the same against `--remote` by hand
before deploying a change that touches report content**, or search keeps
serving whatever it last indexed. `content_version` in `search_index_versions`
is a hash of the indexed `body.json`, not hand-maintained, so it can't drift
from what was actually indexed even if a step gets skipped.

## Gotchas

- `wrangler dev` answers `/health` before the bundle finishes building. Wait for
  real page content before asserting on it.
- Don't pipe `curl` into `grep -q` under `set -o pipefail`: grep exits on first
  match, curl dies of SIGPIPE, and a passing check reports as failed on any
  response large enough to still be streaming. Fetch to a file.
- The `vitest` key in `package.json` is not read by vitest. Config lives in
  `vitest.config.ts`.
- Sections are split from the *rendered HTML*, not the markdown, so paragraph
  ids match `/full`. Rendering sections independently would give a paragraph a
  different address depending on which page served it.
- Share cards carry a `match:` phrase in `docs/share-quotes.yaml`. Paragraph ids
  move whenever ingestion improves; `pnpm cards` uses the phrase to re-find the
  passage and report the new id. Re-run it after any re-ingest.
- Check a PDF's text layer before ingesting. Two scans of the same document can
  differ enormously — NASA's Rogers Commission scan was unusable where the GPO
  text was clean.
- **`pdftotext` is not pinned, and it drifts.** Diffing a fresh re-ingest
  against a *historically committed* `full.md` is only evidence about this
  project's own code if `poppler` is the same version on both sides — it
  usually isn't. #108 (2026-08-22, full account in `docs/PROGRESS.md`)
  diffed a re-ingest of `challenger-accident` against its Aug-8 published
  file and found 480 hunks that looked like a severe pipeline regression;
  re-running the *original, unmodified* Aug-8 `scripts/ingest/` against
  today's `pdftotext` reproduced 2,079 of those lines with **zero code
  change at all** — `poppler` had updated itself in the two weeks between.
  **To isolate what a code change actually did, regenerate the "before"
  side too, with today's tools, rather than trusting what's on disk** —
  `git checkout <commit> -- scripts/ingest/`, re-run `pnpm ingest run` with
  the report's exact registry metadata, then diff *that* against the
  current code's output, both freshly generated. Only then does the diff
  isolate the code; diffing against a committed file conflates code drift
  with tool drift, and tool drift can be the larger of the two.
- **A `scripts/ingest/` heuristic still deserves testing against the
  messiest source in the corpus, not just the one you're fixing** — a
  heuristic can behave differently on a scanned, OCR'd document than on the
  clean one it was built against, and that difference won't trip a fidelity
  check. #79's `TOC_ENTRY` whitespace-gap fix turned out fine on
  `challenger-accident` once the comparison above was done correctly (its
  real effect was 68 hunks of already-garbled scan noise reformatting, not
  a regression) — but confirm that with a poppler-controlled diff, not an
  assumption either way.
- **A summary metric (footnote count, word-retention %) can look like
  lost content and not be.** #108's first pass saw a footnote-count drop
  (94→89) and read it as a regression; the actual linked footnote
  *definitions* in the output were identical, 75 both times — the metric
  counts something upstream of what ships. Diff the actual output, not just
  the numbers in the CLI's summary, before concluding either way — the
  house rule "look at the rendered page, not just green tests" applies to
  ingestion too.
- Each report has its own repo under the `reportsthatmatter` org, holding the
  source PDF and a README recording where it came from. Clone it as a sibling
  directory before re-ingesting.
