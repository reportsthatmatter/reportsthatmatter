# 0008. May paragraph ids change, and how do old links survive?

- **Status:** decided
- **Date raised:** 2026-10-02 · **Date decided:** 2026-10-03
- **Decided by:** supervisor (Rufus to confirm)
- **Beads:** reportsthatmatter-q8c

## Decision

Ids may change when the text improves (page-break joins, clean-edition sources, corrections). Every id ever published is recorded, and old ids redirect to the paragraph that now contains their text (`reports/<id>/aliases.yaml`, served in meta.json; live 2026-10-03). Verify fails if a recorded id resolves nowhere and isn't listed as unmatched. D1 highlights and the posting queue still store old ids; only links redirect.
