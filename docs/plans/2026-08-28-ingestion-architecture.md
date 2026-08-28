# Ingestion architecture — where parsing logic lives, and how reports stay reproducible

**Date:** 2026-08-28
**Status:** decided 2026-08-28. Implementation plan to follow.
**Supersedes in part:** [`2026-08-01-architecture.md`](2026-08-01-architecture.md) §3
**Relates to:** #106 (corrections.yaml), #105, #104, #103, #101, #117, #31

---

## 0. The question

`scripts/ingest/` is one shared pipeline serving five reports, with roughly
forty more filed as issues. The Leveson fix (f07a860) exposed the structural
problem: multi-PDF volume boundaries turned out to be *semantic input* —
flattening every PDF and computing document-wide geometry made repeated running
headers into prose and ordinary continuation lines into blockquotes. The fix
retained the input groups and applied furniture removal only to multi-volume
reports.

That fix is correct in substance. The question it raises is architectural:

> How do common parser improvements coexist with report-specific knowledge,
> without polluting other reports or requiring a full-corpus re-ingestion after
> every change?

---

## 1. Findings — what is actually true today

Measured against the tree at f07a860, not estimated.

### 1.1 The ingestion fidelity gate is a tautology

`runVerify` (`scripts/ingest/cli.ts:134`) looks for `reports/<id>/source.pdf`.
**No report has one.** So every report falls to the branch at line 143:

```ts
const markdown = readFileSync(markdownPath, "utf8");
allOk = reportChecks(target.id, runChecks(markdown, markdown)) && allOk;
```

— comparing the file to itself. `pnpm ingest verify` today:

```
uk-leveson-inquiry
  ✓ output words all appear in the source — 1051348 words, all accounted for
  ✓ content retained from source — 100.0% (1051348/1051377 words)
```

Every report reports exactly 100.0%; the ~29-word gap is front matter. Fidelity
layers 2 and 3 — the checks that exist to catch "the pipeline silently destroyed
something" — have never run in `verify.sh`. Only the five structural checks do
real work. The retention figures quoted in #77 (99.0%, 98.7%, 99.8%, 99.4%) are
from *ingest* time and are never re-checked.

This is the largest single hole and the cheapest to close.

### 1.2 No report records how it was produced

`full.md` is the output of a shell command whose arguments — which PDFs, in what
order, with what metadata — are recorded nowhere. `registry.yaml` carries
`source_url`, which is a landing page, not a file. For Leveson the *order of
four PDFs* is semantic input (running footnote numbers, continuous page
indices) and survives only in a shell history.

This is why #108's instructions had to paste a PDF path into the issue body and
say "check `reports/registry.yaml`" for the metadata. Re-ingestion is not
reproducible by anyone who was not there when it was first run.

### 1.3 Re-ingestion is cheap; it is *review* that is expensive

Measured 2026-08-28, poppler 26.08.0:

| Report | Extract | Parse | Pages | Output |
| --- | --- | --- | --- | --- |
| Litvinenko | 376 ms | 93 ms | 329 | 0.80 MB |
| Challenger | 290 ms | 112 ms | 438 | 0.84 MB |
| Leveson (4 volumes) | 2,485 ms | 722 ms | 2,022 | 6.89 MB |

**The whole corpus re-ingests in about five seconds.** "Unsafe full-corpus
re-ingestion" is not a compute problem. It is a *review* problem (nobody can
read a 50,000-line diff) and a *citation-stability* problem (paragraph ids and
page anchors move). Every mechanism below is aimed at those two, not at speed.

### 1.4 `pageGroups.length > 1` is standing in for a layout declaration

`pipeline.ts:71-77`:

```ts
// A repeated running header is meaningful evidence only when every source
// volume supplies its own repeated page furniture. Preserve the established
// single-PDF path until that separate layout class has its own evidence.
const cleanedGroups =
  pageGroups.length > 1 ? splitGroups.map(stripRepeatedPageFurniture) : splitGroups;
```

"This document has repeated running furniture and per-volume geometry" is a
property of the *document*. It is currently inferred from *how many arguments
were typed on the command line*. A single-PDF report with running headers cannot
get the fix; a multi-PDF report that is one continuous typesetting run gets
per-volume margins it does not want.

The comment is candid about what it is: a compatibility hedge. **It is isolation
being smuggled in through a heuristic, because the architecture offers no honest
place to express it.** That matters for §4 — the project has already discovered
it needs per-report isolation; it just has nowhere to put it.

### 1.5 There is no corpus regression signal

`tests/ingest.test.ts` is 1,015 lines of hand-written synthetic fixtures. They
are good tests. Every one of them passed while the Leveson defect shipped.
Nothing measures what a heuristic change does to the five real documents.
`AGENTS.md`'s rule — "a heuristic deserves testing against the messiest source
in the corpus" — is a human instruction where it should be a check. #108 proved
the manual method is subtle enough to get wrong once already: poppler drift was
initially read as a code regression.

### 1.6 `full.md` is a lossy intermediate

The pipeline knows which volume, which PDF page, which printed page, and which
block kind produced each line — then discards all of it at
`blocksToMarkdown`. Downstream (`prerender`, `sections`, `passages`, `search`)
re-derives structure by re-parsing markdown. This is why "which volume did this
come from?" is unanswerable at review time, and why a correction has nothing
stable to address except a bare string.

### 1.7 Four of five published reports are already stale, and nobody could tell

Measured 2026-08-28 by regenerating every report from its source with today's
code and today's poppler, then isolating the code change from tool drift with
the procedure `AGENTS.md` mandates (`git checkout f07a860~1 -- scripts/ingest/`,
regenerate both sides, diff *those*):

| Report | f07a860 changed it | Committed file is stale by |
| --- | --- | --- |
| uk-leveson-inquiry | yes (intended) | — regenerated, identical |
| litvinenko-inquiry | **yes, unintended** | 3 hunks |
| us-psi-financial-crisis | **yes, unintended** | 39 hunks (2 from f07a860) |
| challenger-accident | **yes, unintended** | 37 hunks (21 from f07a860) |
| jack-smith-vol1 | no | 104 hunks, from earlier changes |

Two things follow, and the second is the important one.

**The Leveson fix changed three other reports without anyone noticing.** Its own
comment says it "preserve[s] the established single-PDF path", and the
`pageGroups.length > 1` guard does protect the multi-volume behaviour — but the
commit's other edits to `paragraphs.ts` and `clean.ts` leaked into every
single-PDF report. Nobody could tell, because nothing measures it (1.5).

**Every leaked change is an improvement.** They are paragraphs correctly rejoined
across a page break — `(1)` followed by an orphaned clause becomes
`(1) which includes materials submitted for the record, staff investigations,
interviews, and trips.` The pipeline got better and the *published site did not*,
because only Leveson was re-ingested.

So the failure this architecture is meant to prevent has already happened, in
both directions at once: an improvement propagated where it was not expected
(silently), and failed to reach the published text where it was wanted
(silently). That is the whole argument for §5 and §7, observed rather than
predicted.

Republishing these four is a separate, reviewed decision — `AGENTS.md` is
explicit that a re-ingest is not published as a side effect of anything else.

### 1.8 `pdftotext` is unpinned and drifts (#117)

An external dependency that changed under the project mid-flight, in a system
whose promise is "a citation resolves to the same text forever". Combined with
1.2 and 1.5, you cannot separate tool drift from code change without the
double-regeneration procedure in `AGENTS.md`.

---

## 2. Decisions taken (Rufus, 2026-08-28)

| | Decision |
| --- | --- |
| **D1** | Report repo holds `ingest.*` and `corrections.yaml`. Site repo reads sibling checkouts via a manifest pinning each report repo. |
| **D2** | **The authoritative `full.md` lives in the report repo.** The site build is an *aggregation*. Rationale: contributors — human and AI — get a much narrower surface to examine. |
| **D3** | Printed page numbers are low value as content. Textual annotations as **sidecar metadata** is the better shape in the long run, but it is not pressing — **KISS applies**. Volume-prefixed identifiers (`v1-p42`) are the pragmatic step; the sidecar is deferred (§4). |
| **D4** | Subsumed by D6. |
| **D5** | Corpus baseline check runs in `verify.sh`. |
| **D6** | **Composition with shared passes** (§5). The report repo commits a real pipeline program; the passes it composes are core-library code by default, with an escape hatch and empirical promotion. |

---

## 3. What follows from D2

D2 is more consequential than it looks. If the report repo owns the
authoritative markdown, it must also own the thing that *produces* it —
otherwise the authoritative artifact is generated by a program its own repo
cannot run, and "authoritative" means nothing.

So the report repo holds, at minimum:

```
<report-repo>/
  archive/*.pdf           provenance, checksummed
  datapackage.json        already exists — the source manifest
  ingest.*                the build recipe (form is §5)
  corrections.yaml        human judgements, applied deterministically
  full.md                 AUTHORITATIVE — generated, committed, never hand-edited
  pages.json              page/volume metadata — deferred, see §4
  fidelity.md             the OCR review queue
  baseline.json           regression digest (§7)
```

and the site repo holds a manifest:

```yaml
# reports/manifest.yaml
- id: uk-leveson-inquiry
  repo: reportsthatmatter/uk-leveson-inquiry
  ref: v1.2.0
```

with the aggregated copy carried in `reports/<id>/full.md` for serving, as
today. The duplication is deliberate: deploys stay reproducible and do not
depend on another repo's availability at build time.

### The rule that has to be rewritten

`AGENTS.md` currently says:

> **Fixes go in the pipeline, not in its output.** Never hand-edit a generated
> `reports/*/full.md`; correct `scripts/ingest/` and re-run. Each fix then
> compounds across every future report.

Under D2 the first half stands and the second half becomes conditional.
Compounding is no longer automatic; it becomes something the architecture has to
work to preserve. §5 is exactly that argument.

---

## 4. Page metadata: volume-prefix now, sidecar later (D3)

Today `%%page N%%` is a block in the content stream (`paragraphs.ts:573`),
rendered to `<a class="page-marker" id="page-42">` (`markdown.ts:126`) and read
back out of the *HTML* by `sections.ts:58`. Page numbers are load-bearing inside
the text.

D3 says the text should be as stable as possible and this is metadata. The
long-run shape is a sidecar keyed by something already stable — and paragraph
ids are already text-derived and stable by design:

```json
{ "p-the-inquiry-was-established": { "volume": 1, "printed": 42, "pdfIndex": 58 } }
```

This converges with 1.6: the sidecar *is* the provenance map the structured
intermediate would carry. One mechanism, two motivations.

**But it is deferred, and deliberately.** Rufus, 2026-08-28: the sidecar "may be
better but i don't mind too much right now (and KISS is always good)." Moving
page markers out of the markdown changes every existing `#page-N` anchor — a
citation-stability event — and touches `markdown.ts`, `sections.ts` and
`anchor.ts`. That is a real cost for a benefit nobody is currently asking for.

So the plan does the cheap half now and leaves the door open:

- **Now:** volume-prefix the identifiers (`v1-p42`), so Leveson's four restarting
  page sequences stop colliding. One anchor change, done once, while the
  archive is still five reports.
- **Later, if wanted:** `pages.json` keyed by paragraph id. Stage 2 (provenance
  through the pipeline) produces everything it needs, so the sidecar becomes a
  serialisation choice rather than a re-architecture. Nothing is foreclosed.

---

## 5. The decision: core library + per-report pipelines, composed not forked

Rufus's proposal: a **core library** of tooling and approaches (possibly a
skill), with the **actual parsing pipeline written per report, in the report
repo**. That is what runs; `full.md` is authoritative there; the site aggregates.

### The case for it is strong

1. **Narrow surface.** An agent working on Leveson opens the Leveson repo and
   sees exactly the code that produced Leveson's text. Today those decisions are
   implicit and invisible (1.4).
2. **No cross-report blast radius.** A Leveson change cannot break Challenger.
   This dissolves the opening question by construction.
3. **It scales.** ~40 reports are already filed as issues. One engine
   accumulating 40 documents' special cases is not a credible endpoint.
4. **It matches how the work actually is.** The 2026-08-01 doc already said
   ingestion is "per-report, iterative, and messy, while rendering is uniform".
5. **The codebase already voted for it.** 1.4 is isolation implemented as a
   heuristic because there was nowhere else to put it.

### The cost, stated precisely

**Improvements stop compounding, silently.** If Leveson's pipeline is *forked
code*, a footnote-recall fix discovered while working on Leveson never reaches
Challenger unless someone deliberately upstreams it and re-runs — and with 50
reports, "upstream then re-run 50" is the corpus-wide re-ingestion we are trying
to avoid. So in practice it does not happen, and report quality diverges by
*ingestion date*. Report 12 quietly stays worse than report 37 forever, and
nobody can see it.

Secondary costs: version skew (report pins core v3, core is at v11); the
"is this core or report-specific?" judgement does not disappear, it just moves;
and the shared library loses its test corpus, because today the site repo *is*
the corpus.

### Decided (D6): isolate the composition, share the algorithms

The two positions answer different questions. D2 settles **ownership and the
artifact**: the report repo owns its build and its `full.md`. The remaining
question was whether the per-report thing is a *forked program* or an *explicit
composition*. **Composition, decided 2026-08-28.**

The report repo commits a real program that names every decision, but the passes
it composes are core-library code by default:

```ts
// uk-leveson-inquiry/ingest.ts
import { pipeline, passes } from "@rtm/ingest";

export default pipeline({
  volumes: fromDataPackage("./datapackage.json"),   // ordered, checksummed
  segment: [
    passes.printedPageNumber({ position: "foot" }),
    passes.runningFurniture(),                       // ← the Leveson fix, opted into
    passes.footnoteBlock({ layout: "inline" }),
  ],
  structure: [
    passes.geometry("per-volume"),                   // ← was pageGroups.length > 1
    passes.headings(), passes.lists(), passes.quotes(),
  ],
  corrections: "./corrections.yaml",
});
```

Properties:

- **Narrow surface, and better than today.** One file names every decision that
  shaped this report's text. `pageGroups.length > 1` becomes
  `passes.runningFurniture()` — visible, opt-in, available to a single-PDF
  report that needs it.
- **A real escape hatch.** A report needing something bespoke writes an inline
  pass right there, without asking permission. Columbia's two-column handling
  (#101) can live in the Columbia repo until it is proven.
- **Compounding is preserved where it is cheap** — shared passes stay shared —
  and abandoned where it is expensive.
- **Promotion becomes empirical.** Write it in the report repo. When a third
  report writes the same pass, move it to core. This is a far better rule than
  deciding a priori what deserves to be a flag.
- **Divergence becomes visible instead of silent.** Each report pins a core
  version; `rtm ingest outdated` lists which reports are behind and what would
  change if they caught up. Re-ingestion is per-report, opt-in, and diffed —
  never corpus-wide, never forced.

That last point is the actual answer to §0, and it only works because D2 put the
build in the report repo.

### The line to hold

**Composition per report: yes. Forked algorithms: only through the escape
hatch, and watch what accumulates there.** If two reports independently fork
`footnoteBlock`, that is the signal to fix the core pass, not to accept the
fork. The escape hatch is a staging area, not a destination — anything that
lives there for three reports has failed to be promoted, and that is a bug in
the review habit, not in the design.

### A consequence that must not be missed

Today the site repo is the pipeline's test corpus. Move pipelines out and the
core library loses its regression signal. So **the core library must carry the
golden page fixtures** (§7.2) — real extracted pages from every report,
committed as text in the library repo. That is how the library keeps a corpus
without owning the reports.

### Distribution

npm publishing is overhead for a one-person-plus-agents project. A git
dependency pinned to a tag gives exact pinning with no registry admin:

```json
"@rtm/ingest": "github:reportsthatmatter/ingest#v0.4.0"
```

---

## 6. Corrections (#106, unblocks #105)

Corrections are **assertions, not patches**:

```yaml
version: 1
corrections:
  - id: c-0031
    where: { volume: 2, printed: 380 }
    find: "So Help 1\;fe Godp. 451"
    replace: "So Help Me God p. 451"
    reason: small-font OCR; checked against the scan
    added: 2026-08-28
```

- Applied after structure, scoped to the addressed page, before serialisation.
- **Every correction must match exactly once.** Zero matches, or more than one,
  fails the build naming the id. A stale correction is a loud error, never a
  silent skip — this is what keeps output reproducible while the parser beneath
  it changes.
- `find` matches normalised block text, so it survives whitespace changes.
- The lossless fidelity check must be told about corrections (replaced text
  legitimately is not in the source), exactly as it already accounts for
  `autoFix`.
- Count them in front matter and `fidelity.md`. "14 human corrections applied,
  each recorded" is a credibility feature for this project, not plumbing.

**A correction describes the text. A pass describes how to read the source.** If
you are writing a correction to undo something the parser did, you needed a
different pass or a bug fix.

---

## 7. Testing and corpus regression

### 7.1 Unit — keep as is
`tests/ingest.test.ts`, synthetic fixtures per heuristic. Moves to the core
library.

### 7.2 Golden page fixtures — the missing layer
~30 *real* extracted pages, committed as plain text in the core library, chosen
for being hard: a Leveson running-header page, a PSI stacked-footnote page, a
garbled Challenger page, a two-column Columbia page. Each with an expected
`Block[]` JSON. Real input, cheap, reviewable diffs. This is what keeps the
library honest once the reports live elsewhere (§5).

### 7.3 Corpus baseline — per report
`baseline.json` in each report repo: block counts by kind, heading list,
footnote count, page-marker count, retention %, sha of `full.md`. `ingest check`
re-runs and diffs the digest. A change that moves the digest must land with an
updated baseline in the same commit, or it fails. Affordable because of 1.3.

### 7.4 Fix the gate
`ingest verify` must use the real source PDFs — now findable, because the recipe
is recorded — or **fail saying the source is unavailable**. Never compare a file
to itself (1.1).

---

## 8. Versioning, re-ingestion, publishing

A derived `content_version` per report: hash of (core library version, poppler
version, source checksums, `ingest.ts`, `corrections.yaml`). Computed, never
hand-maintained — the same discipline as `search_index_versions`, which cannot
drift from what was actually indexed.

Workflow:

1. Change a pass in the core library; release a tag.
2. `rtm ingest outdated` names the reports whose output would move.
3. For each, on its own schedule: bump the pin, regenerate, diff. The "before"
   side regenerates mechanically with the same tool version, which kills the
   #108 class of error by construction.
4. Review; commit `full.md` and `baseline.json` together in the report repo;
   tag.
5. Site build picks up the new tag in `manifest.yaml`; `content_version` bumps;
   `pnpm cards` re-resolves share quotes; search re-indexes.

Pinning poppler (#117) falls out for free: record the version, fail the build on
mismatch, and make the override force a baseline review.

---

## 9. Staged migration

Each stage is shippable on its own. Stages 0–3 change no output, which is what
makes them safe to do quickly.

**Plan A — stages 0–3, no output change.** Split into two plans, because
recipes-and-regression and core-library-extraction are separate subsystems:
**A1** is stages 0–1 plus the republish §1.7 makes necessary
([plan](2026-08-28-ingestion-plan-a1-implementation.md)); **A2** is stages 2–3,
written once A1 lands, since it needs A1's baselines to prove it changes no
output.

| | | Output changes? |
| --- | --- | --- |
| **0** | Fix `ingest verify` (1.1). Record the build recipe for all five reports; assert byte-identical output | no |
| **1** | Baseline digests + golden page fixtures; wire into `verify.sh` (D5) | no |
| **2** | Provenance through the pipeline; fidelity and suspects cite volume + printed page | no |
| **3** | Extract the core library; per-report `ingest.ts`; `runningFurniture` and `geometry` become opt-in passes (D6) | no |

**Plan B — stages 4–7, deliberate output changes.** Separate plan, written once
Plan A has landed and the shape has survived contact.

| | | Output changes? |
| --- | --- | --- |
| **4** | Move `full.md` authority to the report repos; site manifest + aggregation build (D2) | no |
| **5** | `corrections.yaml` (#106, unblocks #105) | yes |
| **6** | Volume-prefixed page anchors (`v1-p42`) (D3) | yes |
| **7** | `content_version` + poppler pin (#117) | no |

**Stage 0 is the highest value per line of code in the plan.** It is small, and
it is what makes every later stage reviewable.

---

## 10. Still open

Nothing blocking. Two things to settle in passing, both inside Plan A:

- **Where the core library lives.** A separate `reportsthatmatter/ingest` repo is
  cleaner once the reports own their builds; staying in the site repo and being
  consumed by path is one fewer repo to run. Decide at stage 3, when the extraction
  is actually being done and the cost of each is visible — not before.
- **Whether `pages.json` ever ships.** Deferred by D3 (§4). Stage 2 produces
  everything it would need, so this stays a cheap option rather than a
  commitment.
