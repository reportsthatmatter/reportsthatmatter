---
theme: site
---
- **Anything a `?p=`/`?h=` link adds to a reading page is client-side, outside `#report-body`; the server may add only head tags and query-independent data attributes** (2026-10-16, reportsthatmatter-hbnj, fix agent) The source line for shared paragraphs could not be server-rendered next to the paragraph: `tests/head.test.ts` pins a shared link's body as byte-identical to the plain page (one cached fragment, text indexes untouched). It went into the fixed landing panel instead, fed by `data-source-url`/`data-edition-url` on the body, plus a static source line in every section header for no-JS readers and crawlers. Check that test before designing anything for the paragraph view. [status: done in the hbnj PR]
