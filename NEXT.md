# Next

Triage on top of [issue #77](https://github.com/reportsthatmatter/reportsthatmatter/issues/77)
(the full map). This file is what's next and where it's tracked — the linked
issue holds the detail. Shipped work is closed on GitHub, not listed here; see
`docs/PROGRESS.md` for the session-by-session account and `docs/CHANGELOG.md`
for what shipped. Updated 2026-09-03.

**Read [`AGENTS.md`](AGENTS.md) first**, then `./scripts/init.sh`. The done
condition is `./scripts/verify.sh`; after deploying,
`VERIFY_BASE=https://reportsthatmatter.org ./scripts/verify.sh`.

## The one next thing

**Read the OCR review queues** — [#122](https://github.com/reportsthatmatter/reportsthatmatter/issues/122).
999 open suspects across six reports, 7 reviewed. This is editorial work, not
engineering: open a report's `fidelity.md` beside the source PDF and record
each answer in its `corrections.yaml` — a fix under `corrections:`, or "the
scan is right" under `dismissed:`. Either way the entry leaves the queue for
good. Start with `challenger-accident`: the messiest scan and the largest
queue, and seven worked examples already in its file.

Everything else is optional. The ingestion architecture is built and the
pipeline is a pinned dependency ([`@rtm/ingest`](https://github.com/reportsthatmatter/ingest));
six reports are live, each owning its own build.

## After that, if you want it

| | |
| --- | --- |
| [#123](https://github.com/reportsthatmatter/reportsthatmatter/issues/123) | `wrangler d1 execute --remote --file` fails on auth — the documented deploy step needs a workaround. Try `pnpm wrangler login` first |
| [#121](https://github.com/reportsthatmatter/reportsthatmatter/issues/121) | Footnote numbers are not unique across a report. Blocks further footnote work on Leveson, and will recur for Chilcot |
| [#99](https://github.com/reportsthatmatter/reportsthatmatter/issues/99) | Imagery — a mark per report. Needs Rufus to pick a direction |
| [#102](https://github.com/reportsthatmatter/reportsthatmatter/issues/102) · [#104](https://github.com/reportsthatmatter/reportsthatmatter/issues/104) | FCIC digit-dropping; the last of the footnote recall |
| [#77 branch A](https://github.com/reportsthatmatter/reportsthatmatter/issues/77) | Launch — Search Console, the announcement thread. Parked at Rufus's instruction |
| — | More reports: Saville [#39](https://github.com/reportsthatmatter/reportsthatmatter/issues/39), Chilcot [#67](https://github.com/reportsthatmatter/reportsthatmatter/issues/67), Philip Morris [#33](https://github.com/reportsthatmatter/reportsthatmatter/issues/33) |
