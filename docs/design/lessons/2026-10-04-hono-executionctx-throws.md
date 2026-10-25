---
theme: D1 read budget (6kky)
---
- **Hono's `c.executionCtx` throws without a context, so `c.executionCtx?.waitUntil` is not a safe guard.** (2026-10-04, 6kky, agent) The existing `cached()` never hit it only because `caches` is absent under Node; a test that stubs `caches` does. Wrapped in try/catch in a `waitUntil` helper. [status: done in the 6kky PR]
