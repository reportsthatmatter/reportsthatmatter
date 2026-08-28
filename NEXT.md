# Next

Triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map). This file is what's next and where it's tracked — the linked
issue holds the detail. Shipped work is closed on GitHub, not listed here; see
`docs/PROGRESS.md` for the session-by-session account and `docs/CHANGELOG.md`
for what shipped. Updated 2026-08-28.

**Read [`AGENTS.md`](AGENTS.md) first**, then `./scripts/init.sh`. The done
condition is `./scripts/verify.sh`; after deploying,
`VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.

## Ready to pick up cold — one session each

| | | Touches |
| --- | --- | --- |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | Imagery: study Co-Star, then a mark per report | `docs/design/`, `assets/` |

## Smaller, also independent

| | |
| --- | --- |
| [#101](https://github.com/reportsthatmatter/reportsthatmatter/issues/101) | Two-column layout — unblocks Columbia #37 |
| [#102](https://github.com/reportsthatmatter/reportsthatmatter/issues/102) | FCIC digit-dropping |
| [#103](https://github.com/reportsthatmatter/reportsthatmatter/issues/103) | No-space footnote markers (Litvinenko) |
| [#104](https://github.com/reportsthatmatter/reportsthatmatter/issues/104) | Ingestion odds and ends |
| [#114](https://github.com/reportsthatmatter/reportsthatmatter/issues/114) | Spike: remark vs markdown-it — pair with #102–#104 |
| [#118](https://github.com/reportsthatmatter/reportsthatmatter/issues/118) | Ingestion architecture — **built**. The pipeline is [`@rtm/ingest`](https://github.com/reportsthatmatter/ingest); every report owns its build in its own repo. What is left is quality work inside it, not structure |
| [#120](https://github.com/reportsthatmatter/reportsthatmatter/issues/120) | A docket row becomes a division heading. Needs table detection, so it pairs with #101 |
| [#105](https://github.com/reportsthatmatter/reportsthatmatter/issues/105) | The OCR review queues now have somewhere to land (#106 shipped). What is missing is the workflow over them |
| [#110](https://github.com/reportsthatmatter/reportsthatmatter/issues/110) · [#111](https://github.com/reportsthatmatter/reportsthatmatter/issues/111) · [#112](https://github.com/reportsthatmatter/reportsthatmatter/issues/112) | UX odds and ends |
| [#14](https://github.com/reportsthatmatter/reportsthatmatter/issues/14) | Accessible link colour |
| [#117](https://github.com/reportsthatmatter/reportsthatmatter/issues/117) | Pin `poppler`/`pdftotext` |
| — | More reports: Saville [#39](https://github.com/reportsthatmatter/reportsthatmatter/issues/39), Chilcot [#67](https://github.com/reportsthatmatter/reportsthatmatter/issues/67), Philip Morris [#33](https://github.com/reportsthatmatter/reportsthatmatter/issues/33). Valukas [#24](https://github.com/reportsthatmatter/reportsthatmatter/issues/24) and Duelfer [#34](https://github.com/reportsthatmatter/reportsthatmatter/issues/34) need a browser to fetch the source. `pnpm ingest run` now takes multiple PDFs for a multi-volume report (built for Leveson, ready for Chilcot). |

## Needs Rufus

| | |
| --- | --- |
| [#77 branch A](https://github.com/reportsthatmatter/reportsthatmatter/issues/77) | Launch — Search Console, `@ReportsThatMatter`, the announcement thread. Parked 2026-08-21. |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | Picking a visual direction, once options exist |
| — | Confirm the Workers plan upgrade went through (not blocking — #115 fixed the 503s another way) |
