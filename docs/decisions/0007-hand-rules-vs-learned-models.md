# 0007. Hand rules, learned models or an LLM referee for pipeline decisions?

- **Status:** decided (revisit as references grow)
- **Date raised:** 2026-10-02 · **Date decided:** 2026-10-02
- **Decided by:** supervisor, on the evidence of 38s.8
- **Beads:** reportsthatmatter-38s.8, 38s.10, 38s.11, 38s.13, 38s.14

## Decision

For joins across page breaks: layout-gated hand rules (95.6% dev / 88.9% held-out, against the pipeline's 84.7% / 80.8%); a depth-4 tree only rediscovered them, so learned models are used to propose rules, not shipped. An optional cached LLM referee for the ambiguous ~9% (86% vs. 77%, about $0.0024 per decision) is planned (38s.11). Quote style and headings don't transfer across publishers, so they are declared per report.

## Links

- docs/design/2026-10-02-learning-from-aligned-pairs.md
