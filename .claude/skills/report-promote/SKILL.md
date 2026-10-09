---
name: report-promote
description: Use when adding a live report's excerpts to the Bluesky posting queue on Reports that Matter, checking the queue after a re-ingest moved paragraph ids, or planning a report's excerpt campaign. Stage 8 of the preparation pipeline; it builds the queue, the scheduled poster posts.
---

# Stage 8: promote with excerpts

**Level:** `level:specced` (Sonnet). Rules for every agent: [`docs/agent-protocol.md`](../../../docs/agent-protocol.md) (R1-R15).

Design: `docs/design/2026-10-03-report-preparation-pipeline.md` §2-3. The queue: **`docs/posts-queue.md`**. The campaign: epic `reportsthatmatter-y2t` (account y2t.1, poster y2t.4, calendar y2t.5). No posting by agents.

**Entry.** Stage 5's highlights (`card: true`) approved and stage 6 live.

## Procedure

1. `pnpm prerender`, then `pnpm posts`. Read its output for this report: items added, skipped (and why), items on a default card.
2. A skipped highlight goes back to stage 5 (replace it there; never trim a quote).
3. Open `build/posts-preview.html` and read this report's items as a reader would.
4. Commit `marketing/queue.yaml`. Scheduling is append-only and round-robin across reports; do not hand-move dates.
5. **After any re-ingest of this report**: rerun `pnpm posts`; an unresolved not-yet-posted item is fixed before its scheduled date.

## Exit gate

- [ ] The report has 3+ items in `marketing/queue.yaml` with scheduled dates
- [ ] `pnpm posts` reports no unresolved not-yet-posted item for it
- [ ] `reports/pipeline.yaml` row says `reached: promote`, `state: ongoing`

**Gap:** the campaign calendar (y2t.5) is not built. The scheduled poster that posts the queue is built and off until Rufus switches it on: [`docs/poster.md`](../../../docs/poster.md); agents never run it live. Retro and lessons: agent protocol R13-R14.
