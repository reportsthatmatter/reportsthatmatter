# Loop engineering setup for RTM V2

**Date:** 2026-08-01
**Status:** decisions resolved 2026-08-01 (§5); ready to build once D3 design direction is confirmed
**Goal of this doc:** define what has to exist before Claude can run unattended on RTM V2 for hours, and what specification is needed from Rufus to make that safe and productive.

---

## 1. Where the repo actually is (verified 2026-08-01)

Last commit `91004c7`, 2026-01-13. Working tree clean, on `main`.

**What works / exists:**

- Hono worker on Cloudflare Workers (`src/index.ts`), TypeScript, wrangler 4.
- Routes: `/health`, `/`, `/reports`, `/reports/:id`, `/assets/*`.
- YAML registry (`reports/registry.yaml`) → markdown source → `markdown-it` render → templated HTML.
- Markdown renderer emits paragraph ids (commit `b09bc65`) — the substrate for paragraph permalinks.
- Themed layout (`src/templates/layout.ts`): Tailwind via CDN, Cormorant Garamond + Manrope.
- 5 vitest suites: `health`, `registry`, `markdown`, `source`, `routes`.
- Deploy script `scripts/deploy-cloudflare.sh`; plan at `docs/plans/2026-01-13-deploy-cloudflare.md`.
- One report end-to-end: US Senate *Wall Street and the Financial Crisis*.

**What is missing / broken:**

| Gap | Detail |
| --- | --- |
| No green baseline | `node_modules` absent; `pnpm` not on PATH (reachable via `npx pnpm@10`, and `npm i -g pnpm` would work — `/opt/homebrew/lib/node_modules` is writable). **`pnpm test` cannot run today.** |
| Jack Smith report not ingested | Only `jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf`. No markdown, not in registry. This is the flagship launch asset. |
| Highlight-to-share unbuilt | ROADMAP Chunk 3. Paragraph ids exist; the selection → canonical-link UI does not. |
| Not live | `v2.reportsthatmatter.org` route never confirmed. `/health` unverified in prod. |
| No `CLAUDE.md` | No project-level house rules for the agent. |
| Stale branches | `v2`, `theme-homepage`, `reset-hono` + two stale worktrees in `.worktrees/`. |
| No verification beyond unit tests | Nothing asserts a rendered page is correct end-to-end. |

**Environment confirmed:** session is running `claude --dangerously-skip-permissions` (PID 93589). Network reachable from the sandbox (npm registry PONG). So permissions are *not* the blocker.

---

## 2. What loop engineering actually is, and why the repo isn't ready for it

Loop engineering is the move from *"you prompt, the agent answers"* to *"a system prompts the agent, the agent checks its own work, and it repeats until a condition holds."* The prompt stops being the artifact; the **loop** is the artifact.

The load-bearing insight: **a loop is only as good as its stopping condition.** An agent with a vague goal doesn't stop — it drifts, declares premature victory, or burns hours polishing the wrong thing. Anthropic's own guidance on long-running harnesses ([Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) names the failure modes directly: declaring victory prematurely, attempting too much per session, leaving buggy undocumented code, and wasting time on environment setup.

So the pre-conditions for an unattended run are:

1. **A machine-checkable done condition.** One command, exit code 0 or not. Today RTM has none that even executes.
2. **A green baseline + `init.sh`.** A fresh context must reach "everything passes" in one command, so it can tell *its own breakage* from *pre-existing breakage*.
3. **A durable ledger.** Context gets compacted; a file does not. Granular items with an explicit pass/fail field, plus a progress log.
4. **Pre-decided decisions.** Every genuinely open product/design question must be answered in advance or given a default rule. Ambiguity is what makes a loop either stall or invent.
5. **Guard rails.** An explicit list of what the loop must never do. With `--dangerously-skip-permissions` there is no human veto mid-run, so the veto has to be written down beforehand.

RTM currently has 0 of the 5. That's the work below.

---

## 3. Mechanisms available in this install (Claude Code 2.1.220)

| Mechanism | What it gives | Fit for RTM |
| --- | --- | --- |
| `/goal <condition>` | Persistent goal across many autonomous turns; an independent checker re-verifies the condition after each turn and the run continues until it holds. | **Primary.** This is the "keep going until done" primitive. |
| `/loop [interval] <prompt>` | Re-fires a prompt on a schedule (or self-paced). | Secondary — good for a nightly sweep, wrong for one continuous build. |
| **Stop hook** | Shell script that blocks the turn from ending unless it exits 0. | **Strongest guarantee.** Wire it to `scripts/verify.sh` so the agent physically cannot stop on red. |
| Subagents + git worktrees | Parallel independent tracks with isolated context. | Useful once V2 splits into content-ingestion vs. feature work (pattern already used in Jan). |
| Background Bash | Long-lived `wrangler dev` for end-to-end checks. | Needed for smoke tests. |
| Memory dir | Already provisioned for this project. | Cross-session preferences. |

Recommended combination: **`/goal` for direction + a Stop hook for the hard gate + a YAML ledger for state.** `/goal` alone can be talked out of stopping; a Stop hook cannot.

---

## 4. Proposed setup (the actual build)

### Phase 0 — Green baseline (~20 min, no decisions needed)

- `npm i -g pnpm` (or pin via `packageManager` in `package.json`), `pnpm install`, `pnpm test` → green.
- Delete stale worktrees `.worktrees/reset-hono`, `.worktrees/theme-homepage`; prune merged branches.
- Commit the lockfile state so a fresh clone is reproducible.

**Exit criterion:** `pnpm install && pnpm test` exits 0 from a clean checkout.

### Phase 1 — The harness

Four new files. This is the whole loop infrastructure.

**`scripts/init.sh`** — bootstrap + orient. Installs deps, runs tests, starts `wrangler dev` in background, curls `/health`. A fresh context runs this first, every session.

**`scripts/verify.sh`** — *the* done condition. Exits non-zero if anything is wrong:
```
tsc --noEmit          # typecheck
pnpm test             # unit suites
wrangler dev &        # boot the worker
curl /health          == "ok"
curl /                contains each registry report title
curl /reports/<id>    returns 200 and contains expected first-paragraph text
curl /reports/nope    returns 404
```
The HTTP smoke checks matter more than the unit tests — they're what stops "the tests pass but the page is blank."

**`docs/v2-features.yaml`** — the ledger. Structured, not prose, so it survives compaction and can't be quietly reinterpreted:
```yaml
- id: jack-smith-markdown
  desc: Volume 1 converted to clean markdown in reports/jack-smith-vol1/full.md
  verify: file exists, >100k chars, no PDF artifacts (page numbers, hyphen breaks)
  passes: false
- id: jack-smith-registered
  desc: report resolves at /reports/jack-smith-vol1 with 200
  verify: scripts/verify.sh smoke check
  passes: false
- id: paragraph-permalinks
  ...
```
Rule for the loop: **one feature per iteration**, flip `passes` only after `verify.sh` is green, never edit or delete a feature to make it pass.

**`CLAUDE.md`** (repo root) — house rules the agent reads automatically: the verify command, the ledger location, the commit convention, and the guard rails from §6.

### Phase 2 — Hard gate

`.claude/settings.json` Stop hook → `scripts/verify.sh`. The turn cannot end red.

### Phase 3 — Run it

```
/goal every item in docs/v2-features.yaml has passes: true and scripts/verify.sh exits 0
```
Working one feature per iteration, committing after each, appending to `docs/PROGRESS.md`.

---

## 5. Decisions (resolved 2026-08-01)

**D1 — V2 "done" = (c).** Jack Smith Vol 1 live with paragraph permalinks + themed homepage + highlight-to-share + deployed and verified on `v2.reportsthatmatter.org`.

**D2 — Ingestion is a first-class tool, not a one-off.** Confirmed: the PDF→Markdown converter *and* its fidelity test suite are general tooling we will reuse for every future report. Promoted to its own workstream — see §6.

**D3 — Design: open, exemplar-led.** The 10 files in `design-experiments/site/` were "ok to good, not great". The approach is to find exemplar sites to imitate rather than design from scratch. Working candidate: **[costarastrology.com](https://www.costarastrology.com/)** — its pared-down look suits long-form reports. Rufus to review and give feedback before this becomes loop work. **Not in the first loop run.**

**D4 — Deploy: wanted, currently blocked.** See §5.1 — the available credential cannot deploy. Fix is small and manual (one command from Rufus).

**D5 — Tailwind:** stay on CDN for now; revisit if/when the design direction changes (a design rebuild is the natural moment to add a build step).

**D6 — Marketing: draft, don't publish.** The loop *may* develop the campaign outline and write the first posts as drafts in the repo. It must not create accounts, post, or schedule anything.

**D7 — Guard rails: relaxed.** Machine is sandboxed. Retained minimum: don't rewrite `main` history, don't edit the feature ledger to make the goal pass, don't modify tests to make them pass, and stop-and-report after 3 identical consecutive `verify.sh` failures.

### 5.1 Cloudflare deploy — credential audit (done 2026-08-01)

Found exactly one credential: `~/.config/cloudflare/apikey-edit-zones` (53 chars). No wrangler OAuth config (`~/.wrangler/`, `~/Library/Preferences/.wrangler/` both absent), no `CLOUDFLARE_*` env vars.

Tested against the Cloudflare API:

| Check | Result |
| --- | --- |
| `/user/tokens/verify` | valid and active |
| `/accounts` | **empty** — no account-level access |
| Zones visible | 43, all under `Office@artearthtech.com's Account` |
| `reportsthatmatter.org` in that list | **no** |

**Conclusion: I cannot deploy unattended.** Two independent blockers — the token is scoped to the wrong Cloudflare account (Life Itself / artearthtech, not whoever owns `reportsthatmatter.org`), and it is a *zone-edit* token with no account scope, so it could not create a Worker even on the right account.

**To unblock (Rufus, one of):**

1. **Interactive OAuth (simplest):** `! pnpm wrangler login` in this session, on the account that owns `reportsthatmatter.org`. Persists to `~/.wrangler/`; everything afterwards is unattended.
2. **Scoped API token (better for repeat/unattended use):** mint on the owning account with
   - Account → **Workers Scripts** → Edit
   - Account → **Account Settings** → Read
   - Zone (`reportsthatmatter.org`) → **Workers Routes** → Edit
   
   Save to `~/.config/cloudflare/rtm-workers-deploy`; the deploy script reads it into `CLOUDFLARE_API_TOKEN`.

Until then the loop stops at "verified locally" and leaves deploy as the one manual step.

### 5.2 Cloudflare Pages / "projects.dev" — side issue, resolved

Reading this as Cloudflare Pages / Workers Projects. **Nothing to do.** Cloudflare is folding Pages into Workers — all new capability lands on Workers only, and Cloudflare's own 2026 recommendation for new projects is Workers with static assets. RTM is *already* a Worker with a static-assets binding (`wrangler.toml` `[assets]`), i.e. exactly the target architecture. No migration, no change.

---

## 6. Workstream A — the report ingestion pipeline (D2)

The reusable piece. This is the part we build once and use for every report.

### 6.1 What the source actually looks like (measured 2026-08-01)

`pdftotext -layout` on Jack Smith Vol 1:

- **174 pages, 428,522 chars**, clean UTF-8, **zero replacement characters**.
- Body prose quality is **good** — 2 OCR-suspect tokens in the whole document (`in tum` → `in turn`).
- **Footnote and citation text is markedly worse.** Small-font OCR degrades badly. Real examples from p.30: `So Help 1\;fe Godp. 451` (→ `So Help Me God p. 451`), `1v!e` (→ `Me`), `0 1/04/2021` (→ `01/04/2021`), `11: 15` (→ `11:15`).
- Structural furniture to strip: bare page-number footer lines, running headers, and per-page footnote blocks that must be lifted into endnotes.

**The key insight for the tool: fidelity risk is concentrated in footnotes and citations, not body prose.** The pipeline should treat them as two different problems with two different quality bars.

### 6.2 Pipeline shape

```
PDF → extract (pdftotext -layout) → strip furniture → detect structure
    → lift footnotes to endnotes → normalise → Markdown + front-matter
```

Deterministic and re-runnable: same PDF in, same Markdown out. No hand-editing of output — every fix goes into the tool, so it compounds across reports.

### 6.3 The fidelity test suite

This is what makes the loop trustworthy, and the reason D2 can be automated at all. Layers:

1. **Structural invariants** (cheap, exact): no page-number-only lines; no running headers; footnote count in ≙ endnote count out; no `\f`; heading hierarchy well-formed; no orphaned footnote markers.
2. **Lossless-content check:** normalised body text of the output is a subset of the extracted source — catches silent dropping of paragraphs, the failure mode most likely to go unnoticed.
3. **Round-trip word-count deltas** per page, with a tolerance band; anything outside it is flagged rather than silently accepted.
4. **OCR-suspect detector:** dictionary + pattern scan for the known confusions (`rn`↔`m`, `l`↔`1`, `O`↔`0`, stray spaces inside dates/times), reported as a ranked list with page refs. Auto-fix only the unambiguous ones; the rest surface for review.
5. **Golden fixtures:** a handful of pinned page-ranges with hand-verified expected Markdown, so regressions in the tool are caught immediately.

Layers 1–3 are pass/fail and belong in `verify.sh`. Layer 4 produces a **report, not a gate** — a fidelity score plus a review queue, because "is this faithful?" is ultimately a human judgement and the honest move is to surface it rather than pretend a threshold settles it.

---

## 7. Guard rails (reduced per D7)

- Don't rewrite or force-push `main`; work on a branch.
- Don't edit or delete entries in `docs/v2-features.yaml` to make the goal pass.
- Don't modify tests to make them pass; fix the code.
- No external posting, account creation, or scheduling (drafts in-repo only).
- Stop and report if `verify.sh` fails the same way three iterations running.

---

## 8. Tooling available (verified 2026-08-01)

- `pdftotext` (poppler) at `/usr/local/bin` — extraction works, quality measured in §6.1. No `pdfinfo`, `qpdf`, `mutool`, or `ghostscript`; none needed so far.
- **Playwright Chromium** already installed (`~/Library/Caches/ms-playwright/chromium-1228` + headless shell) — usable for end-to-end page verification in `verify.sh`, and for capturing design exemplars for D3.
- `pnpm` reachable via `npx pnpm@10`; `npm i -g pnpm` also works (`/opt/homebrew/lib/node_modules` is writable).
- Network reachable from the agent sandbox.

---

## 9. Sources

- [Effective harnesses for long-running agents — Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Loop Engineering — Addy Osmani](https://addyosmani.com/blog/loop-engineering/)
- [AI Loop Engineering: /goal + Routines — sabrina.dev](https://www.sabrina.dev/p/loop-engineering-claude-code-goal-routines)
- [Loop Engineering: Build Agent Loops in Claude Code](https://www.kunalganglani.com/blog/loop-engineering-agent-loops)
- [How the agent loop works — Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/agent-loop)
