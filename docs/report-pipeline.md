# How a report ships: the stages

A report reaches the site in stages, and each stage ships on its own. Nothing waits for a later stage, and nothing waits for Rufus's review. Read this before starting work on any report; it says which guide covers each stage and how Beads tracks where every report stands.

**Status: first version, 2026-09-26** (Rufus, 2026-09-26: "ship reports incrementally"; `reportsthatmatter-hxq`).

## The stages

| Stage | What ships | Guide | Label |
| --- | --- | --- | --- |
| 1. Text | The transcribed report on its plain contents page, with its plate and share card | [`report-preparation.md`](report-preparation.md) | `stage-text` |
| 2. Introduction | The landing page: standfirst, background, findings, reading guide, plus Rufus's highlights | [`report-introductions.md`](report-introductions.md) | `stage-intro` |
| 3. Imagery | A hero photograph of the event on the landing page, with its credit | Hero-imagery epic, `reportsthatmatter-cdp` (to be folded into `report-introductions.md`) | `stage-imagery` |

Later stages attach the same way as they are defined: processing notes (`PROCESSING.md`, `reportsthatmatter-wl0`) and figures from the PDF (`reportsthatmatter-699`).

## Rules

- **Each stage is a complete release.** Stage 1 alone is a good page: the report, readable and citable. Stage 2 is added when it is written, and stage 3 when an image is found. A report can sit at stage 1 for months.
- **Ship without waiting for review.** An introduction ships with `status: approved`; Rufus reads the live page and gives feedback later, which becomes a follow-up change. The same goes for imagery. `status: draft` stays available for work that genuinely needs a second opinion before going live.
- **Stages run in order per report, but not across reports.** An introduction needs the text to cite; an image needs a landing page to sit on. Different reports can be at different stages at once, and different agents can work on them in parallel.
- **Order within a stage is by impact.** Take the report whose next stage matters most now (a news hook, an anniversary, a launch post) first.

## Tracking in Beads

Every stage is its own Bead per report, labelled with the stage, so `bd list --label stage-intro` (or `stage-imagery`) shows where each report stands.

- **A new report** gets its stage 1 Bead (the ingest, e.g. `Ingest and publish the Chilcot Inquiry`) plus two children created at the same time: `Introduction and landing page: <report>` (`stage-intro`) and `Hero image: <report>` (`stage-imagery`). The stage 3 Bead depends on the stage 2 Bead. Beads will not let a child depend on its own parent, so a stage 2 Bead shows in `bd ready` before its text is live: check the parent is closed before starting it. Chilcot, Valukas and Duelfer (`reportsthatmatter-rcz`, `-b7z`, `-9br`) are set up this way.
- **The existing eleven reports** have been through stage 1. Their introductions are the `reportsthatmatter-g0w.7.*` Beads (Jack Smith and Wall Street shipped before those existed), and their imagery Beads are created by `reportsthatmatter-cdp.4` once the pilot settles the design.
- **Closing a stage** means it is live in production, not merged. Close the Bead after the deploy (and, for text, the `publish-report` step).
