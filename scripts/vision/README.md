# Vision-model structure pass (reportsthatmatter-kyj3)

Research tooling, measure-only: nothing here changes a served text. Design, results and the recommendation: [`docs/design/2026-10-03-vision-structure-pass.md`](../../docs/design/2026-10-03-vision-structure-pass.md).

The idea: a vision model (granite-docling, 258M parameters, on a laptop) reads each scanned page image and returns structure (paragraphs, headings, list items, footnotes apart from body text, where the markers sit). We trust it for structure and never for words: every page is checked against the PDF's own text layer, the model's structure is accepted only where its words agree with the layer, and the accepted block carries the layer's words.

```bash
# once: a Python >= 3.10 venv (the system python is 3.9). uv: pip install --user uv
uv venv --python 3.11 .venv-vision && uv pip install --python .venv-vision/bin/python docling mlx-vlm

# 1. read every page (resumable; cache <report-repo>/.cache/vision/<pdf sha256>/<backend>/pNNNN.{doctags,md,json}); ~7 s/page with mlx on an M-series Mac, ~90 s with --backend cpu
.venv-vision/bin/python scripts/vision/run.py ../jack-smith-report [--pages 1-30,45] [--backend mlx|cpu]
.venv-vision/bin/python scripts/vision/run.py ../jack-smith-report --manifest     # reference/vision/manifest.json + doctags.jsonl.gz (committed)
.venv-vision/bin/python scripts/vision/run.py ../jack-smith-report --unpack       # restore the cache from the committed pack: no model needed for steps 2-4

# 2. check every page against the text layer (reference/vision/verification.{md,json}, verified/pNNNN.{json,md})
pnpm exec tsx scripts/vision/verify.ts ../jack-smith-report [--pages 1-30] [--backend cpu] [--out dir]

# 3. score against the hand-checked pages in <report-repo>/reference/page-text/ (see docs/scoring.md): words, block starts, headings, notes, markers
pnpm exec tsx scripts/vision/compare.ts ../jack-smith-report [--out file.md]

# 4. verified vision structure against golden.yaml and the layout oracle
pnpm exec tsx scripts/vision/structure-check.ts ../jack-smith-report [--lenient] [--ours <oracle.json of the pipeline run>]

# a draft page reference from the cached output, for a person to correct against the image
pnpm exec tsx scripts/vision/draft-page-text.ts ../jack-smith-report 10,13,19 /tmp/draft
```

`RTM_VISION_CACHE` points the cache elsewhere (a worktree has no `.cache/` of its own). Library code is `src/lib/vision/` (`doctags.ts` parse, `verify.ts` the check, `compare.ts` the metrics), tests `tests/vision.test.ts`.

## What the check does (`src/lib/vision/verify.ts`)

1. The model's words and the layer's words are aligned with the scorer's aligner (`src/lib/score/align.ts`).
2. A block is **accepted** when at least 90% of its words are in the layer, no run of more than 4 of its words is missing, and the layer has no 4-word run inside the block that the model lacks. `--lenient` (in code: `minAgreement` 0.75, `maxRun` 8) trades word agreement for structure on citation-dense notes whose OCR is noisy.
3. An accepted block is written with the **layer's** words (a misread word never reaches the output) and the model's type. A rejected block keeps the layer's words as plain text and is flagged. Runs of 4 or more layer words that the model never reached (a dropped line) are kept and flagged.
4. The layout is a second witness for the one structural claim the words cannot check, which blocks are footnotes: the model tags notes inconsistently (Jack Smith p13), the layout knows which lines are set in the note size (at most 0.88 of the document's body size). A block that is at least 70% note-size lines becomes a footnote, a "footnote" under 30% becomes body; markers are found again with the corrected labels.
5. Page status: `accepted` (every block accepted), `partial`, `flagged` (nothing accepted: blank pages, figures, tables, degenerate output).
