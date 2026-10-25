---
theme: D1 read budget (6kky)
---
- **A fixed short cache TTL does not bound reads at launch traffic; size the TTL to the cost of a miss.** (2026-10-04, 6kky, agent) My first version (120 s edge cache) measured 3.8M of 5M rows a day for a 2,000-mark report at 2,500 views, because 2,500 views a day is only ~3 views per TTL on one location, so most views still miss. The TTL now comes from the read's own `meta.rows_read` (120 s to 30 min), which measured 275k rows a day for the same case. Measure the hit rate at the expected traffic before trusting a TTL. [status: done in the 6kky PR]
