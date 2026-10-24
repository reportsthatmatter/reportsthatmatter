---
theme: tooling
---
- **A new mode flag on a script that prunes must be checked against every other mode flag: two "only" flags together can render nothing and prune everything** (2026-10-24, reportsthatmatter-k8qo, newsletter-blog) The reviewer found `pnpm cards --blog --highlights` would have rendered no card and then deleted every quote card as an orphan. `--blog` now refuses `--highlights`; a prune after an empty render should refuse on its own too. [status: done in #359]
