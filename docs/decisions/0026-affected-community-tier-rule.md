# 0026. How do we promote reports about deaths and wrongful prosecutions without using the affected people?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-63cd (this decision)

## Question

How do we promote reports about deaths and wrongful prosecutions without using the affected people?

## Context

Reports flagged `affected_community` (Grenfell, Hillsborough, Post Office, Saville, 9/11, Deepwater, Challenger, Columbia; the CIA torture report and Litvinenko were added on 16 and 17 October). Strategy section 8, marketing repo `strategy/2026-10-strategy.md`.

## Options

The recommended default was proposed in the bead and in `factory/handoffs/next-session-prompt-2026-10-10.md` ("Questions for Rufus"); no other option was adopted.

## Decision

Rufus, 2026-10-16: recommended default accepted. Adopt strategy section 8 in full. Highlights are tiered: A (institutional subject, stands alone) may be a card and an automated post; B (text only) is posted by a person with a context line; C (counts deaths, names a private person, quotes condemned or last words) is landing page only. `pnpm editorial` fails on `card:true` outside Tier A and the poster refuses non-A. No inquiry logos or images of the place on cards. A visible removal route on every such landing page and in the Bluesky bio, honoured within a day, with a public log and a kill switch per report. Campaign groups are never for promotion; one review email per group (JFSA; Grenfell United and Grenfell Next of Kin; Hillsborough families' groups; INQUEST as advisers) before such a report is queued or threaded; silence means Tier A only. One courtesy note to the Inquiry secretariat and the group before a report-day copy. No report about deaths or wrongful prosecution leads, demos or headlines launch material.

Rufus, 2026-10-17: "go with your recommendations" on three follow-ups.

1. Litvinenko joins the affected-community list (reportsthatmatter-3g1h; the CIA torture report was already on). `litvinenko-inquiry` is `affected_community: true` in `reports/registry.yaml`. None of its highlights is Tier A: each names Mr Litvinenko (the dead) or a named individual as its subject, or quotes President Putin's words, so all are Tier B or C. The four `card: true` flags were removed (one failed `pnpm editorial` as Tier C: "death"), their card images deleted, and the three queued items (24, 28 and 31 Oct) left the queue. The other dates did not move.
2. The Columbia "History is cause" launch card is Tier B: the subject is "History", not an institution. Launch material now uses a Tier A Columbia line instead, "Twice in NASA history, the agency embarked on a slippery slope that resulted in catastrophe." (p. 203), marked `card: true` and `tier: A` in `editorial/columbia-accident.yaml`. "History is cause" keeps `card: true` and stays on the page, but the poster refuses it.
3. The review emails to campaign groups and the Inquiry courtesy note are drafted for Rufus to send (reportsthatmatter-vx0u): marketing repo, `drafts/2026-10/campaign-group-review-emails.md`, to go out by Mon 2 Nov, before the first queued Hillsborough (12 Nov) and Grenfell (14 Nov) cards.

## Consequences

Queue rules and re-dating are in progress (another agent). Follow-ups are filed as beads: add the CIA torture report and Litvinenko to the affected list, review emails to campaign groups, the AGENTS.md rule.

## Links

- `factory/protocols/agent-protocol-2026-10-16.md`, "Update (evening, 2026-10-16): launch decided"
