---
theme: D1 read budget (6kky)
---
+- **An edge-cache eviction on write is what lets a cache serve the author's own freshness.** (2026-10-04, 6kky) `caches.default.delete` in `/api/mark` makes the author's next load at that location recompute; checked with `wrangler dev --local` (author's mark visible at once, a row inserted behind the Worker's back stays hidden until the TTL). The Cache API is per location, and absent on workers.dev. [status: done in the 6kky PR]
