---
theme: scheduling
---
- **A launch-critical GitHub Actions cron needs more than one run at off-peak minutes, and a proof the extra runs are harmless** (2026-10-17, reportsthatmatter-gweq, fix agent) "0 14 * * *" started 3h43 to 7h53 late on all 13 days from 4 to 16 Oct, found only in the launch-day review; the original poster tests covered idempotency but nothing asked when the run starts. Four off-peak crons plus a 13:00 UTC gate and the one-post-per-day rule, tested; the off-peak delay is still unmeasured. [status: done in the gweq PR; measure after the first week]
