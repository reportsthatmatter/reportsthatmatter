# Content publishing: where rendered reports live, and who writes them

**Date:** 2026-09-04
**Status:** decision
**Supersedes:** the storage recommendation in
[`2026-08-21-serving-architecture.md`](2026-08-21-serving-architecture.md) §5
and §7.4 ("static assets, not R2"). That document named the conditions under
which it should be revisited — the per-file ceiling, and the project actually
wanting publish-without-deploy. Both have now arrived. Everything else in it
still holds, including §2–§4: the build is fast, a theme change is one file,
and the request-time set is tiny.

---

## 0. The short version

1. **Ingestion is already devolved to report repos. Rendering is not.** A
   report repo owns its source, `ingest.ts`, `corrections.yaml`,
   `baseline.json` and its `full.md`. The handoff to the site is *markdown* —
   so the app repo keeps a copy of all ten `full.md` (19 MB) and commits
   everything rendered from them (133 MB), around an app of about 2 MB. §1
2. **Move the handoff from markdown to rendered content**, and put the
   handoff in a store rather than in git. §2
3. **The line is content vs. chrome, not page vs. fragment.** A report repo
   must never emit the site's layout, or a design change means republishing
   eleven repos. It emits section fragments, a section list, and a
   paragraph→section index; the app owns layout, nav, search UI and OG tags.
   §2
4. **R2 for blobs read whole by a key you already know; D1 for anything you
   query, join, or need transactionally.** That rule, not a preference,
   assigns every artifact. Section fragments → R2. Search index, version
   pointer, marks → D1. Registry → the app repo. §3
5. **Report repos publish through one endpoint, not with ten sets of
   credentials.** The endpoint is where the gates live — a store ten repos
   can write to directly is a store nothing can refuse a bad publish from. §4
6. **Atomicity survives, and permalinks get better.** Content-addressed keys
   plus a version pointer row: publish writes objects under a new hash, then
   flips one row. Rollback is one `UPDATE`, and old versions stay addressable
   so a citation can pin one. §5
7. **The real cost is the blast-radius check**, which today runs in one place
   over the whole corpus and would be distributed across eleven repos. That
   is the thing to design for, not the storage. §6
8. **`paragraph_id` generation is currently the least governed thing in the
   system**, and this change fixes it. §7

---

## 1. Where the boundary sits today

```
report repo (e.g. columbia-accident)      app repo (reportsthatmatter)
────────────────────────────────────      ────────────────────────────────
archive/*.pdf       the source            reports/<id>/full.md   ← a COPY,  19 MB
ingest.ts           build definition      assets/generated/      ← rendered, 133 MB
corrections.yaml    human judgements         full.html    27.2 MB
baseline.json       blast-radius guard       sections/*   29.8 MB
fidelity.md         review queue             body.json    55.5 MB
full.md             ══ OUTPUT ═════════►     meta.json
                                          src/  ← the actual app, ~2 MB
        @rtm/ingest v0.11.0 — shared, pinned, versioned
```

Measured 2026-09-04, ten reports, on `main`:

| | |
| --- | --- |
| `assets/generated/` | 133 MB, 601 files |
| of which `body.json` | **55.5 MB (42%)** |
| of which `full.html` | 27.2 MB — a second copy of the same text the sections hold |
| of which `sections/*.html` | 29.8 MB |
| `reports/*/full.md` (copies) | 19 MB |
| Share of all git blobs that is `assets/generated` | **252 MB of 295 MB (85%)** |
| `pnpm prerender`, whole corpus | 2.9 s |

The same rendered text is stored three times: once in `full.html`, once split
across `sections/*.html`, and once again in `body.json`, which contains both.

**Nothing here is a performance problem.** Wrangler uploads assets by content
hash, so deploys are already incremental; the render is 2.9 s; storage is
free at this scale. The problems are structural:

- **The app repo is 98% data.** A clone is 308 MB for 2 MB of code.
- **A template change rewrites every artifact.** `full.html` and each
  `sections/*.html` embed the layout shell, so one CSS-class change in
  `src/templates/` dirties all 601 files.
- **Republishing a report requires deploying the app.** Editorial cadence and
  code cadence are the same cadence.
- **There is a hard ceiling ahead.** Static assets cap at **25 MiB per file**.
  Leveson's `body.json` is 19.0 MB at 1.12 M words. Chilcot (#67) is ~2.6 M
  words; at the measured ~17 bytes/word its `body.json` lands near 44 MB and
  its `full.html` near 21 MB. One is over the cap and the other is at it.

---

## 2. The line: content vs. chrome

The handoff moves from `full.md` to rendered content, produced by the shared
pinned library rather than by the app.

| Emitted by the report repo | Owned by the app |
| --- | --- |
| Section fragment HTML — body only, no shell | Layout, nav, footer, `<head>` |
| The section list (slug, title, order) | Contents page, section nav |
| The paragraph→section index | Routing a `?p=` link |
| Passage rows (paragraph id, page, text) | Search UI, ranking, snippets |
| Word/page counts | Everything visual |

**A report repo must not emit a laid-out page.** If it did, a design change
would mean re-running and republishing eleven repos, which is worse than
today in exactly the way today is bad. Fragments make a template change a pure
code deploy that touches zero content artifacts, and a re-ingest a content
publish that touches no code — which is the decoupling this whole document is
for.

`run_worker_first = true` is already set, so the Worker runs on every request
regardless; assembling a page from a fragment costs a string concatenation
against a request that was never going to skip the Worker anyway. The
"served straight from ASSETS with zero Worker work" property that justified
whole-page pre-rendering in the Aug-21 doc does not currently exist.

`/full` is then **assembled from the section fragments in order**, not stored
separately — which removes the 27.2 MB of duplication and the per-file
ceiling for the largest reports at the same time.

---

## 3. Where each artifact goes

The rule, which does the assigning:

> **R2** for things read whole by a key you already know.
> **D1** for things you query, join, or need to be transactionally consistent.
> **The app repo** for things that are editorial policy rather than content.

| Artifact | Store | Why |
| --- | --- | --- |
| Section fragment HTML | **R2** | A blob fetched by exact key, one per request, never queried. No size cap. Streamable into the response. |
| Report meta (section list, paragraph→section, counts) | **R2**, one JSON per report | Small, read whole, never queried by field. Cache in the isolate. |
| Passage rows (search index) | **D1** | FTS5 lives in SQLite; this is not a choice. Already there. |
| Version pointer `report → content hash` | **D1** | The transactional bit. Tiny, read on every request, must be consistent with itself. |
| Marks / social proof (#96) | **D1** | Already there. Has writes. |
| `registry.yaml` — what is published | **app repo** | Editorial policy, not content. Belongs with the code that renders it. |

Two things worth stating explicitly, because they are the questions that keep
coming back:

**D1 cannot hold the HTML.** Its maximum string/BLOB/row size is 2 MB.
Section fragments fit today (largest is 0.69 MB *with* chrome, less without),
but `/full` for Leveson is 9.4 MB and would not, and relying on a 2 MB
ceiling for a corpus whose whole point is very long documents is the same
mistake as the 25 MiB one, one order of magnitude down.

**R2 cannot hold the index.** Full-text search is FTS5, which is a SQLite
feature. The search index stays in D1, exactly where it already is.

So the split is not a compromise between two candidates — the two stores hold
different *kinds* of thing, and each is the only viable home for its kind.

There is also a real improvement hidden here: `pnpm index-search` currently
produces one corpus-wide 16 MB `search-index.sql` and re-applies all ten
reports at once (~221 k changes) because the artifact it reads is corpus-wide.
Per-report publishing makes reindexing per-report by construction.

---

## 4. Who writes to the store

Report repos publish **through a publish endpoint on the Worker**, not by
holding R2 and D1 credentials directly.

```
report repo CI                    publish endpoint                stores
──────────────                    ────────────────                ──────
pnpm ingest run                   auth: token scoped to           R2:  objects under
  → full.md                         this report id                     <id>/<hash>/…
pnpm render          ──POST──►    validate: fidelity gates,       D1:  passage rows
  → fragments, meta,                paragraph-id baseline,             version pointer
    passage rows                    schema, size
                                  write objects, then flip
                                    the pointer last
```

The alternative — ten repos each writing R2 and D1 directly — is simpler to
build and worse in two specific ways:

1. **Nothing can refuse a bad publish.** This project's stated culture is that
   a gate which cannot fail on broken output is not evidence (AGENTS.md, after
   the Litvinenko severed-paragraph defect). Direct writes put the corpus
   behind no gate at all. One endpoint is one place to implement the checks,
   and one place they cannot be skipped.
2. **Ten places to leak a credential that can rewrite the corpus.** A bearer
   token scoped to one report id is a much smaller blast radius than an R2
   write key and a D1 binding.

Each report repo therefore holds one secret, which can only publish itself.

---

## 5. Atomicity, rollback, and permalinks

The Aug-21 doc's objection to R2 was that it gives up the
"one deploy = one coherent, rollback-able site version" property, and that
rebuilding that by hand would be a homemade deploy system with worse tooling
than Wrangler's. That was the right worry and the wrong conclusion once
per-report publishing is the actual goal:

- Objects are written under a **content hash**: `reports/<id>/<hash>/…`.
  Writing them changes nothing anyone can see.
- The publish completes with **one statement**: `UPDATE report_versions SET
  hash = ? WHERE report = ?`. That is the only non-idempotent step, and it is
  atomic per report.
- **Rollback is that statement again**, with the previous hash. No deploy, no
  re-render, no re-upload.
- **Old versions stay addressable.** Nothing garbage-collects a hash prefix,
  so a citation can pin a version of the text it quoted.

That last point is a *stronger* permalink guarantee than today's, not a
weaker one. Today a re-ingest that moves a paragraph id repoints every
citation to it at the next deploy, and the previous text is recoverable only
from git history.

What is genuinely given up: there is no longer a single site version that
pins every report at once. In exchange, each report has one, explicitly, and
the pointer table *is* that manifest — readable, diffable, and revertable per
row.

---

## 6. What this costs

**The blast-radius check is the real cost, and it is not about storage.**
Today `pnpm ingest check` regenerates the whole corpus in one command and
fails if any output moved without its baseline moving too. It exists because a
fix aimed at Leveson silently changed three other reports. Distributed across
eleven repos, no single command sees the corpus any more.

This needs a home before step 3 ships, not after. The shape: a corpus check in
the app repo (or a scheduled CI job) that reads every report's published hash
from the pointer table and compares against a committed manifest of expected
hashes — the `baseline.json` idea lifted to corpus level. A hash that moved
without the manifest moving is the same failure `ingest check` catches today.

**Local development needs the content offline.** `verify.sh` boots a real
worker and asserts against real HTTP. With content in R2 it needs Wrangler's
local R2 and D1 plus a `pnpm pull-reports` step to seed them. This is
mechanical but it is on the critical path for the done condition, so it lands
with step 3, not after it.

**A renderer release means re-running eleven repos.** This is the same
deliberate friction as the `@rtm/ingest` pin today — the property that makes a
report adopt an improvement knowingly — but it is now eleven repos rather than
one, and it wants a script.

**More moving parts at request time.** Today a plain page view is one
`ASSETS.fetch`. It becomes a pointer read (cacheable in the isolate, and in
`caches.default` keyed by hash) plus an R2 `get`. Both are binding calls of
comparable latency, per the Aug-21 doc's own §5 table, but it is two rather
than one and the pointer read is on every request.

---

## 7. The thing this fixes that nobody was tracking

`paragraphId()` lives in `src/lib/markdown.ts:53` — the **app** repo. Each
report's `baseline.json` records `markdownSha`, `words`, `blocks`, `headings`,
`footnotes`, `pageMarkers` and `poppler`. It does not record paragraph ids,
because ids are produced one stage later, in code the report repo has no pin
on.

So today an edit to `paragraphId()` can silently repoint every citation across
all ten reports on the next deploy, and no gate anywhere would see it. AGENTS.md
says paragraph ids *are the product*; they are currently the least governed
artifact in the system, and they are governed less than the markdown they are
derived from.

Moving rendering behind the pinned library fixes this by construction: an
id-affecting change becomes a versioned release that each report adopts
deliberately, with a baseline that can see the ids move. This is the strongest
argument for the change and it is independent of storage.

---

## 8. Steps, in order

**Step 1 — delete `body.json`.** *(app repo only, no new infrastructure)*

`body.json` is 55.5 MB of the 133 MB, is loaded whole into the Worker for any
`?p=`/`?h=` request and for the marked-passages block, and is the artifact
that breaks the 25 MiB ceiling first. Everything it is used for has a cheaper
source that already exists: `meta.paragraphToSection` names the section
holding any paragraph, so the quote can be extracted from that **section
fragment** (≤0.69 MB) instead of the whole report (19 MB).

Not from D1: `passages.paragraph_id` is an FTS5 `UNINDEXED` column, so a point
lookup is a table scan, and it would put the quote text in a second place
where it could drift from the page. Reading it back off the same render the
reader sees is the invariant `extractParagraph` is built on, and it is worth
keeping.

`?p=`/`?h=` affect only `description` and `image` in the `<head>`
(`src/templates/report.ts:83,120`) — the body HTML is byte-identical to the
static page. So the dynamic path becomes: fetch the pre-rendered page, replace
two meta tags, return.

**Step 2 — stop committing `assets/generated/`.** Gitignore it and make
`prerender` unskippable in the deploy path. 85% of git history is generated
output; under step 3 it is not the app repo's output at all. `verify.sh`
already runs `pnpm prerender` itself, so the checks are unaffected.

**Step 3 — move rendering into the pinned library and publish per report.**
Fragments to R2, passages and the pointer to D1, through the publish endpoint.
Assemble `/full` from fragments. Bring the corpus-level blast-radius check
(§6) and local-store seeding with it, not after it.

Steps 1 and 2 are useful on their own, are confined to the app repo, and do
not commit the project to step 3 — which touches eleven repos and should be
started only once §6 has an answer.

---

## 9. What it costs to be wrong

- **If step 1 is skipped:** Chilcot cannot be published without hitting the
  25 MiB asset cap, and every shared link to Leveson keeps paying a 19 MB
  parse on a cold isolate against a 128 MB memory limit. This one has a
  deadline attached to it, set by the next report on the list.
- **If step 2 is skipped:** nothing breaks; the repo keeps growing at roughly
  the size of the corpus per re-render commit, and clone time keeps rising.
  Cheap to defer, annoying to reverse later (history rewrite).
- **If step 3 is skipped:** the project keeps a working site with coupled
  cadences. This is a real option — steps 1 and 2 remove most of the pain,
  and the remaining cost is workflow rather than capability. The argument
  that does not go away is §7: paragraph-id governance stays broken.
- **If step 3 ships without §6's answer:** the corpus loses the check that
  exists because a fix aimed at one report silently changed three others.
  That is the failure mode this project has actually experienced, twice, and
  it would be reintroduced by the change meant to make reports more
  independent. Do not ship step 3 without it.
