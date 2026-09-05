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
| `assets/generated/` | Pre-render output: layout-free fragments. **Not committed** |
| `src/lib/passages.ts` | Report HTML → citable-unit plain text, for the search index |
| `src/lib/search.ts` | FTS5 query building, bm25 weights, match → quote-anchor arithmetic |
| `assets/styles.css` | The design system. Hand-written, no framework |
| `assets/share.js` | Highlight-to-share |
| `scripts/ingest/cli.ts` | Runs the pipeline over this corpus — see its `README.md` |
| `reports/manifest.yaml` | Where each report's build lives |
| `reports/<id>/full.md` | An aggregated copy for serving. **The authority is the report's own repo** |
| `scripts/cards.mjs` | Share cards → PNG (`pnpm cards`) |
| `scripts/prerender.mjs` | Reports → static assets (`pnpm prerender`) — see #115 below |
| `scripts/index-search.mjs` | Reports → the D1 search index (`pnpm index-search`) — see #100 below |
| `reports/registry.yaml` | What is published |
| `reports/corpus-baseline.json` | Every report's citable ids, for `pnpm corpus check` |
| `src/lib/content.ts` | Which store a report is read from — R2 at a pinned hash, or the deploy |
| `src/lib/publish.ts` | Content hashing, per-report tokens, what a version must contain |
| `docs/v2-features.yaml` | What is done and what is next |

## House rules

- **Fixes go in the pipeline, not in its output.** Never hand-edit a generated
  `reports/*/full.md`. Where the fix goes depends on what it is
  (`scripts/ingest/README.md`): a rule that holds for every document is a
  shared pass; a property of one source the parser cannot infer is a pass that
  report *declares* in its own `reports/<id>/ingest.ts`. (Planned: a per-report
  `corrections.yaml` for the human judgements the pipeline cannot make, applied
  deterministically so output stays reproducible — #106, now stage 5 of #118.
  Until that exists, the rule is absolute.)
- **Know a change's blast radius before you commit it.** Two gates, one per
  stage, both in `verify.sh`:
  - `pnpm ingest check` covers each report's **markdown** against the
    `baseline.json` in its own repo. Accept a move with
    `pnpm ingest baseline <id>`.
  - `pnpm corpus check` covers what this repo renders **from** that markdown —
    every section's citable paragraph ids, against `reports/corpus-baseline.json`.
    Accept a move with `pnpm corpus accept [<id>]`.

  Both exist because a fix aimed at Leveson silently changed three other
  reports. The second was added later, and closed a real hole: `paragraphId()`
  lives in `src/lib/markdown.ts`, one stage *downstream* of anything a report
  has a pin on, so until then an edit there could repoint every citation in
  the archive with no gate anywhere. Paragraph ids are the product; changing
  4 to 5 in one `slice()` moves ids in all ten reports, and now says so.
  **Never `accept` to make the check quiet** — accept because you read the
  diff and meant it.
- **A report is rebuilt from its own definition**, not from a remembered
  command line: `pnpm ingest run <id>` reads the `ingest.ts` in that report's
  own repo, which records the ordered, checksummed source volumes and the
  passes it declares. `reports/manifest.yaml` says where that is.
- **The pipeline is a pinned dependency**, [`@rtm/ingest`](https://github.com/reportsthatmatter/ingest).
  A pipeline fix is two steps: release it there, then bump the pin here and
  re-run `pnpm ingest check`. That friction is the point — it is what makes a
  report adopt an improvement knowingly instead of having it arrive
  unannounced, which is how one fix silently changed three reports.
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
  and every one passed the tests first. Three shipped live in 2026-08/09 alone,
  each caught only by opening the page: Columbia's columns welded together,
  and 865 of Litvinenko's 1,089 paragraphs cut in half with their tails
  relabelled as quotations.
- **The fidelity gates count words, not their order.** A paragraph severed and
  half of it relabelled scores identically to a correct one, which is exactly
  how the Litvinenko defect passed every gate. `severedSentenceCheck` closes
  that particular hole; the general lesson is that a check which cannot fail on
  the broken output is not evidence. When adding one, run it against the broken
  version and watch it fail before trusting it.
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

**Checklist — run this at the end of any session that shipped something.**
Skip the whole list only for a trivial session (typo fix, dead end, no
visible outcome). Nothing here is automatic; it is on the agent to do.

- [ ] **`docs/CHANGELOG.md`** — a dated entry added, newest first (weight and
      format rules below).
- [ ] **Screenshots** — if the change is *visible*: before/after images (or
      just "after", for new content) committed and pushed to
      [`reportsthatmatter/visual-changelog`](https://github.com/reportsthatmatter/visual-changelog),
      in their own dated directory, one entry per batch of related work.
- [ ] **Hotlink** — if there are screenshots: one representative image pulled
      into the `docs/CHANGELOG.md` entry via a `raw.githubusercontent.com`
      URL, plus a link to the full visual-changelog entry.
- [ ] **Redeploy** — `docs/CHANGELOG.md` is bundled into the Worker
      (`src/lib/bundled.ts`), so `/changelog` only reflects the new entry
      after a deploy. Deploy, then open `/changelog` and confirm the entry
      and the image render.
- [ ] **Say so** — the hand-off / summary reports each item above as done or
      explicitly not-done. Never a prose "all shipped" that hides a skipped
      step.

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
and a `?p=`/`?h=` quote link. This is also why the old bundle-size gotcha is
gone: report markdown no longer ships inside the Worker script at all.

⚠️ **`assets/generated/` and `build/` are not committed** — they are build
output (`docs/plans/2026-09-04-content-publishing.md` §8 step 2). So
**`pnpm prerender` is not optional before a deploy**: a bare `wrangler deploy`
from a clean clone uploads no report pages at all. Use
`./scripts/deploy-cloudflare.sh`, which always pre-renders first. `verify.sh`
runs it too, so the checks always see current output.

This replaced committing the output, which was 85% of this repo's git history
and drifted anyway: commit `5435afd`, a documentation commit, deleted 413
generated files with no additions, leaving `main` with **zero** artifacts for
six of the ten reports. Production was unaffected only because deploys upload
from disk after a manual `pnpm prerender` — a fresh-clone deploy would have
dropped those reports off the site.

**A report can be served from R2 instead of the deploy.** `src/lib/content.ts`
is the only place that knows there are two stores: a row in `report_versions`
pins a content hash and the report is read from `reports/<id>/<hash>/…` in R2;
no row and it comes from the deploy's own `assets/generated/`. Every response
carries `x-rtm-content-version` naming the hash or `assets`, which is what
keeps the deliberate fallbacks (missing object, missing table) observable
rather than silent.

### Publishing a report — how it works now

**⚠️ Content published to R2 is not touched by an app deploy.** Once a report
has a row in `report_versions`, it is served from that pinned hash forever,
regardless of what `full.md` in that report's own repo says or how many times
this repo redeploys. A correction to a report's text does nothing to a reader
until someone runs one of the two commands below. This is the single sharp
edge to know before touching anything here: a report *can* silently go stale
relative to its own source, and nothing pages anyone about it.

Two ways to publish, same underlying mechanism (`@rtm/ingest`'s
`src/publish.ts`, imported by both sides — client and server hash the exact
same way, so they cannot disagree about what a hash means):

**1. A report repo publishing itself** (`rtm-publish`, from `@rtm/ingest`
v0.12.3+ — this is the target state, and it works today, verified against
`challenger-accident`):

```bash
# from the report repo's own root, where full.md lives
RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) \
  pnpm exec rtm-publish <report-id> --base https://reportsthatmatter.org
```

It reads that repo's own `full.md`, renders it with `renderArtifacts`
(the same function `pnpm prerender` calls here), and publishes the result.
Needs `@rtm/ingest` pinned to v0.12.3 or later in that repo's own
`package.json` — bump it there the same deliberate way any other pipeline
version bump happens (a diff, not a silent float).

**2. This repo publishing on a report's behalf** (`pnpm publish-report`,
reading from its own `assets/generated/` — the older path, kept for reports
that have not moved to publishing themselves yet):

```bash
pnpm prerender   # if assets/generated/ isn't already current
RTM_PUBLISH_SECRET=$(cat ~/.rtm-publish-secret) \
  pnpm publish-report <report-id> --base https://reportsthatmatter.org
```

**Either way:**

- **The secret** lives at `~/.rtm-publish-secret` on this machine (memory:
  `rtm-publish-secret.md`) — it is the Worker's `PUBLISH_SECRET`, and it
  cannot be read back from Cloudflare if lost; rotating it means reissuing
  every report's token. A report's token is derived —
  `HMAC(PUBLISH_SECRET, <report id>)` — so a repo holds a credential that can
  rewrite exactly itself and nothing else.
- **`--status`** shows what is currently being served for a report, without
  publishing anything: `pnpm publish-report <id> --status` or
  `pnpm exec rtm-publish <id> --status` from the report's own repo.
- **`--rollback <hash>`** re-points at a version still in the bucket —
  objects are never collected, so any hash that was ever committed can be
  committed again — without re-uploading a single byte.
- **The publish itself cannot corrupt production**: the endpoint re-derives
  the content hash from the manifest and reads every object back before it
  writes the pointer, so a publish that would 404 in production is refused
  outright rather than going live half-finished.
- **Confirm it worked** by reading `x-rtm-content-version` on the response —
  it names the hash being served, or `assets` if the report has never been
  published: `curl -sD- -o /dev/null https://reportsthatmatter.org/reports/<id>/full | grep -i x-rtm-content-version`.

**Artifacts are layout-free fragments, and the Worker assembles the page.**
`pnpm prerender` writes `fragments/<slug>.html` (one section's body) and
`full-body.html` (the whole report's), with no site chrome in either. The
layout belongs to the app, the content belongs to the report — so a template
change dirties no report artifact, and a report can be republished without an
app deploy (content-publishing plan §2). `run_worker_first = true` means the
Worker ran on every request anyway, so assembly costs a string concatenation.

A `?p=`/`?h=` link differs from the plain page only in `<head>`;
`tests/head.test.ts` pins that. Only the shared-link variants go through
`cached()` — it does not invalidate on deploy, which is fine for a quote
link's preview and would be a day of stale text on the canonical page.

**Full-text search's index lives in D1** (#100,
`docs/plans/2026-08-21-search-decisions.md`), the same `reportsthatmatter-marks`
database #96 uses. `pnpm index-search` reads the pre-rendered section pages in
`assets/generated/` (so it needs `pnpm prerender` to have already run) and
writes `build/search-index.sql` — `build/`, not `assets/`, because it is an
input to `wrangler d1 execute` that is never served and was 16.3 MB uploaded
with every deploy for nothing. Apply it with `wrangler d1 execute
reportsthatmatter-marks --local --file=build/search-index.sql`.

`--remote --file` works (verified 2026-09-03, ~221k changes in one call); the
older `--command`-splitting workaround for `Authentication error [code: 10000]`
is obsolete — see #123. `verify.sh` applies the index to local D1 on every run
— **do the same against `--remote` by hand before deploying a change that
touches report content**, or search keeps serving whatever it last indexed.
`content_version` in `search_index_versions` is a hash of the indexed section
pages, not hand-maintained, so it can't drift from what was actually indexed
even if a step gets skipped.

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
  `baseline.json` records the poppler version, so `pnpm ingest check` now
  says "poppler X → Y — tool drift, not a code change" rather than letting
  you mistake one for the other.
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
