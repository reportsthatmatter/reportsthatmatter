# Ingestion Plan A2 — provenance, and the composition API

> **For agentic workers:** the steps are checkboxes; every step but A2.4 must leave all five reports byte-identical, proven by `pnpm ingest check`.

**Goal:** Replace `pageGroups.length > 1` with a declared property of the document, and give each report a pipeline it owns — a real program naming every decision that shaped its text, composed from shared library passes.

**Spec:** [`2026-08-28-ingestion-architecture.md`](2026-08-28-ingestion-architecture.md) §5 (D6, composition with shared passes) and stages 2–3 of §9.

**Predecessor:** [Plan A1](2026-08-28-ingestion-plan-a1-implementation.md), landed. Its baselines are what make this plan safe: `pnpm ingest check` proves each step changes no output.

## Global constraints

- **Byte-identical output at every step except A2.4**, which changes only `fidelity.md` (a review queue, not published content).
- `./scripts/verify.sh` exits 0 before each commit.
- Poppler stays **26.08.0**.
- Passes select among implemented behaviours. **No pass takes a regex or a pattern** — the moment configuration can express a pattern it has become untested source code.

---

## A2.1 — Provenance through the pipeline

`Page` carries `{volume, pdfIndex}` alongside its global `index`; `SplitPage` and every `Block` inherit it; footnotes and OCR suspects cite volume and printed page instead of a flattened index.

- [ ] `extract.ts`: `extractPages` sets `pdfIndex` (1-based within its own PDF). `volume` is assigned by the caller, which is the only place that knows the order.
- [ ] `clean.ts`: `SplitPage` gains `volume` and `pdfIndex`, copied from its `Page`.
- [ ] `paragraphs.ts`: `Block` gains an optional `at?: { volume: number; pdfIndex: number; printed: number | null }`. `blocksToMarkdown` ignores it — this is the step that keeps output byte-identical.
- [ ] `pipeline.ts`: attach `at` to every block as it is emitted; carry volume onto `Footnote` and `Suspect`.
- [ ] `cli.ts`: `fidelity.md` prints `Vol 2 · p.380` rather than a flat page index.
- [ ] `pnpm ingest check` — expect ✓ on all five. Commit.

## A2.2 — Split `splitPage` into two passes

`splitPage` currently does two unrelated things. They are already separate blocks of code inside it; separating them is what makes them composable.

- [ ] `takePrintedNumber(lines): { printed, lines }` — the foot-then-head search.
- [ ] `splitFootnoteBlock(lines, expectedNote): { body, footnotes }` — `noteCandidates` + `chooseBlockStart`.
- [ ] `splitPage` becomes their composition, so existing tests keep passing unchanged.
- [ ] `pnpm ingest check` ✓. Commit.

## A2.3 — `pipeline()` and `passes`

The architectural centre. `pageGroups.length > 1` disappears.

- [ ] `scripts/ingest/passes.ts`: `passes.printedPageNumber()`, `passes.footnoteBlock()`, `passes.runningFurniture()`, `passes.geometry("per-volume" | "document")`, `passes.blocks()`.
  `passes.blocks()` wraps `toBlocks` whole. Headings, lists and quotes are interwoven there and decomposing them is high-risk and low-value today — recorded as known coarse granularity, not pretended away.
- [ ] `scripts/ingest/define.ts`: the `PipelineDef` type and `pipeline(def)`, which validates and returns it.
- [ ] `pipeline.ts`: `runPipeline(def, pageGroups)` executes the declared passes. `ingestPageGroups` stays as a thin wrapper so nothing else breaks yet.
- [ ] Leveson's definition declares `runningFurniture()` and `geometry("per-volume")`; the other four declare neither. **That is what must reproduce byte-identically** — it proves the declaration captures exactly what the argument-count heuristic did.
- [ ] `pnpm ingest check` ✓. Commit.

## A2.4 — Per-report `ingest.ts`

The recipe stops being data the pipeline interprets and becomes a program the report owns.

- [ ] `reports/<id>/ingest.ts` — default-exports `pipeline({...})` with metadata, checksummed volumes, and its passes. Replaces `ingest.yaml`.
- [ ] `cli.ts` loads it by dynamic import; `parseRecipe` and the YAML path are removed along with their tests.
- [ ] Only `fidelity.md` may change. `pnpm ingest check` ✓ on all five. Commit.

## A2.5 — The core library boundary

- [ ] `scripts/ingest/index.ts` exports the public surface — `pipeline`, `passes`, and the types a report definition needs — and nothing else. This is the module that becomes `@rtm/ingest` when the reports move to their own repos (Plan B, stage 4).
- [ ] `README.md` in `scripts/ingest/`: the five stages, what a pass is, the escape hatch, and the promotion rule — write it locally, and when a third report needs the same pass, move it to the library.
- [ ] `AGENTS.md`: rewrite the "fixes go in the pipeline" rule for the world where compounding is no longer automatic.
- [ ] `./scripts/verify.sh` exits 0. Commit.

## Known, accepted

- `passes.blocks()` is one coarse pass rather than separate heading/list/quote passes. Splitting it is future work and wants the golden fixtures to grow first.
- #120's two defects stay live; they are covered by baselines, so they cannot spread silently.
