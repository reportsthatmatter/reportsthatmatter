# 0002. How do we encode what we add to the text: inline markdown or a sidecar file?

- **Status:** open
- **Date raised:** 2026-10-03
- **Decided by:** —
- **Beads:** reportsthatmatter-i8en (design); related: c0h (remark/unified migration), q8c (aliases), b78.10

## Question

Rufus, 2026-10-03: we may need a sidecar format, or inline annotations in markdown, for the things we add: page numbers, paragraph numbers and the like.

## Context

What we add today, and where it lives:
- printed page anchors: inline `%%page N%%` comments in `full.md`
- paragraph ids: derived from text by the renderer, not stored
- aliases for moved ids: `reports/<id>/aliases.yaml`, `published-ids.txt`
- corrections: `corrections.yaml` in the report repo
- fidelity flags for clean-edition reports: `fidelity.md`
- provenance (pinned source SHA-256s): the report repo manifest; per-block provenance (clean edition vs. PDF) isn't recorded
- editorial highlights and excerpts: `editorial/<id>.yaml`, keyed by paragraph id

## Options

To be worked out in i8en: inline attribute syntax (CommonMark/Pandoc `{#id .class key=val}`, MyST roles), CriticMarkup for corrections, standoff/sidecar annotation keyed by id or text anchor (TEI standoff, W3C Web Annotation, hypothes.is-style anchoring), or a mix (inline for what travels with the text, sidecar for layers).

## Decision

Not yet made.

## Consequences

—

## Links

- bead i8en
