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
| `assets/styles.css` | The design system. Hand-written, no framework |
| `assets/share.js` | Highlight-to-share |
| `scripts/ingest/` | PDF → Markdown pipeline + fidelity checks |
| `scripts/cards.mjs` | Share cards → PNG (`pnpm cards`) |
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
images committed alongside it in that repo. It's shared across every report
repo in the org, not just this one, and is the record a future "how RTM got
built" write-up draws on; see that file's own header for the exact
convention. A `changelog.md` entry here for a visible change should link to
the matching visual-changelog entry rather than duplicate the screenshot.

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

⚠️ **Bundle limit.** Reports are bundled into the Worker script, currently
**1.19 MB gzipped against a 3 MB cap** — roughly 5–6 more reports before deploys
fail. `docs/plans/2026-08-01-architecture.md` has the plan for when it bites.

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
- Each report has its own repo under the `reportsthatmatter` org, holding the
  source PDF and a README recording where it came from. Clone it as a sibling
  directory before re-ingesting.
