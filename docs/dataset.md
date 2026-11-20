# The per-paragraph dataset

Decision [0029](decisions/0029-post-launch-content.md), bead reportsthatmatter-9uog, gated on the licences of [0024](decisions/0024-licences.md). One row per citable paragraph (a paragraph or a whole list, as the site addresses it) across every live report: the registry minus `ingested: false`. The rows are read from the pre-rendered section fragments, so a report's row count equals its `reports/corpus-baseline/<id>.json` `paragraphs` (`tests/dataset.test.ts` checks it).

## Build

```bash
pnpm prerender
pnpm dataset
```

`pnpm dataset` writes, all build output and not committed:

- `assets/generated/data/`: `reportsthatmatter-paragraphs.csv.gz`, `reportsthatmatter-paragraphs.jsonl.gz`, `licences.json`, `manifest.json`. `/data` (the one stable download page) and `/data/<file>` serve them. They are gzipped because a Workers static asset may not exceed 25 MiB. `scripts/deploy-cloudflare.sh` runs it after `pnpm prerender`; a deploy without it leaves the file links on `/data` returning 404.
- `build/dataset/hf/`: the folder to upload to Hugging Face (`README.md` card, `data/train.jsonl`, `licences.json`). It leaves out the reports whose text status is not settled (Hillsborough, Lehman; decided 2026-11-20); `/data` keeps them with their statements.

`docs/dataset/hf-card.md` is a reviewable snapshot of the card from the PR that added this; the real one is regenerated with the counts each time.

## Columns

`report, report_title, section, section_slug, paragraph_number, page, paragraph_id, text, official_pdf_url, site_url, licence, licence_status`. `paragraph_number` is our 1-based count in document order, not the report's own paragraph numbering. `page` is the printed page label. `official_pdf_url` ends `#page=<page>` only where the source is a PDF and the page is an arabic number; it is the printed page, not the PDF's own index, so it can open a few pages off (9/11: printed = PDF minus 17; decision 0001, b78.10). Recording each report's printed-to-PDF offset would make it exact.

## Licences

Each registry entry has `text_status: {kind, statement}`. The `licence` column is the label for the kind (`src/lib/dataset-licences.ts`); the full statement is on `/data`, in `licences.json` and in the card. Lehman is `not-established` (hx7j) and Hillsborough `not-open` (9kn4); the tests refuse to call either public domain or openly licensed. When a bead resolves one, change its `text_status` and `license`, and the page, card and rows follow.

## Upload to Hugging Face (Rufus; nothing here uploads)

Create the dataset repo, then from the site checkout:

```bash
pnpm prerender && pnpm dataset
huggingface-cli upload reportsthatmatter/paragraphs build/dataset/hf . --repo-type dataset --commit-message "Per-paragraph dataset"
```

(`hf upload` in the newer CLI takes the same arguments.) If the repo id is not `reportsthatmatter/paragraphs`, change `HF_REPO` in `scripts/lib/dataset-card.ts` first so the citation matches, and rerun `pnpm dataset`. No Parquet is written; Hugging Face converts the JSONL itself.
