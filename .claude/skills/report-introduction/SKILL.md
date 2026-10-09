---
name: report-introduction
description: Use when writing, revising or reviewing a report's introduction / landing page on Reports that Matter — any editorial/<report-id>.yaml (why it matters, background, findings, reading guide, highlights), or when asked for a "summary", "overview", "intro" or "landing page" for a report.
---

# Writing a report introduction

**Level:** `level:judgement` (Opus). Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R16).

The approach lives in **`docs/report-introductions.md`**. Read it in full before writing anything; it is the single source, and this skill only makes sure it is followed.

The non-negotiables, in brief:

1. **Two parts only.** The summary (`why_it_matters`, `background`, `findings` with 3–4 quotations) and the reading guide. No highlights or passages section on the page. `highlights` go to the marks table when the integrator runs `pnpm seed-highlights --remote` after the deploy; never run it yourself.
2. **Every quotation verbatim, as rendered.** Copy from `pnpm paragraphs <id> [words]`, never from the PDF. `pnpm editorial` must pass. Never "fix" a quote; pick another passage.
3. **Quotations must stand on their own.** Quote whole sentences, with enough of the paragraph to make sense without it.
4. **Neutral, attributed, verified.** No judgment adjectives. Write "the report finds". Record the other side where the report prints it. Verify every background fact that is not in the report; if you can't, leave it out.
5. **Ship approved.** Set `status: approved` and ship; Rufus reviews the live page later (2026-09-26). The introduction is stage 2 of `docs/report-pipeline.md`: it never waits for imagery (stage 3), and a hero image is its own Bead, done per `docs/hero-images.md`.

Start from `editorial/jack-smith-vol1.yaml` as the reference shape. Work the checklist at the end of the guide before calling it done.

Checks the tools do not make:

- `pnpm editorial` checks `excerpt` and `highlights` quotations only. A quotation inside a finding's `text`, a `why` or the background is checked by hand with `pnpm paragraphs <id> <words>`.
- A number the report does not print ("eleven recommendations") is counted from the report and the count's source noted in a yaml comment, or not stated.
- A highlight must stand alone: it names its subject (no opening "he", "His response"), as a card would be read with nothing around it.
- Section slugs for the reading guide: `pnpm paragraphs <id> | grep '^## '`.

**Reviewing** an existing introduction (a reviewer, or a burn-down): report each item of the guide's checklist as pass or fail with evidence, and the changes as a diff; run `pnpm editorial` (it rewrites `src/generated/editorial.ts`: `git checkout` it after if you are not shipping).
