<!-- The brief given to each blind adjudicator for the 38s.15 mini-references (one subagent per report). <draft> is the --out directory of `pnpm ingest referee draft`. See docs/scoring.md, "Mini-references". -->

# Adjudicating page breaks from page images (blind)

You are building a small answer key for a PDF-to-text pipeline: for each sampled page break of one report, decide from the printed page whether the running text's block **continues** across the page turn (join) or a **new block starts** (split).

Files, in `<draft>/<report>/`:
- `brief.json`: `cases[]`, each with `n`, `volume`, `old_page`, `page` (PDF pages), `prev_id`/`prev` (the line drawn as the old page's last line of running text), `next_id`/`next` (the line drawn as the new page's first), `old_lines` (the old page's last lines, with ids, from the PDF's text layer) and `new_lines` (the new page's first lines), and `images`: `NN-a-old.png` (lower part of the old page) and `NN-b-new.png` (upper part of the new page).
- Do NOT open `cases.json` (it holds the pipeline's answer; you must answer blind). Do not read the report's full.md or any pipeline output.

For each case, Read both images (Read tool on the PNG), then:

1. **Find the right lines.** The drawn `prev` should be the last line of running body text on the old page and `next` the first line of running body text on the new page. Running text = body paragraphs, block quotations, list items, headings. NOT running text: footnotes (below a rule, smaller type, starting with a note number), running heads/feet, folios (page numbers), Bates stamps, figure captions, sidebars, chart labels. If the drawn line is wrong, give the right one as `prev_id` / `next_id` using the ids in `old_lines` / `new_lines`. (If the right line is not in those lists, say so in `note` and give the best id you can.)
2. **Verdict** on those two lines:
   - `join`: the block ending at `prev` runs on at `next` — the same paragraph (or the same quotation, the same list item) continues. Cues: the sentence is unfinished at the foot and carries on; the new page's first line is flush left where paragraphs elsewhere on these pages start with a first-line indent; a hyphenated word split across the turn.
   - `split`: a new block starts at `next` — a new paragraph (first-line indent where the document indents, or a numbered paragraph "2.25", "11.9"), a heading, a bullet or list label, a new block quotation or a return from a quotation to prose, a contents/index/table entry, a new speaker in a transcript ("Mr. Sparks:"), a letter's address block, etc.
   - `unjudgeable`: only when the page cannot settle it (e.g. a figure or table page, two-column interleaving, an unreadable scan). Use sparingly.
   - Look at how paragraphs start elsewhere on the two images (indented? spaced? flush?) before calling a flush first line a new paragraph. If the old page's last sentence ends with a full stop and the new page's first line is flush in a document that indents paragraphs, the paragraph runs on: `join`. If the document sets paragraphs flush (block style), the page alone may not settle it: decide by the content and write "by content" in `note`.
   - A paragraph that ends at the foot of the old page with a heading or numbered paragraph on top of the new page is `split`.
3. **between**: what stands between the two lines on the page, other than routine running heads and folios: `none`, `notes` (footnotes at the foot of the old page, below the last running line), `caption`, `figure`, `table`, `sidebar`, `heading`, `other`.
4. **note**: a few words of why, required for every `join` after a finished sentence, every `unjudgeable`, every "by content" call and every corrected line; optional otherwise.
5. **sure**: `true`, or `false` if you are guessing.

If an image does not show enough, render more of the page yourself: `pdftoppm -f <page> -l <page> -r 110 -png -singlefile "<pdf>" <scratch>/p<page>` (the PDF paths are in `brief.json`'s `pdfs`, by volume), then Read it.

Write `<draft>/<report>/verdicts.json` as a JSON array, one object per case, in order:
`[{"n": 1, "verdict": "join", "prev_id": 22, "next_id": 0, "between": "notes", "note": "…", "sure": true}, …]` (include `prev_id`/`next_id` always, corrected or not).

Finish with a one-paragraph summary: counts of join/split/unjudgeable, how many lines you corrected, and any case you were unsure of (with why). Answer every case; do not skip.
