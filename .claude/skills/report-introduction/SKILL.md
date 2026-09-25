---
name: report-introduction
description: Use when writing, revising or reviewing a report's introduction / landing page on Reports that Matter — any editorial/<report-id>.yaml (why it matters, background, findings, reading guide, highlights), or when asked for a "summary", "overview", "intro" or "landing page" for a report.
---

# Writing a report introduction

The approach lives in **`docs/report-introductions.md`**. Read it in full before writing anything; it is the single source, and this skill only makes sure it is followed.

The non-negotiables, in brief:

1. **Two parts only.** The summary (`why_it_matters`, `background`, `findings` with 3–4 quotations) and the reading guide. No highlights or passages section on the page. `highlights` go to the marks table via `pnpm seed-highlights --remote`.
2. **Every quotation verbatim, as rendered.** Copy from `pnpm paragraphs <id> [words]`, never from the PDF. `pnpm editorial` must pass. Never "fix" a quote; pick another passage.
3. **Quotations must stand on their own.** Quote whole sentences, with enough of the paragraph to make sense without it.
4. **Neutral, attributed, verified.** No judgment adjectives. Write "the report finds". Record the other side where the report prints it. Verify every background fact that is not in the report; if you can't, leave it out.
5. **Draft first.** Use `status: draft`, review at `/reports/<id>?draft`, and let Rufus approve. Never set `approved` on your own unless Rufus has said to.

Start from `editorial/jack-smith-vol1.yaml` as the reference shape. Work the checklist at the end of the guide before calling it done.
