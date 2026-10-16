---
theme: Release and process
---
- **A lock file that records an override must be checked against the state it describes, by every command that trusts it.** (2026-10-16, irfs, Sonnet) `.rtm-link.lock` outlived the links a `pnpm install` reset (review v0.23.0), so `link` refused "Already linked" and `preflight` printed the site on the pin among "linked override" lines; `ingest link` now compares each recorded link with the lock's ingest dir (`--status` marks `linked`/`drifted`, `link` relinks a stale lock, `preflight` fails with the fix). The same question applies to `.rtm-try.lock`, not changed here. [status: done in the irfs PR]
