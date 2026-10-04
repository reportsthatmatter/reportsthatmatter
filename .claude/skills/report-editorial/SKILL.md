---
name: report-editorial
description: Use when preparing a report's reader-facing material on Reports that Matter after its text is ready — the introduction and reading guide, highlights and post-worthy excerpts (card true), the plate and share cards, and filing the hero image. Stage 5 of the preparation pipeline; for the introduction itself it defers to the report-introduction skill.
---

# Stage 5: introduction, highlights and excerpts

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §1-3. **The introduction is the `report-introduction` skill**, which defers to `docs/report-introductions.md`; follow it unchanged. Plate: `docs/plates.md`. Hero: `docs/hero-images.md`. The queue that consumes excerpts: `docs/posts-queue.md`.

**Entry.** Stage 4's gate met (registered, `verify.sh` green). Fast path (text ships first): only step 1 is required before stage 6; the rest follows and ships with a deploy.

## Procedure

1. **Plate and default card** (required before any publish): `docs/plates.md` recipe: an entry in `docs/design/2026-09-12-imagery/sources.yaml`, `pnpm marks <mark id>`, then `pnpm cards`; `tests/plates.test.ts` must pass.
2. **Introduction**: invoke `report-introduction`. Ship with `status: approved`.
3. **Excerpts**: in the same `editorial/<id>.yaml`, mark 3 or more `highlights` `card: true`. Each must stand alone and fit Bluesky's 300 graphemes with the source line (`"quote"\n\n— <title>, p. <n>`); `pnpm posts` never trims, it skips. Quote from `pnpm paragraphs <id> [words]`.
4. **Check**: `pnpm prerender`, `pnpm editorial`, `pnpm posts`; read the skip list for this report and replace any skipped highlight. Then `git checkout marketing/queue.yaml src/generated/editorial.ts` (the integrator regenerates both). `pnpm cards` re-renders every report's cards: commit only your report's card and its line in `src/generated/cards.ts`, and bead any other drift it shows.
5. **Hero image**: file or update the `stage-imagery` Bead (`Hero image: <report>`); it never blocks this stage.

## Exit gate

- [ ] Plate and default card built; `tests/plates.test.ts` passes
- [ ] `editorial/<id>.yaml` `status: approved`; `pnpm editorial` passes
- [ ] 3+ `card: true` highlights, none skipped by `pnpm posts` for this report
- [ ] Hero Bead exists
- [ ] `reports/pipeline.yaml` row says `reached: editorial`

**Hands on:** a site PR (editorial yaml, plate, cards). Do not commit `src/generated/editorial.ts`; the integrator regenerates it. **Gap:** `pnpm cards` renders no card per `card: true` highlight yet (f2e). Retro and lessons: protocol rules 12-13.
