---
theme: Tooling messages
---
- **A guard shared by several commands needs its refusal text checked against each command's real effect.** (2026-10-16, reportsthatmatter-fzdo, Claude) The shared-checkout message written for `run`/`baseline` ("dirties it for everyone") was reused for `aggregate`, which only reads, so agents owning no report repo were told something false and fell back to `VERIFY_SHARED=1` by folklore (PRs #326, #327). `sharedMessage` now has an aggregate variant and a test asserts the false claim is absent. [status: done in the fzdo PR]
