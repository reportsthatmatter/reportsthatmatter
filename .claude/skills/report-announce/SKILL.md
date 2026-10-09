---
name: report-announce
description: Use when a report or volume has just gone live on Reports that Matter and needs announcing — the changelog entry with screenshots, a long-read post where the work taught something, and drafts for the launch thread or a new-report post. Stage 7 of the preparation pipeline; drafts only, nothing is posted externally.
---

# Stage 7: announce

**Level:** `level:specced` (Sonnet); a long-read post is `level:judgement`. Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R15).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3. **No external posting, account creation or scheduling** (AGENTS.md house rules): everything here is drafted in-repo; Rufus posts.

**Entry.** Stage 6's gate met: the report is live.

## Procedure

1. **Changelog**: work the checklist in AGENTS.md "Changelog" (dated entry in `docs/CHANGELOG.md`; screenshots to `reportsthatmatter/visual-changelog`; one hotlinked image; link to the full entry). A new report is changelog-worthy.
2. **Long read**, when the work taught something worth a reader's time (sourcing, a hard defect, the hybrid): a draft post; PR #227 is the model; the blog is `reportsthatmatter-jedz`.
3. **Social drafts**: a line for the launch thread (`reportsthatmatter-y2t.2`) or, after launch, a new-report post draft under `marketing/`, in the Appendix C format of `docs/plans/2026-08-02-launch-and-seo.md` (verbatim quote, neutral source line, deep link).
4. The `/changelog` page shows the entry only after a deploy (the integrator's).

## Exit gate

- [ ] Changelog entry merged and visible on production `/changelog`, with its image
- [ ] Post drafts committed and named in the unit's Bead for Rufus
- [ ] `reports/pipeline.yaml` row says `reached: announce`

Retro and lessons: agent protocol R13-R14.
