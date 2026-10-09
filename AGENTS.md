# Reports that Matter — working notes

Reports that Matter turns hard-to-access public reports into web pages that can
be read, searched, and cited by paragraph.

## → Begin here

```bash
git pull
bd dolt pull
bd ready
```

Beads is the entry point for current state and what to do next. This file is
the *house rules*.
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** is *how it works* — report
repos vs. this repo, publishing vs. deploying, search, the two fidelity gates
— with a diagram. Read it before assuming a deploy is what ships a content
change; it usually isn't (see its "what needs a deploy?" table).
**[docs/report-pipeline.md](docs/report-pipeline.md)** is *how a report
ships*: three stages (text, introduction, imagery), each its own release and
its own Bead per report, none waiting for review. Read it first for any
report work; it points at the guide for each stage.
**[docs/release-checklist.md](docs/release-checklist.md)** is *the integrator's
ordered steps* from an ingest release to production verify, with the command
that answers each question (what does the release do, must a report be
republished, will D1 take the writes). Read it before releasing, bumping the
pin or shipping.
**[docs/report-preparation.md](docs/report-preparation.md)** is *how to prepare
a report*: choosing and checking a source, the report's own repo, `ingest.ts`,
registering, plate and share card, `PROCESSING.md`, shipping, and what to
record afterwards. **Read it when you are adding a report or a further volume,
re-ingesting one, or writing a report's processing notes; skip it for site
code, design or deploys on their own.** It is a first draft: when a run
teaches you something it got wrong or left out, fix it in the same change.
**[docs/report-introductions.md](docs/report-introductions.md)** is *how to
write a report's introduction*: the landing page's summary and reading guide
in `editorial/<id>.yaml`, voice, verbatim quotations, highlights, and the
approved-on-ship flow. **Read it before writing or revising any editorial
file.** The `report-introduction` skill (`.claude/skills/`) points agents at it.

## Skills

Runbooks for the key steps live as skills, one `SKILL.md` each, in `.claude/skills/<name>/` (Claude Code reads them there). `.agents/skills` is a symlink to the same directory, which is where OpenAI Codex looks (repo skills in `.agents/skills`, from the working directory up to the repo root; it follows symlinks). Any other agent: open the file. Codex in its `read-only` sandbox cannot run `bd` (it takes a lock file) or `pnpm` scripts run by `tsx` (it opens an IPC socket: `listen EPERM`); give it `workspace-write` with the site worktree as the workspace (tested with codex-cli 0.161.0, 2026-10-09). Each skill gives its level, entry criteria, exact commands, exit gate, what it hands on and its failure modes, and links the doc that explains why. Every agent in a multi-agent session also follows [`docs/agent-protocol.md`](docs/agent-protocol.md) (worktrees, no releasing, measure, beads, retro). `tests/skills.test.ts` checks that every skill is listed here and that the `pnpm` scripts and repo paths it names exist.

| Skill | Use it when | Level |
|---|---|---|
| `report-pipeline` | Supervising reports through the eight stages: choosing the next unit, opening stage beads, checking exit gates, updating `reports/pipeline.yaml` | judgement |
| `report-source` | Stage 1: finding the official original and better renditions, checking versions and text layers, choosing the source stack | specced |
| `report-repo` | Stage 2: the report's own repo, pinned sources, `datapackage.json`, README, `ingest.ts` volumes, the manifest entry | specced |
| `report-first-ingest` | Stage 3: writing `ingest.ts` (hybrid or PDF pipeline), choosing passes from evidence, a first `full.md` | specced (new adapter: judgement) |
| `report-evaluate` | Stage 4: reading the output, golden pages, score, oracle, fixes, registering, `PROCESSING.md`, parking | specced (new defect class: judgement) |
| `report-editorial` | Stage 5: plate and cards, introduction, `card: true` excerpts, the hero bead | judgement |
| `report-introduction` | Writing or revising `editorial/<id>.yaml` (defers to `docs/report-introductions.md`) | judgement |
| `report-publish` | Stage 6, integrator only: publish to R2, deploy, reindex, seed, production verify | specced |
| `report-announce` | Stage 7: changelog entry, long-read and social drafts (nothing posted) | specced |
| `report-promote` | Stage 8: the report's excerpts in the posting queue | specced |
| `fix-agent` | You were handed a bead to fix: worktrees, measure before and after, PRs, notes, lessons, retro | the bead's |
| `pr-review` | You are the reviewer gating PRs: trial merge, checks, ratchet, the review file and the integrator's steps | judgement |
| `integrate-and-ship` | You are the integrator: merge, release ingest, bump the pin, re-ingest, `pnpm ship`, D1 budget, close beads | specced |
| `burn-down` | Verifying a report's old beads on current main and closing those already fixed or obsolete, with evidence | specced |
| `bead-writing` | Filing a handoff-ready bead, including from a retro or a review | specced |

A new skill gets a row here and a directory under `.claude/skills/` (nothing to add under `.agents/`). Frontmatter is `name` (the directory name) and `description` (when to use it), which both Claude Code and Codex require.

## Beads

Beads is the source of truth for agent-actionable work. Start each session with
`git pull`, `bd dolt pull`, and `bd ready`; create or update a Bead for work an
agent can undertake, including work linked to a GitHub issue. Beads owns task
detail, status, priority, dependencies, and acceptance criteria. GitHub keeps
human-created/public issues, report candidates, broad epics, and discussion.
Do not maintain a separate next-work list. At session end run `bd dolt push`
before committing and pushing. See [`docs/beads-sync.md`](docs/beads-sync.md)
for commands and sync recovery. JSONL export is for inspection and
interchange, not sync or backup.

The database belongs to this central `reportsthatmatter/reportsthatmatter`
repository. Tasks stay here even when their implementation is committed in a
report's sibling repository or in `ingest`; do not create a separate Beads
database in those repositories.

If progress genuinely requires Rufus's decision or action, create a separate
Bead labelled `needs-user`. State the exact request in its description, give it
unambiguous acceptance criteria, and add it as a dependency of every Bead it
blocks (`bd dep <needs-user-id> --blocks <blocked-id>`). A note that input would
be useful is not a blocker. Continue under a safe, reasonable assumption when
one is available.

## The done condition

```bash
./scripts/verify.sh
```

Typecheck, unit tests, ingestion fidelity, HTTP assertions against a live
worker, then browser checks (layout, measure, overflow, permalinks, the share
popover, console errors). **A change is not finished until this exits 0.**

A fresh checkout or worktree needs `pnpm bootstrap` first (`CI=true pnpm install`, then `pnpm prerender`). Several checks read `assets/generated/`, which is gitignored build output. `pnpm prerender` stamps it with a hash of its inputs (every `reports/*/full.md` and `PROCESSING.md`, the registry, the `@rtm/ingest` pin and installed copy, `scripts/prerender.mjs`); `pnpm corpus check`, `pnpm quality check`, `pnpm typecheck` and `pnpm test` refuse with "Run: pnpm prerender" when the stamp no longer matches, rather than passing against stale output. `verify.sh` re-runs prerender itself. (`pnpm setup` is a pnpm built-in, which is why the script is called `bootstrap`.)

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
| `reports/<id>/aliases.yaml`, `reports/<id>/published-ids.txt` | Paragraph-id aliases (old id → new id, old section slug → new) and the record of every id ever published, both generated by `pnpm aliases generate` (`seed` for history) — see "Ids move; aliases keep links alive" below. Prerender copies the aliases into `meta.json`, so they publish with the report |
| `scripts/aliases.ts`, `src/lib/alias-gen.ts`, `src/lib/aliases.ts` | The alias generator (text containment), the `pnpm aliases check` gate, and the route-side resolver |
| `scripts/cards.mjs` | Share cards → PNG (`pnpm cards`): curated `docs/share-quotes.yaml` cards, the default card per report, and a quote card per `card: true` editor's highlight (`q-<hash>.png`, `src/lib/card-key.ts`), which a `?h=` link naming those words previews with (bght.8). Re-run after editorial highlights change; `--highlights` renders only the quote cards |
| `editorial/<id>.yaml` | A report's landing page: why it matters, background, cited findings with key quotations, a reading guide, and Rufus's highlights. `status: approved` to show it; `?draft` on the contents page previews a draft |
| `scripts/paragraphs.mjs` | A report's paragraphs with ids, pages and sections, as the editorial check reads them (`pnpm paragraphs <id> [words]`) |
| `scripts/editorial.mjs` | Checks every editorial quote verbatim against the pre-rendered report and writes `src/generated/editorial.ts` (`pnpm editorial`, after `pnpm prerender`). `pnpm seed-highlights [--dry-run] [--remote]` then writes approved files' highlights to the marks table as the editor's (decision 0014), writing only the difference (0 rows when nothing changed). `pnpm highlight add '<share link>' [--card]` appends a highlight copied from the site's share popover to the editorial file |
| `marketing/queue.yaml` | The Bluesky posting queue, built by `pnpm posts` from every approved editorial file's `card: true` highlights plus `docs/share-quotes.yaml` — see [`docs/posts-queue.md`](docs/posts-queue.md). Idempotent and hand-off point for the scheduled poster (reportsthatmatter-y2t.4); makes no network request |
| `scripts/posts.mjs`, `src/lib/posts.ts` | `pnpm posts`'s CLI and its testable logic: quote/id checking reuses `src/lib/editorial.ts`, never repeats it |
| `scripts/marks-check.mjs`, `src/lib/marks-check.ts` | `pnpm marks check <id>\|--all [--baseline <dir>]`: replays stored D1 marks (read-only, cached in `build/marks-check/`), the `?p=`/`?h=` links in `marketing/queue.yaml` and editorial quotations against a candidate text; fails on any that stops anchoring. Release-checklist step 7. `pnpm marks` with no `check` is still the plate pipeline |
| `assets/marks/` | Each report's plate, committed: `<id>.webp` and `<id>-row.webp` — see [`docs/plates.md`](docs/plates.md) |
| `assets/heroes/` | Landing-page hero photographs, committed: `<id>.webp` (2400w) and `<id>-1200.webp`, built by `pnpm heroes` from `docs/design/2026-09-27-hero/sources.yaml` — see [`docs/hero-images.md`](docs/hero-images.md) |
| `scripts/imagery/` | Plate pipeline (`pnpm marks`), hero pipeline (`pnpm heroes`) and the favicon renderer (`brand.mjs`) |
| `scripts/prerender.mjs` | Reports → static assets (`pnpm prerender`) — see #115 below |
| `scripts/index-search.mjs` | Reports → the D1 search index (`pnpm index-search`) — see #100 below |
| `reports/registry.yaml` | What is published |
| `reports/corpus-baseline.json` | Every report's citable ids, for `pnpm corpus check` |
| `reports/quality-budget.yaml` | Per-report maximum counts for each quality signal, for `pnpm quality check` (signals in `src/lib/quality/`; `pnpm quality report` prints them all) |
| `src/lib/score/`, `scripts/score.mjs` | Alignment scorer: `pnpm score <id>` / `--all` scores a report against its reference edition (`<repo>/reference/`) and writes `score-out/<id>/errors.md`, the worst errors with page and paragraph id. Measure-only, not in verify. See [`docs/scoring.md`](docs/scoring.md) |
| `src/lib/content.ts` | Which store a report is read from — R2 at a pinned hash, or the deploy |
| `src/lib/publish.ts` | Content hashing, per-report tokens, what a version must contain |
| `content/posts/<slug>.md` | The blog (`/blog`): one markdown file per post, frontmatter `title`, `date` (YYYY-MM-DD, quoted), `author`, `summary`, `status: draft\|published`, optional `review:` list of open decisions. Drafts are built but never listed, linked, fed or put in the sitemap; `/blog/<slug>?draft` previews one (noindex). **To publish: set `status: published` (and the date), run `pnpm blog`, commit the regenerated `src/generated/posts-bundle.ts`, deploy.** The Worker reads the bundle, so a post needs a deploy; a test fails when the bundle is stale |
| `src/lib/blog.ts`, `src/templates/blog.ts`, `scripts/blog.mjs` | Post parsing and visibility, the index/post/Atom-feed renderers (`/blog/feed.xml`), and the bundler. The changelog links to a post with a plain `[text](/blog/<slug>)`; the link shows only once the post is published |
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
- **Know a change's blast radius before you commit it.** Three gates, all in `verify.sh`:
  - `pnpm ingest check` covers each report's **markdown** against the
    `baseline.json` in its own repo. Accept a move with
    `pnpm ingest baseline <id>`.
  - `pnpm corpus check` covers what this repo renders **from** that markdown —
    every section's citable paragraph ids, against `reports/corpus-baseline.json`.
    Accept a move with `pnpm corpus accept [<id>]`.
    A vanished or new section is explained, not just named: "folded into the
    section before it, X, which gained N paragraphs: consistent with the sliver
    rule" (a part under 2,500 characters merges into the one before it), or
    "renamed to Y", or "no neighbouring section gained its N paragraphs" when
    the text really is gone.
  - `pnpm quality check` covers what a *reader* sees in each report — severed
    sentences, unlinked footnote markers, furniture, missing headings — as
    per-report counts against `reports/quality-budget.yaml`. Budgets only
    ratchet down: after a fix, `pnpm quality ratchet [--dry-run]` lowers them to
    the new counts (verify.sh prints "N budgets can be ratcheted" when any sits
    10% or more above its count). **Raising one is a hand edit with a
    `# why: <bead id>` comment on the line**; check fails an uncommented raise
    against `HEAD`. See [`docs/quality-harness.md`](docs/quality-harness.md).

  A fourth is in `pnpm ingest verify`: each report repo's `golden.yaml` holds
  PDF pages whose true structure was read off the page image, and verify fails
  when a regeneration no longer matches one. A page the pipeline gets wrong is
  `xfail: <bead>` (with `xfail_only` kinds), so it stays visible without
  failing the run. Write one with `pnpm ingest page <id> <vol> <pdfPage>
  --draft`; see [`docs/quality-harness.md`](docs/quality-harness.md).

  A fifth, `pnpm ingest anchors --check` (s24x), checks where every `%%page N%%` marker lands from the PDF text layer alone (it shares nothing with the pipeline's page assignment, whose own "pages anchored" cannot fail) and holds wrong and stacked markers, unmarked pages and blocks under another page's marker to `reports/anchor-budget.yaml`; `--ratchet` after a fix. See `docs/quality-harness.md`, "Page anchors".

  The first two exist because a fix aimed at Leveson silently changed three other
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
  A pipeline fix is two steps: release it there (merge the PR, then `pnpm release X.Y.Z` from ingest's `main`), then bump the pin here and
  re-run `pnpm ingest check`. That friction is the point — it is what makes a
  report adopt an improvement knowingly instead of having it arrive
  unannounced, which is how one fix silently changed three reports.
  **After a pin bump, reinstall in every report repo** (`pnpm -C ../<repo> install`):
  each report's `ingest.ts` imports `@rtm/ingest` from its own `node_modules`, and
  a stale one crashes the checks on a missing export instead of showing a diff.
  `pnpm ingest preflight` compares each repo's installed version with its pin and
  prints the fix; `run`, `verify`, `check` and `baseline` run it first, and so does
  `verify.sh` (`--no-preflight` skips it; a linked override passes).
  The step-by-step for releasing and linking an unreleased ingest is
  [`scripts/ingest/README.md`](scripts/ingest/README.md), "Changing the library".
  To see what an unreleased ingest does before releasing it, run `pnpm ingest try <branch|path> [<id>…]`: it links that ingest into this site and into throwaway worktrees of the report repos, re-ingests, prerenders, and prints the join/move list, the quality deltas, the score flips (`pnpm score --diff`) and the oracle/anchor/quality findings that appeared or vanished, then restores every link. `--base <ref|path>` compares two ingests instead of the pin against one (a PR against an unreleased main). `pnpm ingest link <ingest dir>` / `--restore` is the by-hand link override, undone by one command. Paste the output into the ingest PR.
  **Every ingest release or pin-bump PR carries its quality numbers**: the
  integrator runs `pnpm quality report --diff origin/main` after the re-ingest
  and pastes the table into the PR body (every regression needs a bead; every
  improvement gets `pnpm quality ratchet`). After the release ships, run
  `pnpm quality ratchet --record` and commit `reports/quality-last.json`, so the
  next release is diffed against this one (`verify.sh` reminds you when
  `quality-last.json` was recorded at a different ingest version than the
  installed one). `pnpm publish-report <id>` prints that
  report's own quality row before it uploads.
  **The PR body carries one block, `pnpm scorecard`** (38s.6): that quality diff,
  the layout-oracle counts, the golden-page table and the headline score deltas
  (`docs/scores.json` against `origin/main`: boundary P/R/F1, page-break join
  accuracy over all, high-confidence and adjudicated rows, marker P/R, WER, the
  reference's own error rate), development and held-out sets apart, plus a
  checklist. After the release ships, `pnpm quality ratchet --record`,
  `pnpm scorecard --record --no-score` and `pnpm score`, and commit
  `reports/quality-last.json`, `reports/verify-last.json` and `docs/scores.json`.
  A report in `reports/score-sets.yaml` is development (tune on it) or held out
  (report only; a pass must not lower it and must not be tuned on it).
- **Ids move; aliases keep links alive** (reportsthatmatter-q8c). Joins, hybrid
  sources and corrections move paragraph ids, and a `?p=<old>` link (a shared
  quote, a posted card, a highlight) must still land. Every report has
  `reports/<id>/aliases.yaml` (`aliases`: old id → new id, `sections`: old
  slug → new, `unmatched`: ids whose text could not be found) and
  `reports/<id>/published-ids.txt` (every id ever published) and
  `published-sections.txt` (every section slug ever published), all generated,
  never hand-edited. **The integrator runs, after `pnpm ingest aggregate` /
  re-ingest and before `pnpm prerender`:** `pnpm aliases generate --all`
  (old text = `origin/main`'s `reports/<id>/full.md`, so run it from a branch
  based on what is published; `--old-ref <ref>` or `--old <full.md>` to
  override), read its per-report counts, and commit the files in the same PR
  as the re-ingest. The old text is rendered with the `@rtm/ingest` pinned at
  `--old-ref`, so section slugs an ingest release renames are recorded
  (hxo4); it prints `REUSED ID` for an id that now names a different paragraph
  (decision 0012, rf4c) and `MOVED-OUT ID` for a cited id that lost the list
  it introduced. Both stay on screen until fixed at the citers
  (`--accept-reuse` after reading). `pnpm aliases check` (in `verify.sh`) fails when a recorded
  id resolves nowhere and is not listed in `unmatched`, when a published
  section slug has no alias and no live page (and is not in
  `unmatched_sections`), when a reuse is pending, when a current id is
  unrecorded, or when an alias is stale. Prerender puts the aliases in
  `meta.json`; the Worker redirects a stale `?p=` (root, section-qualified and
  `/full` forms, `?h=` kept) and a renamed section slug. They publish and roll
  back with the report, so `pnpm publish-report <id>` ships them with no
  deploy; a report repo that publishes itself with `rtm-publish` would publish
  a `meta.json` without them, so publish through the site. A report repo's own
  `aliases.yaml` (us-911-commission#9) is not read: the site's is the
  authority, because only it knows what was published. `pnpm aliases seed`
  rebuilds both files from `reports/<id>/full.md`'s git history.
- **Every pnpm script entry point answers `--help` without running** (hxo4).
  Put `import "./lib/help.mjs";` first in the script (`../lib/help.mjs` from a
  subdirectory); it prints the file's header comment, which is the usage block,
  and exits 0 before anything else loads. `tests/help.test.ts` fails for an
  entry point in `package.json` that lacks it.
- **Append to [`docs/design/lessons.md`](docs/design/lessons.md).** After your
  final-report retro, add the lessons worth keeping (one line each, with the bead
  or doc as evidence) in the same PR as your work. It is the running log the
  improvement loop (38s) reads.
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
- **A text bug closes on a failing check.** A bug bead about a report's text
  (a severed sentence, a stray marker, a missing heading, furniture in the body)
  closes only when a signal in `pnpm quality check` (or, once b78.4 lands, a
  golden page) fails on the pre-fix output and passes on the fix, and the quality
  catalogue (`docs/design/2026-10-02-quality-harness-catalogue.md` §3) has the
  example, the bead id and the signal's name. If no signal can see the defect,
  add the signal first. A fix that lowers a count also lowers its budget:
  `pnpm quality ratchet <id>`. Raising a budget is a hand edit with a
  `# why: <bead id>` comment; `pnpm quality baseline --why <reason>` is for the
  integrator, after a re-ingest, once the diff has been read. Reader reports
  arrive through the `text-defect` issue template with the `reader-report`
  label; the bead gets the label and `--external-ref` to the issue.
- **A bug bead closes with a golden page or a narrowed xfail.** A bug bead about
  a report's text (or the pipeline's reading of it) closes only when the fix
  leaves one of two things in the report repo's `golden.yaml`: a new golden page
  that fails on the pre-fix output and passes on the fix, or an existing
  `xfail` entry narrowed (a kind dropped from `xfail_only`, or the page's
  `xfail` removed) because the fix made that assertion pass. A bead with
  neither is not closed: add the page first (`pnpm ingest page <id> <vol>
  <pdfPage> --draft`, then read the page image). This is in addition to the
  quality-signal rule above, and a fix that lowers an oracle count also lowers
  its budget (`pnpm ingest verify <id> --ratchet-oracle`;
  `reports/oracle-budget.yaml`, checked by `pnpm ingest verify`).
- **Don't modify tests to make them pass** — fix the code. (Do fix tests whose
  fixtures are unrealistic; several early ones were.)
- **Paragraph ids are the product.** They derive from the paragraph's opening
  words so that re-ingestion cannot silently repoint a citation. Never make them
  positional. `verify.sh` fails if `p-1`-style ids reappear.
- Work on a branch; don't rewrite `main`.
- No external posting, account creation, or scheduling by an agent. Campaign
  material is drafted in-repo only. The one exception is built, not run: the
  scheduled poster (`.github/workflows/post-next.yml`, [docs/poster.md](docs/poster.md))
  posts the queue to Bluesky from GitHub Actions, and only after Rufus adds the
  two secrets and sets `POSTER_LIVE=true`. Agents never set those, never run it
  live, and never post by hand.
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

**Every published report has a plate** — one treated image from its own evidence, in its archive row, report header and share cards. Adding a report means adding its plate in the same change; `tests/plates.test.ts` fails otherwise. The recipe is [`docs/plates.md`](docs/plates.md); the reasoning is the study in `docs/design/2026-09-12-imagery/`.

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

### Shipping a release: `pnpm ship`

The post-merge half of a release (pin bump in every report repo, re-ingest, baseline, aggregate, aliases, prerender, checks, publish with `--no-reindex`, deploy, reindex the published reports, seed, verify, record) is `pnpm ship`, a resumable driver with a state file (`build/ship/state.json`). `pnpm ship --plan` prints every step and runs nothing; steps that touch production need `--yes`; a failed check stops it and prints what to read. It decides nothing: merges, conflicts, commits, budget raises and accepting a diff stay with the integrator. Steps and flags: `docs/release-checklist.md`, `scripts/ship.ts`. `pnpm bump-pin X.Y.Z` bumps the pin in the site and every report repo (lockfiles refreshed with `--no-frozen-lockfile`; `--dry-run`). The d1-estimate step refuses when it cannot read today's D1 use (`pnpm d1-usage`); `docs/d1-usage-alert.md` schedules `pnpm d1-usage --alert 80`. `pnpm worktrees prune` prints which agent worktrees are safe to remove (merged, pushed, clean, older than 24h; never a shared checkout, a branch with no PR still at main, a live site worktree's `-reports/` worktrees or a linked ingest) and `--apply` removes them after re-checking each; never hand-remove `*-<today>` worktrees.

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

This also **reindexes the report for search** once the commit succeeds
(`./scripts/reindex-search.sh`, itself a fix for reportsthatmatter-7np —
scoped to one report, not the whole-corpus file whose remote apply used to
fail) — search content and R2 content used to drift independently, with
nothing that would notice. Skipped automatically against `localhost`, on
`--rollback` (the text on disk is the *new* version, not the one being
rolled back to — reindex by hand once the matching text is prerendered
again), and with `--no-reindex`. **`rtm-publish` (path 1) does not do this
yet** — it lives in the separate `@rtm/ingest` repo, so parity there is its
own pipeline change, not something this repo can wire in.

**The reindex writes only what changed, and D1's free tier is 100,000 row
writes a day.** A full rewrite of a report costs about 6 row writes per
paragraph (3 to delete, 3 to insert: FTS5's shadow tables count), so the whole
corpus is about 250,000, two and a half days of quota, and one 10-report
release spent a day's worth and failed the third publish in the middle
(reportsthatmatter-h6b). `scripts/reindex-search.sh` now reads the report's
rows back from D1, hashes them, and deletes and inserts only the paragraphs
whose text, section or page differ from what `pnpm prerender` would index; a
report whose search version already matches writes one row. Measured on the
v0.18.0 re-ingest (`pnpm exec tsx scripts/measure-reindex.mjs c5a9dcd`): 4,603
row writes for the corpus against 253,473 for the full rewrite. `--full` on
the script (`--full-reindex` on `publish-report`) is the old rewrite.

- `pnpm publish-report <id> --preflight` asks D1 first, writing nothing of
  yours: it inserts and deletes one sentinel row, which says whether the quota
  is spent (code 7500, with the time it resets), what D1 bills for a search
  row, and what this publish would cost; with `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` set it also reads today's writes and says whether it
  fits. A real publish against a deployed site runs it first and stops before
  uploading anything when the quota is spent (`--no-preflight` skips it).
- `pnpm publish-report <id> --dry-run` prints the object count, the version the
  site serves, whether the text is unchanged, and the estimated row writes
  (reads D1 for the reindex diff; `--offline` skips that). Needs no secret.
- `./scripts/reindex-search.sh <id> --dry-run` prints the same plan alone.
- A publish that fails with D1 code 7500 has uploaded its objects and not
  committed: wait for 00:00 UTC, then repeat the same `publish-report` command
  (uploads are idempotent).

**Either way:**

- **The secret** lives at `~/.rtm-publish-secret` on this machine (see Working conventions below)
  — it is the Worker's `PUBLISH_SECRET`, and it
  cannot be read back from Cloudflare if lost; rotating it means reissuing
  every report's token. A report's token is derived —
  `HMAC(PUBLISH_SECRET, <report id>)` — so a repo holds a credential that can
  rewrite exactly itself and nothing else.
- **`--status`** shows what is currently being served for a report, without
  publishing anything: `pnpm publish-report <id> --status` or
  `pnpm exec rtm-publish <id> --status` from the report's own repo.
- **`pnpm publish-report --all --status --base https://reportsthatmatter.org`**
  answers "must I republish?" with no secret and no writes: per report, the
  content hash this checkout's prerender would publish against the
  `x-rtm-content-version` the site serves, and the list of reports to publish
  (`DRIFT`, or `not published` when the deploy's own copy is served).
  `deploy-cloudflare.sh` prints it after a deploy; `--fail-on-drift` exits 1
  for scripts. Run `pnpm prerender` first (it refuses on a stale prerender).
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
`cached()`, whose key carries the Worker version id (`cacheKeyFor`, the
`CF_VERSION_METADATA` binding), so a deploy retires every cached entry; a
publish with no deploy after it still waits out the day (`pnpm ship` always
deploys). The canonical page stays uncached: it would be a day of stale text.
`verify.sh` checks that a plain `?p=` URL serves the version the report is at.

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

## Work streams

Work falls into five streams. Every open bead carries exactly one `stream:*` label; give a new bead its label when you create it (`bd create ... -l stream:quality`). Filter with `bd list --label stream:<name>` or `bd ready --label stream:<name>`. A supervisor plans a session by stream, so say which stream a batch of work serves. (Rufus, 2026-10-09; the first labelling pass and the triage behind it are in `~/src/reportsthatmatter/triage-2026-10-09.tsv`.)

- **`stream:marketing`** — getting readers: the launch, social accounts, the poster and excerpt campaign, outreach, SEO submission, and the licence and disclosure questions that gate going public. Drafts live in the `marketing` repo.
- **`stream:reports`** — more reports, done well: finding and checking sources, new reports and further volumes, introductions and highlights, heroes and plates, per-report processing notes, and the report-preparation skills (`ifb5`).
- **`stream:quality`** — improving report processing systematically: ingest passes, per-report text defects, quality signals, scoring, reference texts, golden pages, adjudicated breaks, the oracle, and the improvement loop (`38s`, `b78`). Prefer work that measures a class of defect over another one-off fix.
- **`stream:product`** — what readers do on the site: highlights, sharing and quote cards, marks, search, navigation, landing pages, figures and images, and phones.
- **`stream:platform`** — what keeps the site running and releases cheap: hosting, D1 budgets and caching, `pnpm ship` and release tooling, aliases and cards generation, CI, and worktree housekeeping.

## Bead levels and handoff-ready beads

Every open task or bug bead carries one `level:*` label saying how much judgement it needs, so any agent (Claude, Codex or another) can pick work it is suited to. Levels are agent-neutral; the table maps them to models.

| Label | What it needs | Claude | Codex |
|---|---|---|---|
| `level:specced` | A clear spec with acceptance criteria: apply an existing pass, wire a flag, fix a located bug, write a test, update docs. Success is checkable by a command. | Sonnet | default reasoning |
| `level:judgement` | Design within a known area: a new ingest heuristic, a measurement, research with a defined question, an introduction, a review. Needs reading evidence and choosing. | Opus | high reasoning |
| `level:design` | Cross-cutting synthesis or direction-setting: architecture, strategy, a new subsystem. Usually ends in a design doc and new beads, and often a decision for Rufus. | Fable | high reasoning, with a human check |

Epics, milestones and decisions take no level. A bead blocked on Rufus is labelled `needs-user` (see Beads above), whatever its level.

**Handoff-ready.** A bead labelled `handoff` can be done by an agent with no context beyond this repository, AGENTS.md and the bead itself. Its description has:
- **Goal:** one or two sentences on what changes for a reader or a maintainer.
- **Where:** the repos, files, commands and report ids involved.
- **Acceptance:** checkable criteria, each with the command or page that shows it (e.g. "`pnpm quality check` shows `numbered-paragraph-glued` 3 → 0 for uk-leveson-inquiry").
- **Verify:** the checks to run before opening a PR (`pnpm typecheck`, `pnpm test`, `pnpm ingest check`, `pnpm corpus check`, as relevant).
- **Out of scope / risks:** what not to touch, and other beads it could collide with.

Find work with `bd ready --label handoff --label level:specced` (add `--label stream:<name>` to narrow it). Create new beads handoff-ready with a stream and a level: `bd create "<title>" -t task -p 2 -l stream:quality,level:specced,handoff -d "<description>"`.

## Decisions and open questions

When a question of direction comes up (format, policy, sources, hosting, editorial), don't settle it in chat or in a PR description. Add a record to `docs/decisions/` (copy `0000-template.md`, status `open` or `proposed`) and a bead labelled `decision`, then carry on. Rufus decides open questions; update the record and close the bead when he does. See `docs/decisions/README.md`.

## Working conventions

How Rufus wants work done here. These conventions live in this file, not in any agent's private memory, so every agent and session sees them. When Rufus states a new convention, add it here.

**Decide and proceed.** Don't route execution choices back to Rufus. If in doubt, go forward with a reversible choice, record it, and keep going. Batch real questions at the end. (Questions of *direction* are different: log them; see "Decisions and open questions" above.)

**Ship introductions without review.** Report introductions (`editorial/<id>.yaml`) go out approved, merged and deployed in one go. Rufus gives feedback later as a follow-up. Don't open "Rufus: review" beads for intros.

**Drafts live in the repo.** Posts, long-reads and research write-ups are files on a branch with a PR: the blog posts folder with `status: draft`, or `docs/research/`. Don't produce Claude artifacts as review copies unless Rufus asks for one.

**Get better faster, not just fix the next bug.** Research and integrator work should also improve how we find and measure defects. Prefer work that produces measurement (reference texts, `pnpm score`, golden pages, the oracle, error clustering) over another one-off pass. Every agent's final report ends with a "Getting better faster" retro (what slowed you, what would have caught it, one proposal), and lessons go into `docs/design/lessons.md`. Reports that have a clean edition are both a served source and the labelled training set for PDF-only reports (shadow PDF ingest; docs/decisions/0003).

**Rufus does not review PRs.** An agent review (a separate reviewer agent) is the gate; then the integrator merges and ships. (Rufus, 2026-10-03)

**Park hard reports.** Give a tough report one fix attempt. If a different defect then appears, stop, write up what was learned in a bead labelled `research`, hold its PRs out of the release, and move on. Don't churn on it inside a general session (e.g. Duelfer, Leveson headings).

**Supervisor and model choice.** A supervisor session delegates to subagents and picks the model per task before spawning:
- Sonnet: specced code, applying existing passes, stage-1 ingests, integrators and release chains, copy, heroes.
- Opus: new heuristics, research, design, and writing introductions.
- Fable: only for big design synthesis.

Run 5–7 agents at a time (usage limits), and resume stopped agents rather than starting fresh. Fix agents open PRs and never release. One Sonnet integrator merges, releases with `pnpm release`, bumps pins, reads every diff, deploys and publishes. Each report repo has one owning agent at a time. The standing rules every spawned agent follows are [`docs/agent-protocol.md`](docs/agent-protocol.md); a session may add a dated note on top (`~/src/reportsthatmatter/.agent-protocol-<date>.md`). Roles have skills: `fix-agent`, `pr-review`, `integrate-and-ship`, `burn-down` (see "Skills" above).

**Shared checkouts.** `~/src/reportsthatmatter/reportsthatmatter`, `~/src/reportsthatmatter/ingest` and the report repos are shared by concurrent sessions. Never switch branches or stash in a shared checkout. Work in a `git worktree` (site: `pnpm bootstrap`; report repos too whenever another agent may touch the same repo), with its own `node_modules`, never a symlink. A peer's uncommitted edits in a sibling report repo can fail verify's corpus check: that's peer noise, so check `git status` there. **The CLI enforces it:** `pnpm ingest run`, `baseline` and `aggregate` refuse a report repo that is the shared checkout (the default sibling path, and a main working tree rather than a linked worktree). Make worktrees with `pnpm ingest worktrees <id…>` (it creates `<site>-reports/<repo>` worktrees on a new branch and prints the `RTM_REPORT_DIRS` to export; every script that reads a report repo resolves it through `scripts/lib/report-dirs.ts`, so `pnpm score`, `pipeline status`, `marks` and `ingest aggregate <id>` honour it too; `RTM_REPO_ROOT` is the old name), or pass `--shared` — **the integrator's deliberate opt-in only** (`VERIFY_SHARED=1 ./scripts/verify.sh` passes it to `aggregate`). Before a pass PR: `pnpm ingest recheck --passes <changed,passes>` re-ingests every report declaring one (in memory) and fails on a correction that no longer matches exactly once, and `pnpm ingest crosscheck` fails on a golden page that contradicts `reference/adjudicated.yaml`.

**Releasing ingest.** PRs squash-merge, so tag only the post-merge commit on `main`; `pnpm release <version>` enforces this, plus a current `dist/`. The site's `@rtm/ingest` pin runs `pnpm ingest run/check` for every report, so a site pin bump re-ingests the whole corpus: prove that every report you didn't intend to change is byte-identical. After bumping report-repo pins, run `pnpm install` in each (`pnpm ingest preflight`).

**Page heads are tested as a crawler reads them.** `tests/seo-head.test.ts` renders every report's landing page, `/full` and a section (with and without `?p=`) and checks one canonical URL per page, titles that lead with the registry's `common_name`, JSON-LD validated against a slice of the schema.org vocabulary (`tests/fixtures/schemaorg-subset.json`, regenerated by `node scripts/schemaorg-subset.mjs`), and that `citation_pdf_url` is never emitted (we serve no PDF). A new report needs the registry fields in `docs/report-preparation.md` or this test fails. Search-result pages are `noindex`; a `?p=`/`?h=` link canonicalises to its bare page.

**Cloudflare.** This project's account is wrangler's `default` profile (office@atomatic.net). A home-directory binding in `~/Library/Preferences/.wrangler/profiles/directory-bindings.json` can send wrangler to the `datopian` account, so `wrangler deploy` then fails on the D1 binding (`code: 10181`), and `WRANGLER_PROFILE` doesn't override it. Check with `pnpm wrangler d1 list`, which should show `reportsthatmatter-marks`. The publish secret is at `~/.rtm-publish-secret` (the only copy; if it's lost, rotate `PUBLISH_SECRET` and reissue the report tokens). D1 free tier is 100k row writes **and 5M rows read** per day, reset 00:00 UTC; running out of reads (2026-10-03, reportsthatmatter-t4al) stops search, marks and publishing for everyone. Publish with `--no-reindex`, then reindex only what changed (`--preflight` probes first). `pnpm d1-usage` shows today's reads and writes and the queries that spent them (Cloudflare analytics through wrangler's login, costs no D1 rows; plus a ledger every remote `wrangler d1 execute` from `scripts/lib/d1.ts` appends to, `~/.local/state/rtm/d1-usage.jsonl`); `pnpm ship`'s d1-estimate step budgets both and stops when they do not fit. Never query `passages` by `WHERE report = ?`: `report` is an UNINDEXED FTS5 column, so that reads the whole corpus (~40k rows) every time; go through the rowid layout `search_index_versions.layout` records (migration 0004, `scripts/lib/d1.ts`). If wrangler's OAuth expires, ask Rufus to run `! pnpm wrangler login`.
