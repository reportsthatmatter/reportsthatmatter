# Reports that Matter — working notes

Reports that Matter turns hard-to-access public reports into web pages that can
be read, searched, and cited by paragraph.

## The done condition

```bash
./scripts/verify.sh
```

Typecheck, unit tests, ingestion fidelity, HTTP assertions against a live
worker, then browser checks (layout, measure, overflow, permalinks, the share
popover, console errors). **A change is not finished until this exits 0.**

`scripts/init.sh` bootstraps a cold checkout and confirms the baseline.

`scripts/stop-hook.sh` is the hard gate for unattended runs — it blocks a turn
from ending while `verify.sh` fails. Opt-in via `RTM_LOOP=1`, because the full
check takes the better part of a minute and would be miserable on every turn of
an interactive session.

## Working ledger

`docs/v2-features.yaml` — one entry per feature with a `passes` flag and how it
is verified. Work one entry at a time; flip `passes` only once `verify.sh` is
green. Never edit or delete an entry to make the goal pass.

`docs/plans/2026-08-01-loop-engineering-setup.md` is the plan of record.

## Layout

| Path | What |
| --- | --- |
| `src/index.ts` | Hono routes on Cloudflare Workers |
| `src/templates/` | Page shells; `layout.ts` is the design system's HTML |
| `src/lib/markdown.ts` | Markdown → HTML, paragraph ids and permalinks |
| `assets/styles.css` | The design system. Hand-written, no framework |
| `assets/share.js` | Highlight-to-share |
| `scripts/ingest/` | PDF → Markdown pipeline + fidelity checks |
| `reports/registry.yaml` | What is published |

## House rules

- **Fixes go in the pipeline, not in its output.** Never hand-edit a generated
  `reports/*/full.md`; correct `scripts/ingest/` and re-run. That way each fix
  compounds across every future report.
- **Never weaken a fidelity check to make a report pass.** If a report cannot
  meet the gate, mark it `ingested: false` in the registry and record why. The
  checks exist to find exactly what a weakened check would hide.
- **Auto-fix only what has no other reading.** Anything merely *probably* wrong
  goes in the review queue (`reports/<id>/fidelity.md`), not into the text.
  Whether a scan was read faithfully is a human judgement; don't launder it
  into a score.
- **Don't modify tests to make them pass** — fix the code. (Do fix tests whose
  fixtures are unrealistic; several early ones were.)
- Work on a branch; don't rewrite `main`.
- No external posting, account creation, or scheduling. Campaign material is
  drafted in-repo only.
- Stop and report if `verify.sh` fails the same way three times running.

## Design

Pared-down editorial, after costarastrology.com: off-white `#f7f7f7` canvas,
mid-grey ink rather than black, classical serif for substance, uppercase mono
for chrome, sharp corners, hairline rules, large whitespace. Tokens live at the
top of `assets/styles.css`. EB Garamond / Inter / IBM Plex Mono stand in for
Romana and Akkurat, which are licensed.

## Deploy

Blocked pending credentials. The only token on the machine
(`~/.config/cloudflare/apikey-edit-zones`) is scoped to a different Cloudflare
account and has no Workers permission. Needs `pnpm wrangler login` on the
account owning `reportsthatmatter.org`, or a token with Workers Scripts: Edit.
Until then the loop stops at "verified locally".

## Gotchas

- `wrangler dev` answers `/health` before the bundle finishes building. Wait for
  real page content before asserting on it.
- Don't pipe `curl` into `grep -q` under `set -o pipefail`: grep exits on first
  match, curl dies of SIGPIPE, and a passing check reports as failed on any
  large response. Fetch to a file.
- The `vitest` key in `package.json` is not read by vitest. Config lives in
  `vitest.config.ts`.
- Reports are bundled into the worker as text modules. Watch the bundle size as
  more are added.
