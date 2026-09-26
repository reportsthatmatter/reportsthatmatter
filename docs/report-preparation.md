# Preparing a report

How a report gets from a source PDF to a published, trustworthy page on Reports that Matter. This is stage 1 of [the pipeline](report-pipeline.md): the text on its plain contents page, which ships on its own; the introduction and imagery follow as separate stages. Read this when you are adding a report or a further volume of one, re-ingesting an existing report, or writing a report's processing notes. You do not need it for site code, design or deploys on their own; [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`AGENTS.md`](../AGENTS.md) cover those.

**Status: first draft, written 2026-09-20** from the Bloody Sunday Inquiry (Saville, Vol I) ingest and the processing-notes trial. It has not yet been followed cold by someone who did not write it. When a run teaches you something this file got wrong or left out, fix it in the same change. Improvement work is tracked in Beads (`bd search "report-preparation"`).

## The short version

1. Pick the report and check its PDF's text layer.
2. Set up a sibling worktree and the report's own repo.
3. Write `ingest.ts`, run it, and read the output.
4. Register the report and accept its baselines.
5. Add its plate and share card.
6. Write its `PROCESSING.md`.
7. Verify, merge, deploy, publish, and check production.
8. Changelog, then file a Bead for everything still not right.

## 1. Choose the report and check the source

Candidates live as GitHub issues (`docs/v2-features.yaml`, the `more-reports` entry, lists them) and as Beads. What makes a good candidate is in [`plans/brief-2026-01-13-good-reports.md`](plans/brief-2026-01-13-good-reports.md): news relevance, quotability, a source document that can be linked to paragraph by paragraph.

**Check the PDF's text layer before committing to it.** Two scans of the same document can differ enormously: NASA's Rogers Commission scan was unusable where the GPO text was clean, and FCIC's PDF drops every digit on extraction, so it is still ruled out. Run `pdftotext` on a few pages, and prefer the born-digital official publication over a scan of it.

Very large reports (Saville is ten volumes, about 5,000 pages) need a scoping decision first: which volumes, and whether they are one report or several. Make it explicit in a Bead before ingesting.

## 2. Set up

- **Work in a sibling git worktree**, not on the shared checkout: `git worktree add ../rtm-<task> -b <branch> origin/main`, then `CI=true pnpm install --frozen-lockfile` and `pnpm exec playwright install chromium`. Several sessions share `~/src/reportsthatmatter/reportsthatmatter`, and switching branches there switches everyone. It must be a sibling, not nested under `.worktrees/`, because `reports/manifest.yaml` locates each report as `../<report-repo>`.
- **Never symlink a worktree's `node_modules`** to the main checkout's. pnpm then tries to purge the other project's modules, and scripts resolve the wrong `@rtm/ingest`.
- **Never use bare `git stash` or `git stash pop`.** The stash is shared across worktrees.
- `verify.sh` aggregates from the sibling report repos' *working trees*, not their commits, so a peer's uncommitted edits in `../<report-repo>` can fail your corpus check. Run `git -C ../<report-repo> status` before chasing a corpus move.
- **Create the report's repo** as a public repo in the `reportsthatmatter` org (`gh repo create reportsthatmatter/<id> --public`) and clone it beside this one. The most recent complete example is [`uk-saville-inquiry`](https://github.com/reportsthatmatter/uk-saville-inquiry): `archive/<the PDF>`, `datapackage.json` (source and licence), `README.md`, `ingest.ts`, `package.json` pinning `@rtm/ingest`, `corrections.yaml`, and the generated `full.md`, `fidelity.md` and `baseline.json`. [`contribute-reports.md`](contribute-reports.md) describes an older layout and is out of date.
- Record where the PDF came from and its licence in the report's `datapackage.json` and README. The PDF is pinned by SHA-256 in `ingest.ts` (`shasum -a 256 archive/<file>.pdf`).

## 3. Build the text

`ingest.ts` is the report's own definition: its ordered, checksummed source volumes and the passes it declares. Start from the closest existing report (UK inquiries with numbered paragraphs: Litvinenko, Leveson, Hillsborough, Saville) and run `pnpm ingest run <id>`.

**Where a fix goes** (from [`scripts/ingest/README.md`](../scripts/ingest/README.md)):

| The problem | The fix |
| --- | --- |
| Holds for every document in the corpus | A shared pass in `@rtm/ingest` |
| A property of this source the parser cannot infer | A pass declared in the report's `ingest.ts` |
| A judgement about this document's text | `corrections.yaml` |

Never hand-edit `full.md`; the next ingest overwrites it. If you are writing a correction to undo something the parser did, you needed a different pass.

**Read the output, not just the counts.** Every serious defect in this project passed the tests first. For a new report, open the rendered pages and check specifically: paragraphs that end or begin mid-sentence, especially at page breaks; footnotes (do the markers and definitions match, and does any one note absorb many references?); headings (are chapters and subsections real, and are quoted capitals or numbered lists being mistaken for headings?); stray characters such as `�`; facing pages laid out at different margins; anything from maps, tables or figures leaking into the prose. Saville had all of these, and its first ingest looked plausible.

**If the pipeline needs a change**, that is a release of `@rtm/ingest` (a separate repo, pinned by tag), then a deliberate version bump in this repo and in the report's repo, then `pnpm ingest check`. Release order matters: merge the pipeline PR first, then tag the *post-merge commit on `main`*. A tag cut on a PR branch is unreachable from `main` once the PR is squash-merged, and a git-dependency pin resolves the tag to whatever commit it points at. Check with `git merge-base --is-ancestor vX.Y.Z origin/main` before pushing the tag, and run `pnpm check-dist` before tagging. A shared pass must leave every other report's output byte-identical unless you meant otherwise, which is what the two baseline gates below are for.

`pdftotext` (poppler) is not pinned and drifts. `baseline.json` records its version so `pnpm ingest check` can say "tool drift, not a code change"; see AGENTS.md's Gotchas before reading a diff against an old committed `full.md` as a regression.

## 4. Register the report

- `reports/manifest.yaml`: `id` and `dir: ../<report-repo>`.
- `reports/registry.yaml`: `id`, `title`, `authors`, `published_at`, `source_path: reports/<id>/full.md`, `source_url`, `ingested: true`. If a report cannot meet the fidelity gate, set `ingested: false` and record why. Never weaken a check.
- `pnpm ingest aggregate` copies the report's `full.md` (and `PROCESSING.md`) into `reports/<id>/`, so a cold clone builds with no sibling checkout. Commit that copy.
- `pnpm ingest baseline <id>` pins the report's own output in its own repo; `pnpm corpus accept <id>` adds its paragraph ids to `reports/corpus-baseline.json`. Accept only after reading the diff and meaning it. For an existing report, a baseline move you did not expect is a finding, not something to accept.
- Update the `more-reports` entry in `docs/v2-features.yaml` with the date and any passes the report needed.

## 5. Plate and share card

Every published report has a plate, and `tests/plates.test.ts` fails without one, so it ships in the same change. Follow [`plates.md`](plates.md): the plate is the exhibit, never the event, taken from the report's own PDF where possible. Share cards are pre-rendered by `pnpm cards` from [`share-quotes.yaml`](share-quotes.yaml); give each quote a `match:` phrase so it can be re-found when paragraph ids move. Re-run `pnpm cards` after any re-ingest.

## 6. Write its `PROCESSING.md`

Every report should say honestly how its text was made and where it falls short. It lives in the report's repo, is copied in by `aggregate`, and is published at `/reports/<id>/processing` with a link from the report's contents page. Use [`uk-saville-inquiry/PROCESSING.md`](https://github.com/reportsthatmatter/uk-saville-inquiry/blob/main/PROCESSING.md) as the template: The edition, How the text was read, Known limitations, Reporting a problem.

- Take every number from `fidelity.md`, `corrections.yaml` and `full.md`, and check it. Do not copy counts from memory or from a chat summary.
- Write for a reader, in plain words, with no Bead ids. It is a public page.
- Two numbers are easy to get wrong. The PDF's page count is `pdfinfo`'s, and the pipeline's `pages:` counts only pages with text (Saville: 493 and 489, four being blank). And the site's page numbers are the report's *printed* pages, which differ from PDF pages by an offset (five in Saville's body); measure the offset at a few points before stating it, and say which numbering `fidelity.md` uses.
- Say what is missing. Figures are not extracted yet (see the images epic in Beads, `bd search "figures"`), so a report that has photographs or maps must list that under Known limitations.
- It ships with a **deploy**, not with `publish-report`, because it is served from the deploy's assets rather than R2.
- Add a `verify.sh` check for the new page.

## 7. Ship it

1. `./scripts/verify.sh` must exit 0. Then look at the rendered pages yourself.
2. Open a PR and squash-merge it.
3. **A report that has never been published needs a Worker deploy first** (`./scripts/deploy-cloudflare.sh`, which pre-renders), because until then it is served from `assets/generated/`. If the deploy fails with a D1 "database not found" error, wrangler is using the wrong Cloudflare account profile; this project is the `default` profile, and a directory binding in wrangler's preferences file chooses it.
4. Publish the content to R2 with `pnpm publish-report <id> --base https://reportsthatmatter.org`, which also reindexes search. See AGENTS.md, "Publishing a report".
5. Confirm production: the `x-rtm-content-version` header should be a hash, not `assets`; then `VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.
6. Run the **Changelog checklist in AGENTS.md** (entry, screenshots, hotlink, redeploy). A new report is a changelog-worthy event; a new internal doc is not.
7. Remove your worktree from the main checkout: `git worktree remove --force ../rtm-<task>`.

## 8. Record what is still not right

A report is never perfect on day one. Everything you know is wrong or unfinished goes in two places: a Bead for the work (with the report's id in the title), and the reader-facing Known limitations in `PROCESSING.md`. Do not leave it only in a chat summary. If the fix belongs in a shared pass, file it against the pipeline and say which other reports it affects (Saville's page-break paragraph splits are the same rule that splits 137 of Litvinenko's).

## Where things live

Decide where a piece of content goes by what consumes it, not by who wrote it. The READMEs and most repo docs here are written by AI agents, so "hand-written versus generated" is not a useful line between files.

| Content | Home | Why |
| --- | --- | --- |
| Agent-actionable work, status, priority | Beads | The source of truth; see AGENTS.md |
| Public issues, report candidates, discussion | GitHub issues | Human-created and public |
| How a report was processed, for readers | `PROCESSING.md` in the report's repo | The one file the site publishes per report |
| How a report is built, for maintainers | The report's README and `ingest.ts` | Read on GitHub, not published |
| OCR suspects awaiting review | `fidelity.md` (generated) and `corrections.yaml` (judgements) | Generated queue; deterministic corrections |
| How the system works | `docs/ARCHITECTURE.md` | Kept current; older plans in `docs/plans/` are history |
| What changed, for readers | `docs/CHANGELOG.md` | Published at `/changelog` |

## Worked example: the Saville PR

The publication PR for Saville Vol I ([#143](https://github.com/reportsthatmatter/reportsthatmatter/pull/143)) touched: `reports/manifest.yaml` and `registry.yaml` (registration); `reports/uk-saville-inquiry/full.md` and `reports/corpus-baseline.json` (aggregate and accept); `package.json` and `pnpm-lock.yaml` (the `@rtm/ingest` bump); `assets/marks/uk-saville-inquiry*.webp`, `docs/design/2026-09-12-imagery/sources.yaml`, `src/generated/marks.ts` (the plate); `assets/cards/uk-saville-inquiry/default.png`, `src/generated/cards.ts` (the card); `docs/v2-features.yaml` and `docs/CHANGELOG.md`. The processing notes followed in [#144](https://github.com/reportsthatmatter/reportsthatmatter/pull/144). Use the pair as a checklist of what a new report touches.
