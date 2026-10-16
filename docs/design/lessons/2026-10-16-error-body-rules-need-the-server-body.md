---
theme: Release and process
---
- **A client-side rule keyed on an error body is only as good as the server's error body.** (2026-10-16, moej review, Opus) publish-call skips retrying a quota 5xx by matching the body, but the Worker has no onError, so a D1 failure arrives as a bare "Internal Server Error" and the rule never fires; read the handler's failure path before trusting "X errors are not retried". [status: proposed, 9u3h]
