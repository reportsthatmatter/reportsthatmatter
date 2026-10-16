# 0024. Which licences do the public repos carry?

- **Status:** decided
- **Date raised:** 2026-10-03 · **Date decided:** 2026-10-16
- **Decided by:** Rufus Pollock (accepted the recommended default)
- **Beads:** reportsthatmatter-y2y8.9 (this decision), reportsthatmatter-n5p8

## Question

What licence does each public repository under github.com/reportsthatmatter carry, for its code and for the text it holds?

## Context

On 2026-10-03 none of the public repos declared a licence (`gh repo list` showed `licenseInfo` null), and "open on GitHub" without one is a predictable first objection. The repos hold three kinds of thing with different owners: code we wrote, reports other people wrote, and the markup and writing we add to those reports. The reports' status varies: US federal works are public domain (17 U.S.C. § 105); UK reports are Crown copyright, usually reused under the Open Government Licence; a few are neither clearly. An earlier lesson applies: do not record a licence nobody recorded.

## Options

1. One licence for everything. Wrong for the reports, which we do not own.
2. Code under a permissive licence; each report's text keeps its status at source; our additions under an attribution licence.
3. No licence until a lawyer has read every report. Leaves the objection standing for no gain.

## Decision

Option 2. Code (site, ingest, factory, visual-changelog, design-experiments, and the build files in each report repo) is MIT, Copyright (c) 2026 Rufus Pollock and contributors, as a standard `LICENSE` file so GitHub shows MIT. Each report repo has a `LICENSE` stating three things: the report text's status with the report's own notice quoted, our markup, processing and editorial additions under CC BY 4.0, and the code under MIT (`LICENSE-MIT`). Where the report's own notice could not be found or conflicts with what we said, the file says the status is not confirmed rather than naming a licence: Hillsborough (the PDF imprint reserves rights to the Panel, while the website says Crown copyright and GOV.UK offers OGL generally) and Lehman (a court filing by a court-appointed examiner and his law firm, who were not federal employees). Columbia and 9/11 are treated as US government works with that caveat noted. The registry's `license` is set only where the repo records it; it is removed for Hillsborough and Lehman.

## Consequences

- Leveson's README no longer says "Public domain": the report is Crown copyright under the Open Government Licence (version not stated in the imprint).
- Hillsborough's OGL claim and Lehman's public-domain claim are withdrawn from READMEs, PROCESSING.md, data files and the registry until someone confirms them.
- /about says in a line what the licences are and points to each report repo.
- The private `marketing` repo has no licence; it is not public.

## Links

- docs/decisions/0021-factory-repo.md
