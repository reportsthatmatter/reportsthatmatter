# Beads work-tracking migration

## Purpose

Replace the hand-maintained `NEXT.md` queue with Beads as the source of truth
for work that an agent can take on. Avoid duplicating the older, public, or
human-oriented GitHub backlog.

## Ownership

| Information | Canonical location |
| --- | --- |
| Agent-actionable task detail, status, priority, dependencies, and acceptance criteria | Beads |
| What can be started now | `bd ready` |
| Public discussion, human-created requests, report candidates, broad epics, and historical context | GitHub issues |
| House rules and the workflow | `AGENTS.md` |
| Sync and recovery commands | `docs/beads-sync.md` |

Every new task an agent can undertake gets a Bead, including a task that has a
related GitHub issue. The Bead links to that issue through its external
reference; it contains the current operational detail and acceptance criteria,
not a wholesale copy of discussion history.

`bd ready` and Bead priority replace any separate `next` label or static list.
Dependencies are recorded only when work is genuinely blocked.

## Initial migration

Create six Beads from the current actionable queue:

| GitHub issue | Bead purpose | Initial priority | Labels |
| --- | --- | --- | --- |
| #122 | Review and resolve the OCR suspect queues, starting with Challenger | P0 | ingestion, editorial |
| #121 | Make per-chapter footnote identities safe for Leveson | P1 | ingestion, footnotes |
| #125 | Recover structural headings for Hillsborough | P2 | ingestion, headings |
| #123 | Make remote D1 search-index application reliable | P2 | deploy, search |
| #102 | Establish a safe extraction path for FCIC digits | P2 | ingestion, extraction |
| #104 | Address remaining footnote recall and heading-quality cases | P3 | ingestion, footnotes |

Each Bead will link to its GitHub issue and include concise acceptance criteria
derived from the current issue description. No existing GitHub issue is closed,
rewritten, or imported wholesale. Report-candidate issues, launch work,
imagery awaiting direction, and architectural discussion remain GitHub-only
until there is a specific agent task to perform.

## Repository changes

- Delete `NEXT.md`; it no longer carries live priority or project state.
- Update `AGENTS.md` to direct agents to synchronize Beads, inspect `bd ready`,
  create/update Beads for actionable work, and use GitHub only for the scoped
  categories above.
- Update `docs/beads-sync.md` with queue and task-management conventions.
- Preserve historical references to `NEXT.md` in completed plans.

## GitHub update

Update GitHub issue #77's onboarding text so it sends people to `AGENTS.md`
and `bd ready`, not the deleted `NEXT.md`. This is the only external write in
the migration and is explicitly authorized.

## Verification

- `bd ready` shows the unblocked seed work in priority order.
- `bd list` shows all six Beads with their GitHub external references, labels,
  priorities, descriptions, and acceptance criteria.
- `bd dep cycles` reports no dependency cycle.
- `bd dolt push` succeeds after the Bead writes.
- `git diff --check` succeeds, `NEXT.md` is absent, and all repository links
  to it are either removed or deliberately historical.
- `./scripts/verify.sh` exits 0 because the change affects repository
  instructions and tracking, not application behavior.
