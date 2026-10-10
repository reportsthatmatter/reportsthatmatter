---
name: report-announce
description: Use when a report or volume has just gone live on Reports that Matter and needs announcing — the changelog entry with screenshots, a long-read post where the work taught something, and drafts for the launch thread or a new-report post. Stage 7 of the preparation pipeline; drafts only, nothing is posted externally.
---

# Stage 7: announce

**Level:** `level:specced` (Sonnet); a long-read post is `level:judgement`. Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R16).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3. **No external posting, account creation or scheduling** (AGENTS.md house rules): everything here is drafted in-repo; Rufus posts.

**Entry.** Stage 6's gate met: the report is live. **Before the launch (`reportsthatmatter-y2t.6`)** every live report is announced together by the launch (`reports/pipeline.yaml` header): do step 1 only and leave the row at `reached: publish`, `state: waiting`.

## Procedure

1. **Changelog**: work the checklist in AGENTS.md "Changelog": a dated entry in `docs/CHANGELOG.md` (the integrator's record PR often adds it: check first); screenshots of the landing page and one section committed to `reportsthatmatter/visual-changelog` (`../visual-changelog`, a dated directory, conventions in its `CHANGELOG.md` header); one hotlinked image and a link to that entry in the changelog entry. A new report is changelog-worthy.
2. **Long read**, when the work taught something worth a reader's time (sourcing, a hard defect, the hybrid): `content/posts/<slug>.md` with `status: draft` on a branch with a PR (AGENTS.md "Layout", the blog row). Rufus publishes it.
3. **Social drafts**: the report's excerpts are already queued (stages 5 and 8). Before launch: a line for the launch thread (`reportsthatmatter-y2t.2`, which keeps the report count). After launch: one new-report post draft in the marketing repo (`../marketing/drafts/`, a PR there), in the Appendix C format of `docs/plans/2026-08-02-launch-and-seo.md` (verbatim quote, neutral source line, deep link, 300 graphemes).
4. The `/changelog` page shows the entry only after a deploy (the integrator's). Not there yet: note "changelog awaiting deploy" in the unit bead and leave that gate item open.

## Exit gate

- [ ] Changelog entry merged and visible on production `/changelog`, with its image
- [ ] Post drafts committed and named in the unit's Bead for Rufus
- [ ] your PR sets the unit's `reports/pipeline.yaml` row to `reached: announce` (if it is already at a later stage, leave it)

Retro and lessons: agent protocol R13-R14.
