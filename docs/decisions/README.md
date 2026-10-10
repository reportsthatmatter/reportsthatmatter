# Decision log

One file per question we have had to answer, or still have to. It is written so that someone joining later can see what was decided, why, by whom and when, and which questions are still open. Bead for keeping this current: `reportsthatmatter-82v3`.

**Rule:** when a question comes up in a session, add a record here and a bead labelled `decision`. Don't settle it in chat. Open questions stay open until Rufus (or whoever owns the area) decides; then update the record and close the bead.

**Statuses:** `open` (nobody has answered it), `proposed` (a recommendation awaits sign-off), `decided`, `superseded` (link to the replacement).

**Template:** copy `0000-template.md`.

**Numbering:** a record is `docs/decisions/NNNN-<slug>.md`, and `NNNN` is the next free number on `origin/main` *when you open the PR* (`pnpm decisions next`; look at `git ls-tree origin/main docs/decisions/` after a `git fetch`). If main takes that number before you merge, rebase and renumber: rename the file and its `# NNNN.` title and fix the references to it. `tests/decisions.test.ts` (in `pnpm test`, so in CI) fails on two records with one number and on a title that disagrees with its file name, so the renumber happens before merge. A number is permanent once merged: other repos cite it (ingest's README cites 0016).

**Index:** generated, not committed, so no PR edits a shared table (rows added by parallel PRs conflicted at every integration, reportsthatmatter-d4es). Run `pnpm decisions` for the table of number, question, status and bead, read off each record's title, `Status` and `Beads` lines (the bead marked "(this decision)" if there is one, else the first). Keep those lines accurate.
