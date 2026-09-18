# Beads Sole Entry Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired GitHub issue #77 from active onboarding and make the central Beads database the documented sole source for project work and blockers.

**Architecture:** Keep task state in the existing Beads database owned by `reportsthatmatter/reportsthatmatter`; do not create databases in report or pipeline repositories. Active documents point to `bd ready`, while historical plans retain their contemporaneous #77 references. Human-required work is modeled as a labelled dependency so blocked work disappears from the ready queue for an inspectable reason.

**Tech Stack:** Markdown, YAML comments, Beads CLI, GitHub CLI, repository verification shell script.

## Global Constraints

- The central `reportsthatmatter/reportsthatmatter` repository owns the only Beads database.
- Individual report repositories and `ingest` do not receive `.beads` databases.
- Historical plans/specifications and generated report content remain unchanged.
- `needs-user` is used only for an exact user decision or action that genuinely blocks work.
- A `needs-user` Bead must be an explicit dependency of every Bead it blocks.
- Do not maintain a second active task list outside Beads.

---

### Task 1: Replace active #77 onboarding

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/v2-features.yaml`
- Modify: `docs/beads-sync.md`

**Interfaces:**
- Consumes: the existing `bd ready` workflow and central embedded Dolt database.
- Produces: one consistent onboarding path and an explicit `needs-user` blocking convention.

- [ ] **Step 1: Capture the failing documentation audit**

Run:

```bash
rg -n -i 'issue #77|START HERE|start here' \
  AGENTS.md CLAUDE.md README.md docs/ARCHITECTURE.md docs/ROADMAP.md \
  docs/v2-features.yaml docs/beads-sync.md
```

Expected: matches in the first six files, proving active onboarding still points to the retired issue.

- [ ] **Step 2: Update the active guidance**

Apply these rules:

- `AGENTS.md`: lead with `git pull`, `bd dolt pull`, and `bd ready`; document central repository ownership and the four-step `needs-user` dependency convention.
- `CLAUDE.md` and `README.md`: point to `AGENTS.md` and `bd ready`, not issue #77.
- `docs/ARCHITECTURE.md`: name Beads alone for next work.
- `docs/ROADMAP.md`: point returning contributors to `bd ready`; keep the roadmap as idea rationale, not active state.
- `docs/v2-features.yaml`: remove the START HERE block and describe the file as a historical/product ledger subordinate to Beads for active state.
- `docs/beads-sync.md`: state that the central app repository owns the database, cross-repository work remains in it, and human blockers use `needs-user` plus dependencies.

- [ ] **Step 3: Run the focused audit**

Run:

```bash
rg -n -i 'issue #77|START HERE|start here' \
  AGENTS.md CLAUDE.md README.md docs/ARCHITECTURE.md docs/ROADMAP.md \
  docs/v2-features.yaml docs/beads-sync.md
```

Expected: no matches and exit status 1.

- [ ] **Step 4: Verify historical references were preserved**

Run:

```bash
rg -n 'issue #77|#77' docs/superpowers docs/plans reports/us-911-commission/full.md
```

Expected: historical/design references and report-content flight-number references still exist.

- [ ] **Step 5: Commit the guidance migration**

```bash
git add AGENTS.md CLAUDE.md README.md docs/ARCHITECTURE.md docs/ROADMAP.md \
  docs/v2-features.yaml docs/beads-sync.md
git commit -m "docs: make Beads the sole work entry point"
```

### Task 2: Verify and close the migration Bead

**Files:**
- Generated/exported by Beads in the central checkout: `.beads/issues.jsonl`, `.beads/interactions.jsonl`

**Interfaces:**
- Consumes: Task 1's documentation and closed GitHub issue #77.
- Produces: verified repository state and closed Bead `reportsthatmatter-23u`.

- [ ] **Step 1: Confirm GitHub issue #77 is closed**

Run:

```bash
gh issue view 77 --repo reportsthatmatter/reportsthatmatter --json state --jq .state
```

Expected: `CLOSED`.

- [ ] **Step 2: Run the full repository gate**

Run:

```bash
./scripts/verify.sh
```

Expected: exit status 0 and `All checks passed.`

- [ ] **Step 3: Record completion in the central Beads database**

From `/Users/rgrp/src/reportsthatmatter/reportsthatmatter`:

```bash
bd update reportsthatmatter-23u --append-notes "Implemented on chore/beads-entrypoint; active onboarding now uses bd ready and documents central ownership plus needs-user dependencies."
bd close reportsthatmatter-23u --reason "Issue #77 retired; active guidance migrated and verified."
bd dolt push
```

- [ ] **Step 4: Export and commit Beads interchange files on the integration branch**

Run `bd export` if the close did not update the tracked JSONL automatically, copy only the resulting tracked JSONL changes into the integration branch, inspect the diff for `reportsthatmatter-23u`, and commit:

```bash
git add .beads/issues.jsonl .beads/interactions.jsonl
git commit -m "chore: close Beads entry-point migration"
```

- [ ] **Step 5: Proceed to the highest-priority in-progress Bead**

Run:

```bash
bd ready
bd show reportsthatmatter-agk
```

Expected: the migration Bead is closed; the P0 Challenger OCR review remains the next in-progress project task.
