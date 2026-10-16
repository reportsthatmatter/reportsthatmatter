# 0021. Should coordination live in its own factory repo?

- **Status:** decided (accepted: option (c), public)
- **Date raised:** 2026-10-16 · **Date decided:** 2026-10-16
- **Decided by:** Rufus
- **Beads:** reportsthatmatter-jcht (this decision), reportsthatmatter-re74 (create the GitHub repo; done, closed)

## Question

Agents' coordination records (session handoffs, dated agent protocols, review files, triage and backlog snapshots, command logs, scratch directories) have no home of their own. Should they live in a separate "factory" repo whose job is coordinating the work, with the site repo being the app?

## Context

Until 2026-10-16 all of this sat loose in `~/src/reportsthatmatter/` beside the repos: about 265 log files, dated `.agent-protocol-<date>.md` notes, `review-*.md` files, `next-session-prompt-*.md` handoffs and scratch directories. The supervisor could not see session history in one place, nothing was versioned, and the top level was hard to read. That day the supervisor moved it all into a new local git repo, `~/src/reportsthatmatter/factory/` (layout in its `README.md`: `handoffs/`, `protocols/`, `reviews/`, `backlog/`, and gitignored `logs/<date>/` and `scratch/`). The site repo's AGENTS.md, `docs/agent-protocol.md` and the `pr-review`, `integrate-and-ship` and `fix-agent` skills now point agents there. Git worktrees stay beside the repos they belong to, since `git worktree` records their paths.

The beads database belongs to the site repo (AGENTS.md), as do the house rules, decisions and the app's skills; none of these is in question.

## Options

(a) **Keep coordination loose in `~/src`** (the status quo before 2026-10-16). Nothing to maintain, but nothing is versioned, history is scattered, and the top level fills with files.

(b) **A local `factory/` repo only.** Versioned and tidy, and agents already write there. But it exists on one machine, so it has no backup and cannot be shared with another supervisor or machine.

(c) **`factory/` as a GitHub repo `reportsthatmatter/factory`.** Holds handoffs, dated protocols, reviews and backlog snapshots; logs and scratch stay gitignored. Backed up and shareable. (Proposed as private; Rufus chose public.) Later candidates to move there, each as its own decision: `docs/agent-protocol.md`, the supervision skills (`report-pipeline`, `pr-review`, `integrate-and-ship`) and lessons. Beads, house rules, decisions and the app's skills stay in the site repo.

## Decision

(c), **public** (Rufus, 2026-10-16): https://github.com/reportsthatmatter/factory, created and pushed that day. First step only: the existing local repo was pushed as it is and nothing moves out of the site repo yet. Whether `docs/agent-protocol.md`, the supervision skills or lessons follow is a later decision, taken once the factory has been used for a few sessions.

## Consequences

- A supervisor gets one place for session history, and the site repo stays app-focused.
- Agents working in a site worktree must find the factory: they do so through the absolute `~/src/reportsthatmatter/factory/` paths in the protocol and skills. A fresh machine clones it first: `git clone git@github.com:reportsthatmatter/factory ~/src/reportsthatmatter/factory` (AGENTS.md Layout and `docs/agent-protocol.md` say so).
- Two repos to keep in step: a rule in the site repo can name a factory path that moves. Keeping the paths in few places (AGENTS.md Layout, the protocol, three skills) limits that.
- The repo is public, like the site repo: anything committed there (handoffs, protocols, reviews, backlog snapshots) is readable by anyone, so it carries no secrets, tokens or private correspondence. Logs and scratch stay gitignored.

## Links

- https://github.com/reportsthatmatter/factory (`~/src/reportsthatmatter/factory/README.md`)
- [`docs/agent-protocol.md`](../agent-protocol.md), AGENTS.md "Layout"
