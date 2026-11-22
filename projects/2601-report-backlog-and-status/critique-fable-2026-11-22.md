# Critique of the SCQ (Fable, 2026-11-22)

A critique of [the SCQ](../2601-report-backlog-and-status.md) by a Fable agent, read-only, written before the plan. Kept as input to the plan; not a decision record.

## 1. Wrong, missing, or misdirecting (ranked)

1. **"One sequence of states" is already false in practice, and the Question bakes it in.** Promote precedes announce for Duelfer I and Covid I (queued, never announced); 13 live units sit "waiting" on the launch (y2t.6) for announce; the fast path ships before editorial; Stern has six rows for one scope. Ask for *one record and one view*, not one linear sequence. Announce is a dated event, promote is a derived fact from `marketing/queue.yaml`; neither is a status a unit "reaches".
2. **The record is drifting into a shipping log.** Stern's six batch rows share one bead and one scope; they are work increments, not status. The tree's first question ("report or unit?") must also settle "is a row a volume or a batch?" or the file keeps growing one row per PR.
3. **The 17 check problems are mostly a gate retrofitted after shipping** (10 × `repo.reference-manifest`, added later; 3 × registry/adjudicated on HTML-sourced reports). This is inside "how it stays true", not outside scope: a view that shouts 17 problems is ignored. The plan needs a policy (gate dated, or `legacy:` waiver) before the check can be a hard error.
4. **Proposed states invent a second vocabulary** (inbox, triaged, markdown done, checked, introduction done) over the nine `reached` values that `pipeline-status.ts`, eight skills and tests already use. Renaming breaks code for no gain; map Rufus's words in the view labels only.
5. **Weak citation**: the Jan 2026 good-reports brief is a one-off flagship pick for Twitter. The real triage test is the epic gqsy's five scores (interest, source, size, licence, hook); cite that.
6. **Missing**: "what to take next" needs an ordering; the record has none (ranks live in bead titles). Missing too: AGENTS.md lines 72-73 and `docs/report-preparation.md` §1 say candidates live in GitHub issues; `docs/v2-features.yaml` `more-reports`; `docs/INBOX.md`/`PROGRESS.md` to delete. GitHub issues are the only public intake (readers), which the owner rules do not forbid.

## 2. Open choices

- **Unit tracked**: keep the row = report id + scope (a volume set), one row per scope, not per batch; report-level status is derived (live if any unit at publish+). Reason: the check and `as31` already assume this; the registry's `volumes:` carries completeness.
- **Where it lives**: `reports/pipeline.yaml`, candidates as `reached: candidate` rows (sketch C). Reason: three such rows exist already, the check is quiet on them, and a second file duplicates registry identity fields.
- **Quick capture**: a GitHub issue with a `candidate` label and a short template is the inbox (phone, email, readers all work); an agent triages it into a YAML row with `issue: N`, and the issue closes when the row lands. Reason: no commit needed to capture; "inbox" never clutters the record.
- **View**: `pnpm pipeline status --board` grouped by report, candidates at the bottom with scores; `as31` later renders the same data. Reason: one source, no Markdown page to drift.
- **Stays true**: owner updates its row in the gate PR (existing rule); check becomes an error in `verify.sh` once legacy gaps are waived by policy; a `score:` field and row order give "next". Reason: nothing new to run.

## 3. Traps

- Rebuilding stage names or gates (off the table, but the proposed states do it by the back door).
- Keeping "inbox" in YAML: every stray idea becomes a committed row.
- Treating announce as per-unit before the launch; show "live" vs "announced" and move on.
- Letting `as31` (public page) or the backlog research leak into this plan.
- Migrating 25 candidate beads by hand without closing them with "moved to pipeline.yaml"; retire `candidate`/`candidates`/`stage-text` labels, and re-point `bead:` on rows to work beads only.
- Leaving the check as a warning: drift returns in a month.
