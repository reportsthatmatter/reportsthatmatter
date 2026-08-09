# Next

Quick triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map, kept current). This file is just: what's next, and who it
needs. Updated 2026-08-09.

## Needs Rufus

- **Launch** — Search Console, `@ReportsThatMatter` account, post the
  announcement thread. Nothing else matters as much; a beautiful archive
  nobody visits isn't doing the job. (#77 branch A)
- **Design review** — the Co-Star-derived design has never had your eyes
  on it.
- **PSI / Challenger re-ingest under the TOC whitespace-gap fix** (from
  PR #79) — re-running the pipeline pulls in real diffs I didn't have time
  to review line-by-line, including at least one lateral (not clearly
  correct) change. Say the word and I'll do the review myself instead of
  waiting — flagging it because it's judgement-call territory, not because
  I can't.
- **[Issue #12](https://github.com/reportsthatmatter/reportsthatmatter/issues/12) (text out of order)** —
  looks fixed already by the current pipeline, but it's a public issue, so
  closing it is yours.
- **Full-text search** — before building, four open design questions in
  `docs/ROADMAP.md` need answers only you can give (what gets indexed,
  ranking, UI).

## I can run with these

- **More reports** — Leveson #32 (source PDF already sitting in the old
  `uk-leveson-inquiry` repo, four volumes, never ingested), Saville #39,
  Chilcot #67, Philip Morris #33. Valukas #24 and Duelfer #34 are blocked on
  fetching the source (Cloudflare bot page / JS-rendered govinfo.gov) —
  doable, just needs a browser instead of a plain fetch.
- **Two-column layout support** in the ingestion pipeline — unblocks
  Columbia #37 and any future two-column source.
- **FCIC's digit-dropping extraction bug** — `pdftotext` silently drops
  every digit from that PDF; needs a different extraction path (maybe OCR
  the page images) rather than trusting the text layer.
- **No-space footnote-marker linking** — real, shipped-with-a-known-gap
  issue (Litvinenko has ~230/844 footnotes rendering as bare numbers).
  Needs a smarter rule than punctuation+case — the first attempt corrupted
  a real citation ("Section V.D.2") and was reverted.
- **Ingestion-quality odds and ends** (#77 branch C) — footnote recall
  (~97%), 11 truncated PSI headings, numbered-heading ambiguity, an OCR
  review-queue workflow. Bounded, no open questions.
- **Accessible link colour** (#14) — quick fix, just haven't gotten to it.
- **Pre-render at build time** — bundle is 1.43 MB gzip of the 3 MB cap;
  this is the architecture-decided fix (`docs/plans/2026-08-01-architecture.md`)
  before it bites.
- **`corrections.yaml` + derived-markdown-in-report-repos** — architecture
  decided, not built. Bigger lift than the above, but no open design
  questions blocking it.
