# 0012. A published paragraph id now names a different paragraph: whose meaning wins?

- **Status:** proposed
- **Date raised:** 2026-10-03
- **Decided by:** supervisor proposal (Rufus to confirm)
- **Beads:** reportsthatmatter-rf4c, reportsthatmatter-hxo4

## Question

Paragraph ids are derived from the text (its first words, `-2`, `-3` for repeats) or from a repeated label (`findings`, `findings-2`, ...). A re-ingest can therefore hand an id that readers, editorial, the posting queue and D1 highlights already hold to a different paragraph, and `aliases.yaml` cannot help: a live id is never aliased, because a `?p=` to it is indistinguishable from one meant for the new paragraph.

## Decision (proposed)

1. **The old meaning should win.** A published id is a promise. The target design is that the id generator is given the recorded ids (`published-ids.txt`) and gives a new paragraph that would collide a suffixed id (`-2`, ...), so the old id keeps its paragraph or, if that moved, is aliased to its new id like any other. That needs an ingest change (a `reservedIds` input to the id pass). It is not built; bead filed.
2. **Until then, fail loudly, never silently.** `pnpm aliases generate` compares each live id's old paragraph with its new one (same paragraph if at least half of the shorter text's words are in the other) and records the ones that differ under `reused:` in `aliases.yaml` (`movedTo`: where the old text went, or null). `pnpm aliases check` fails while any `reused` id is pending. The integrator reads the list, repoints what cites each id (editorial, `docs/share-quotes.yaml`, the posting queue, D1 highlights; generate prints which of the first two cite it), then runs `pnpm aliases generate <id> --accept-reuse`, which marks them accepted and keeps them as history.
3. **The Challenger `findings-3` case is a different, milder shape** and gets its own record, `moved_out:`. The id kept its paragraph (the "Findings" label) but lost the ordered list it introduced, whose items became paragraphs with ids of their own (mv1t), so a quotation cited through `findings-3` no longer lives under it. This happens to hundreds of ids across the corpus after mv1t, so it does not fail the check; generate prints each one that editorial or the share quotes cite, and `check` warns. `pnpm editorial` already fails on a quote that is no longer in its paragraph; the warning covers a bare cite.

## Why

Aliasing the old id to the new home is impossible while the id is live, so the only places to keep the old meaning are the citers (fixable, and listed) or the id assignment (the real fix, in ingest). A hard failure for unrelated text under an old id, and a printed list for lost list content, is the narrowest check that would have caught rf4c without drowning the integrator in the 400 harmless list moves.
