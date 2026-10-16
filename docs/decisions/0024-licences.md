# 0024. What licences do the public repos carry?

- **Status:** decided (accepted: the recommended default) 2026-10-16
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-16
- **Decided by:** Rufus, 2026-10-16: recommended default accepted
- **Beads:** reportsthatmatter-y2y8.9 (this decision), reportsthatmatter-n5p8 (registry licences), reportsthatmatter-9kn4 (Hillsborough), reportsthatmatter-hx7j (Lehman)

## Question

What licences do the public repos carry?

## Context

None of the public repos declares a licence; 'open on GitHub' without one is a predictable first objection. Not a launch blocker (Rufus, 2026-10-10).

## Options

The recommended default was proposed in the bead and in `factory/handoffs/next-session-prompt-2026-10-10.md` ("Questions for Rufus"). The repos hold three kinds of thing with different owners: code we wrote, reports other people wrote, and the markup and writing we add. So:

1. One licence for everything. Wrong for the reports, which we do not own.
2. Code under a permissive licence; each report's text keeps its status at source; our additions under an attribution licence (the recommended default).
3. No licence until a lawyer has read every report. Leaves the objection standing for no gain.

## Decision

Rufus, 2026-10-16: recommended default accepted. MIT for code (site, ingest, tools); a text status statement per report (public domain for US federal works; Open Government Licence or Crown copyright for UK reports, as each states); our markup and editorial CC BY 4.0. Also confirm the text licences for Jack Smith, Columbia, Deepwater, Philip Morris, fix Leveson's README ("Public domain" to Crown copyright), and check Lehman (the examiner and Jenner & Block were not federal employees, so it may not be US public domain).

Implementation (site PR #347 and one licence PR per public repo, folded in here from #347's draft record so there is one 0024): code (site, ingest, factory, visual-changelog, design-experiments, and the build files in each report repo) is MIT, Copyright (c) 2026 Rufus Pollock and contributors, as a standard `LICENSE` file so GitHub shows MIT. Each report repo's `LICENSE` states three things: the report text's status with the report's own notice quoted, our markup, processing and editorial additions under CC BY 4.0, and the code under MIT (`LICENSE-MIT`). Where the report's own notice does not support a licence, the file says so instead of naming one: Hillsborough (the PDF imprint and the Panel's website terms reserve the rights in the report to the Panel) and Lehman (a court filing by a court-appointed examiner and his law firm, who were not federal employees). Columbia and 9/11 are treated as US government works with that caveat noted; Saville's OGL comes from GOV.UK, its imprint giving the HMSO reuse terms. The registry's `license` (JSON-LD) is set only where the repo records one, and is absent for Hillsborough and Lehman.

Rufus, 2026-10-17: "go with your recommendations" on three follow-ups.

- Hillsborough (reportsthatmatter-9kn4): keep serving the report while asking. Rufus will send the question to the Home Office, copying psi@nationalarchives.gov.uk; the email text is in the bead's notes. The registry licence stays absent and the repo LICENSE keeps its takedown line until there is an answer.
- Lehman (reportsthatmatter-hx7j): keep it live; low risk. The bead stays open as a low-priority ask to Jenner & Block; nothing is claimed beyond "not established".
- The copyright holder in the MIT licence stays "Rufus Pollock and contributors" (not Datopian or Life Itself; the git history is all Rufus Pollock's).

## Consequences

- Leveson's README no longer says "Public domain": the report is Crown copyright under the Open Government Licence (version not stated in its 2012 imprint).
- Hillsborough's OGL claim and Lehman's public-domain claim are withdrawn from READMEs, PROCESSING.md, data files and the registry until someone confirms them (9kn4, hx7j).
- /about says in a line what the licences are and points to each report repo.
- The private `marketing` repo has no licence; it is not public.
- The per-paragraph dataset page (0029) is gated on this.

## Links

- docs/decisions/0021-factory-repo.md
- `factory/protocols/agent-protocol-2026-10-16.md`, "Update (evening, 2026-10-16): launch decided"
