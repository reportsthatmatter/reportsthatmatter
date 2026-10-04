# 0014. How are the editor's highlights shown, so they don't pose as readers?

- **Status:** accepted
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-03
- **Decided by:** Rufus Pollock
- **Beads:** reportsthatmatter-bght.6 (this decision; epic bght); related: 38k (named highlights), g0w.11 (seeding), g0w.5 (Editor's picks), wb0

## Question

Rufus, 2026-10-03: "putting in the database things that I've highlighted, so that when people go and look through the reports and look for things people have highlighted, there are some already, would be super cool." The highlights must not pose as anonymous readers. How are they labelled and counted?

## Context

- Since 2026-09-25 (g0w.11) every approved `editorial/<id>.yaml` highlight is in the D1 `marks` table as a `save` under the fixed actor `editorial:rufus-pollock`. Production holds all 163 (11 to 15 per report, every report). `pnpm seed-highlights --dry-run --remote` on 2026-10-03: 163 stored, 163 wanted, 0 writes.
- Until this change they rendered exactly like a reader's mark: the yellow wash with the hover title "Highlighted by 1 reader". Every highlight on the site today is the editor's, so the site claimed 163 readers that were one editor.
- A reader's actor is a 64-hex daily hash computed on the server; no request can produce an `editorial:` actor, so the prefix is a reliable marker without a schema change.

## Options

- A. **Editor's highlight, unnamed (built, proposed default).** Same wash as a reader's mark, at the weight of one reader; hover title "Editor’s highlight" (or "Editor’s highlight · also marked by 2 readers"); never counted as a reader (`readers` excludes `editorial:` actors; the reader threshold applies to readers alone); a one-line key under the page header when a page shows one: "Shaded: the editor’s highlights and passages readers marked". The Most marked list says "Editor’s highlight · 2 readers".
- B. **Named: "Rufus Pollock's highlight"** (38k). Shows the reports are being read by a person. Needs the name in the UI and an about link; the actor already carries it.
- C. **Separate visual language** (a different colour or a margin marker for the editor). Clearer at a glance, but readers said an underline reads as a link, and a margin marker fights the sidenotes (#96).
- D. **Hide them in the text; list them only** (an Editor's picks block, g0w.5).

## Decision

A: "Editor's highlight", unnamed. Shipped in #279 (2026-10-04). Idea for later: a dedicated editor account, separate from Rufus's personal one, so he can highlight and annotate as himself.

## Consequences

- No D1 write and no migration: attribution is computed from the actor at read time. The seed now writes only differences.
- `/reports/:id/marks` rows gain `editor: boolean`; `readers` no longer includes the editor.
- Adding a highlight: select words on the site, Copy link, `pnpm highlight add '<link>' [--card]`, `pnpm editorial`, commit; after deploy the integrator runs `pnpm seed-highlights --remote` (one row per new highlight).

## Links

- `src/lib/marks.ts` (`EDITOR_ACTOR_PREFIX`, `markCounts`), `assets/social-proof.js`, `src/lib/seed-highlights.ts`, `scripts/highlight.mjs`
- [0002](0002-annotation-format.md) (one anchor model for human layers) and `docs/design/2026-10-03-sharing-and-highlights.md`
