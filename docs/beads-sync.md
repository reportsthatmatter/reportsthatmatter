# Beads sync

The central `reportsthatmatter/reportsthatmatter` repository uses Beads with an
embedded Dolt database. This is the only project Beads database: work remains
in this queue when its implementation lands in a sibling report repository or
in `ingest`. Do not initialize Beads separately in those repositories.

The shared database is synchronized through this repository's GitHub-backed
Dolt remote; the optional JSONL export is for inspection, viewers, and
interchange, not for backup or cross-machine sync.

## Start a session

```bash
git pull
bd dolt pull
bd ready
```

## Choose and record work

Run `bd ready` to find unblocked work; priority determines the order within
that queue. Do not keep a separate `NEXT.md` or `next` label. Create a Bead
before starting any agent-actionable task, use labels for domain grouping and
dependencies only for genuine blockers, and set `--external-ref` when the task
has a related GitHub issue. Keep public discussion, report candidates, and
broad epics on GitHub until there is a concrete task to perform.

When a task genuinely requires Rufus's decision or action, create a separate
Bead labelled `needs-user`. State the exact request and unambiguous acceptance
criteria, then make it a dependency of every task it blocks:

```bash
bd create "Decision or action needed" --labels needs-user \
  --description "Exact request and why it is required" \
  --acceptance "Observable condition that resolves the request"
bd dep <needs-user-id> --blocks <blocked-id>
```

Do not use the label for optional feedback or when work can safely continue
under a reasonable assumption.

## Work with issues

```bash
bd ready
bd create "Short issue title"
bd update reportsthatmatter-abc123 --claim
bd close reportsthatmatter-abc123 --reason "Implemented"
```

## End a session

```bash
bd dolt push
git add -A
git commit -m "Describe the work"
git push
```

The repo-local hooks also pull after merges and branch switches, and start a
non-blocking Dolt push during `git push`. Run `bd dolt push` explicitly when
you need to confirm synchronization; hook output is in the ignored
`.beads/dolt-*-log` files.

## Fresh clone or new machine

```bash
git clone git@github.com:reportsthatmatter/reportsthatmatter.git
cd reportsthatmatter
bd context
bd dolt remote list
bd dolt pull
bd status
```

If Beads reports that the database is not initialized, confirm that the clone
contains `.beads/config.yaml` and `.beads/metadata.json`, then run:

```bash
bd bootstrap
bd dolt pull
```

Do not re-run `bd init` over an existing Beads setup.

## Troubleshooting

Inspect state before attempting recovery:

```bash
bd context
bd dolt remote list
bd dolt status
git status --short --branch
```

Then retry:

```bash
git pull
bd dolt pull
bd dolt push
```

If machines changed Beads concurrently, resolve the conflict through the
Beads/Dolt workflow. Do not delete `.beads/`, remove the remote, or force
reinitialize as a first response. Offline work can continue locally and sync
can be retried when connectivity returns.

For this embedded mode, `bd doctor` is not yet supported. `bd config validate`
validates the separate federation backend and may warn about a missing
`federation.remote`; that warning does not mean the GitHub-backed
`sync.remote` is incorrect.
