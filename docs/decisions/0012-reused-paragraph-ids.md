# 0012. A published paragraph id now names a different paragraph: whose meaning wins?

- **Status:** proposed
- **Date raised:** 2026-10-03
- **Decided by:** supervisor proposal (Rufus to confirm)
- **Beads:** reportsthatmatter-rf4c, reportsthatmatter-hxo4, reportsthatmatter-efso (built 2026-11-13), reportsthatmatter-c99s

## Question

Paragraph ids are derived from the text (its first words, `-2`, `-3` for repeats) or from a repeated label (`findings`, `findings-2`, ...). A re-ingest can therefore hand an id that readers, editorial, the posting queue and D1 highlights already hold to a different paragraph, and `aliases.yaml` cannot help: a live id is never aliased, because a `?p=` to it is indistinguishable from one meant for the new paragraph.

## Decision (proposed)

1. **The old meaning should win.** A published id is a promise. The target design is that the id generator is given the recorded ids (`published-ids.txt`) and gives a new paragraph that would collide a suffixed id (`-2`, ...), so the old id keeps its paragraph or, if that moved, is aliased to its new id like any other. **Built (efso, ingest v0.37.0):** see "Reserved ids" below.
2. **Until then, fail loudly, never silently.** `pnpm aliases generate` compares each live id's old paragraph with its new one (same paragraph if at least half of the shorter text's words are in the other) and records the ones that differ under `reused:` in `aliases.yaml` (`movedTo`: where the old text went, or null). `pnpm aliases check` fails while any `reused` id is pending. The integrator reads the list, repoints what cites each id (editorial, `docs/share-quotes.yaml`, the posting queue, D1 highlights; generate prints which of the first two cite it), then runs `pnpm aliases generate <id> --accept-reuse`, which marks them accepted and keeps them as history.
3. **The Challenger `findings-3` case is a different, milder shape** and gets its own record, `moved_out:`. The id kept its paragraph (the "Findings" label) but lost the ordered list it introduced, whose items became paragraphs with ids of their own (mv1t), so a quotation cited through `findings-3` no longer lives under it. This happens to hundreds of ids across the corpus after mv1t, so it does not fail the check; generate prints each one that editorial or the share quotes cite, and `check` warns. `pnpm editorial` already fails on a quote that is no longer in its paragraph; the warning covers a bare cite.

## Why

Aliasing the old id to the new home is impossible while the id is live, so the only places to keep the old meaning are the citers (fixable, and listed) or the id assignment (the real fix, in ingest). A hard failure for unrelated text under an old id, and a printed list for lost list content, is the narrowest check that would have caught rf4c without drowning the integrator in the 400 harmless list moves.

## Reserved ids (efso, 2026-11-13)

Ids alone cannot say which of two "Key Messages" paragraphs is the old one, so the site keeps `reports/<id>/reserved-ids.txt`: for every published id, when it was first recorded, the section it was served in, a fingerprint of its text and of the next passage's text. `renderArtifacts(markdown, { reserved })` (ingest v0.37.0) keeps each id on the paragraph that still matches it (same text and next passage anywhere, so a chapter split out of its Part keeps its ids; else same text in the same section; else the one left in that section after a correction), oldest record first, and suffixes every other paragraph past those ids. An id that lost its paragraph to an older one is retired (never reused) and aliased to the older id; a reservation that matches nothing constrains nothing. Where every match already has its id, the output is byte-identical to the plain pass.

- **Default, not opt-in**, but the backfill reserves what is served now (`pnpm aliases seed-reserved`), so adopting it moved no report's ids except `uk-stern-review`, seeded from its history (`--history`) to undo batch 2a's shift (c99s): 16 ids back to the chapters batch 1 published them in, the 15 batch-2a ids that had taken those paragraphs aliased to them, and the new chapters' paragraphs suffixed.
- **Not restored:** older shifts elsewhere (a `--history` seed of every report moves ids in 12 more, live for weeks, some of them artefacts of matching through many re-ingests). Restoring those is a separate call (bead filed with the efso PR).
- **Who renders with it:** `pnpm prerender`, `pnpm aliases generate` (new text with `--old-ref`'s list, old text as it was served), `cards`, and the `quality`/`score` fallbacks. `rtm-publish` in a report repo does not, so publish through the site (already the rule).
- **Kept in step:** `generate` adds each new id with its first home and never rewrites one; `pnpm aliases check` fails when a current id is missing from the file or a reserved id is not in `published-ids.txt`; `pnpm ship` refuses a lost line, as for `published-ids.txt`.
