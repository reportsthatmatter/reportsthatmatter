# Annotation format: what we add to a report's text, and where it lives

**Date:** 2026-10-03. **Bead:** reportsthatmatter-i8en. **Decision record:** [0002](../decisions/0002-annotation-format.md) (proposed). **Related:** [0001](../decisions/0001-page-numbers.md) (page numbers, proposed), [0008](../decisions/0008-paragraph-ids-move.md) (ids move, decided), [0010](../decisions/0010-markdown-canonical-format.md) (markdown is canonical), c0h (remark migration), b78.10 (page-label scheme). **Status:** in progress. This is a reference doc and a recommendation; Rufus decides.

## 1. The answer in one paragraph

Keep `full.md` plain CommonMark plus GFM footnotes, with exactly one inline extension: the page milestone `%%page N%%`, which we keep but allow *inside* a paragraph at the word where the printed page begins (today it can only sit between blocks, so about half of all page starts are misplaced). Leave printed paragraph numbers as the report's own text, and have the renderer recognise them from a pattern declared in front matter. Record everything else the pipeline knows per block (id, pages, printed number, source edition) in a generated, line-per-block sidecar `blocks.jsonl` next to `full.md`, so ids and provenance are explicit without cluttering the text. Keep human layers (corrections, editorial, reader marks) in sidecars, as now, but give them one anchor model: paragraph id plus a quotation (W3C Web Annotation's FragmentSelector refined by a TextQuoteSelector, which most of our files already use informally), resolved through `aliases.yaml` and then by searching for the quotation. Don't put attribute syntax (`{#id .class}`), CriticMarkup or MyST roles into `full.md`. Export the layers as W3C Web Annotation JSON-LD for anyone who wants to reuse them, rather than authoring in it.

## 2. Inventory: what we add today, and where it lives

`full.md` is a build output: the pipeline writes it from pinned sources, the report's `ingest.ts` passes and `corrections.yaml`, and the next ingest overwrites any hand edit (fidelity.md says so in as many words). So "inline" means "something the pipeline emits", and anything a human adds must live in a sidecar to survive re-ingestion. That constraint decides more of this design than any syntax preference.

| What | Where | Form | Written by | Anchored by | Read by |
|---|---|---|---|---|---|
| Printed page starts | `full.md` | block line `%%page 116%%`; `%%page 1#2%%` for the second page labelled 1 when pagination restarts (22 such lines, in Challenger, Jack Smith and Saville) | pipeline (`paragraphs.ts`, `edition.ts`) | position, block granularity only | renderer (`page-116` anchor, `data-page` on each paragraph), fidelity, baseline, site quality signals and scorers (`src/lib/quality`, `src/lib/score`), `scripts/wikisource/map.mjs` |
| Page-label scheme (printed vs PDF index, offset) | nowhere | — | — | — | scorers guess; 9/11's `reference/wikisource/pagemap.json` measured `our_label_offset: -17` once (b78.10) |
| Paragraph ids | nowhere: derived at render time | first five non-stopword words, `-2`, `-3` suffixes in document order (`paragraphId()` in `@rtm/ingest` `markdown.ts`) | renderer | the paragraph's own opening words | every link, `?p=`, search, editorial, marks |
| Section slugs | nowhere: derived from `##` headings | slug | renderer | heading text | section pages, `aliases.yaml` `sections:` |
| Printed paragraph numbers (UK inquiries) | `full.md`, as text | three encodings: `1.1 The object…` (Saville, Leveson, Litvinenko, Hillsborough body), `1\. …` (Chilcot, after 4qw), `1. In 1981…` (Hillsborough summary: 384 paragraphs CommonMark reads as an ordered list, so they get no id and no permalink; bead woke) | pipeline | — | nothing: no `para-3.120` anchor exists |
| Id history | site `reports/<id>/aliases.yaml`, `published-ids.txt` | YAML map old → new, plus `unmatched:` list; one id per line | `pnpm aliases generate` (q8c) | id | Worker `?p=` redirect via meta.json, verify |
| Corrections | report repo `corrections.yaml` | `find`/`replace` + optional `where: {volume, printed}`; `dismissed:` with `match` | humans | exact text, optionally narrowed to a printed page | pipeline's last pass; fails the build unless each matches exactly once |
| Fidelity queue | report repo `fidelity.md` | generated markdown table: pattern, text, "Vol 1 · PDF p.49", context | pipeline | text + PDF page | humans |
| Source provenance (files) | report repo `datapackage.json`, `reference/manifest.json` | path, URL, SHA-256, licence, date fetched | humans, scripts | file | PROCESSING.md, reviewers |
| Source provenance (per block: clean edition, PDF or correction) | nowhere | — | `edition.ts` knows it in memory (`order: {block, source}`) and drops it | — | — |
| Reference editions | report repo `reference/` | `blocks.jsonl` (one reference block per line: type, level, num, text, section, markers, i), `wikisource/pages/*.wiki` + `pagemap.json`, `adjudicated.yaml` (page-break verdicts keyed by PDF page and the prev/next line text) | scripts, agents | text, PDF page | `pnpm score` |
| Golden pages | report repo `golden.yaml` | per PDF page: printed label, blocks as `{start, end}` text quotes, markers, `must_read` | agents reading page images | PDF page + text quotes | `pnpm ingest verify` |
| Editorial (intros, findings, highlights) | site `editorial/<id>.yaml` | `paragraph: <id>` + verbatim `quote:`; `cites: [ids]` | humans, agents | id + quotation | `pnpm editorial` (fails on an unresolved id or quote), landing pages |
| Reader marks | D1 `marks` table | `paragraph`, `exact`, `prefix`, `suffix`, `page INTEGER` | readers | id + text quote (W3C TextQuoteSelector shape) | the reading view; `page` can't hold a roman label |
| Processing notes | `PROCESSING.md` | prose | humans | — | readers |

Numbers, from the site's `reports/` on origin/main today: 13 reports, 7,604 page markers, 50,228 published ids, 5,160 aliased and 4,101 unmatched (8% of all ids ever published now resolve nowhere; Leveson alone has 2,070 unmatched), 68 corrections in 4 reports (Challenger 56, Chilcot 8, Jack Smith 3, 9/11 1).

Three things stand out:

1. **We already anchor by quotation almost everywhere.** Golden pages, adjudicated breaks, editorial, corrections and reader marks all point at text by quoting it, sometimes narrowed by an id or a page. Only the page markers (position) and the ids (derived) work differently. The design should name and standardise the model we have already converged on, not invent one.
2. **Page milestones are block-granular, and that loses information.** The pipeline moves a page marker that falls inside a paragraph to after the paragraph (`mergeAcrossPages`: "the sentence belongs to the page it started on"), and the 9/11 hybrid does the same (PROCESSING.md: "a page that begins in the middle of a paragraph is marked after that paragraph"). In 9/11, 170 of the 362 Wikisource-proofread pages begin mid-sentence, so at least 47% of its page anchors sit in the wrong place, and every sentence after the break is cited with the previous page. The page scorer has to work around it ("a paragraph that runs over a page break sits wholly on one page in full.md").
3. **What isn't recorded can't be checked or reused.** Ids exist only as the output of one function whose quirks (stopwords, five words, sixty characters, document-order suffixes) a third party would have to reimplement exactly. Per-block provenance for hybrid reports exists only in memory. The page-label scheme exists only in an agent's measurement.

## 3. Prior art

### 3.1 Inline attribute syntaxes

- **CommonMark** has no attribute syntax. A "consistent attribute syntax" has been discussed on talk.commonmark.org for a decade without landing; every extension below is its own dialect.
- **Pandoc** markdown: `{#id .class key=val}` on headings (`## Crisis {#crisis}`), fenced code, links and images, bracketed spans (`[text]{.page n=116}`) and fenced divs (`::: {#id} … :::`). **Not on paragraphs**: to give a paragraph an id you wrap it in a div.
- **markdown-it-attrs**: the same braces at the end of a block or after an inline element, including paragraphs: `Unusually good intelligence … associates. {#august-7-1998 data-pages=115-116}`. Works with our renderer today; its edge cases (a trailing `{…}` in report text, footnotes) are its own.
- **djot** (MacFarlane): block attributes on the line before the block, `{#id .class}`, and inline spans `[text]{key=val}`. Clean, but djot is not markdown.
- **MyST**: targets `(label)=` before a block, roles `` {abbr}`MP (Member of Parliament)` ``, directives in fenced blocks ```` ```{note} ````. Built for Sphinx/Jupyter Book; parsed by `markdown-it-myst` and `mystmd`.
- **Generic directives** (remark-directive, the CommonMark directives proposal): `:page[116]`, `::page{n=116}`, `:::div{#id}`. remark-native, so attractive after c0h, but unknown to every other markdown tool.
- **Obsidian** comments: `%%anything%%`, inline or block, hidden in Obsidian's preview. Our `%%page N%%` is this syntax; GitHub and other renderers show it as literal text.
- **HTML comments** `<!-- page 116 -->`: valid inline and block in every CommonMark parser, invisible in every viewer, parsed as `html` nodes by remark and as `html_inline`/`html_block` by markdown-it (we run `html: false`, which escapes them, so it would still need a rule).

### 3.2 Corrections inline: CriticMarkup

`{~~Tue sday, Se ptembe r 11, 20 01,~>Tuesday, September 11, 2001,~~}`, with `{++add++}`, `{--delete--}`, `{==highlight==}{>>comment<<}`. Readable and reviewable, and the right shape for showing a correction in context. Wrong place for ours: `full.md` is regenerated, so a correction written into it is gone at the next ingest. Our `corrections.yaml` is CriticMarkup's substitution, stored standoff.

### 3.3 Standoff annotation

- **TEI**: inline milestones `<pb n="116" facs="#p133"/>` (page break, an empty element that can sit mid-sentence) and `<lb/>`; numbered paragraphs `<p n="1.1" xml:id="p1.1">`. Standoff in `<standOff>`: `<annotation target="#p1.1">` (TEI's annotation element follows the Web Annotation model) or `<span from="#w12" to="#w30">` over tokenised text. TEI keeps page breaks inline and puts interpretation standoff, which is the split recommended here.
- **W3C Web Annotation** (2017 Recommendation): an annotation has a body and a target; the target has selectors. `TextQuoteSelector {exact, prefix, suffix}` survives edits elsewhere; `TextPositionSelector {start, end}` is exact but breaks on any upstream edit; `FragmentSelector {value: "august-7-1998-national-security"}` points at an id; selectors chain with `refinedBy`. Our D1 marks are a TextQuoteSelector scoped to a paragraph id in all but name.
- **Hypothesis** (hypothes.is) stores several selectors per annotation (RangeSelector by XPath, TextPositionSelector, TextQuoteSelector) and re-anchors by trying them in order: the range, then the position, then a fuzzy search for the quote (diff-match-patch) near the expected position. An annotation that matches nothing becomes an "orphan" and is shown as such rather than dropped. That is the fallback our aliases lack: 4,101 unmatched ids are orphans with no second chance.
- **Git-friendly sidecars**: JSON Lines, one record per line, sorted by a stable key, so a change is a one-line diff and a merge conflict is local. Our `reference/blocks.jsonl` already does this. YAML suits files humans edit (corrections, editorial).

### 3.4 How others mark pages and paragraph numbers

- **Wikisource** (ProofreadPage): one wiki page per scan page (`Page:911Report.pdf/133`), so a page boundary is exact even mid-sentence; the chapter page transcludes a range (`<pages index="911Report.pdf" from=133 to=150 />`) and the page numbers appear in the margin at the exact point. The Index page's `<pagelist 1to17=roman 18=1 />` maps scan pages to printed labels: that is our missing page-label scheme (b78.10), as data. Words hyphenated across pages use `{{hws}}`/`{{hwe}}`.
- **Akoma Ntoso** (legislation, judgments, parliamentary documents; used by the UK National Archives' Find Case Law): `<paragraph eId="para_3-120"><num>3.120</num><content>…</content></paragraph>`; page and line breaks are inline milestones, `<eop number="116"/>` and `<eol/>`, allowed mid-text. The printed number is its own element, separate from the generated `eId`.
- **legislation.gov.uk (CLML)**: structural numbers in `<Pnumber>` inside `<P1>` with generated ids (`section-3-1`), and versioned point-in-time text: identifiers follow the legal structure, not the wording.
- **Law reports and Hansard** cite by paragraph number in square brackets (`[2016] EWHC 1 [120]`) or by column; both are the document's own locators, printed in the text.

Lessons: page breaks are milestones in the text at their exact position (TEI, Akoma Ntoso, Wikisource all agree), the scan-to-label mapping is a separate small table (Wikisource's pagelist), printed paragraph numbers are text that carries its own semantic marker (`<num>`), and interpretation goes standoff.

## 4. Criteria

1. **Readability and diffability of `full.md`**: someone opening the raw file on GitHub should read the report, and a correction should be a one-line diff.
2. **Stability when ids move**: ids change when text improves (0008); every layer must survive that.
3. **Multiple layers**: corrections, editorial, reader marks and future layers (annotations by others, translations, cross-references) must coexist without touching each other's files.
4. **Round-trip through our renderer**: markdown-it today, remark after c0h; no syntax that one parser has and the other lacks.
5. **Migration cost**: 13 live reports, 7,604 page markers, every consumer of `full.md`, and ids must not move as a side effect.
6. **Reuse by others**: someone taking our text should get the ids, pages and provenance without reimplementing our pipeline.

## 5. Options, with the same paragraph encoded each way

The paragraph: 9/11 Commission Report, chapter 4, id `august-7-1998-national-security`. Printed page 116 begins at "the yearlong monitoring". The paragraph comes from the Commission's HTML edition, and footnote 37 of chapter 4 closes it.

### A. Status quo (block markers, scattered sidecars)

```markdown
%%page 115%%

On August 7, 1998, National Security Advisor Berger woke President Clinton with a phone call at 5:35 A.M. to tell him of the almost simultaneous bombings of the U.S. embassies in Nairobi, Kenya, and Dar es Salaam, Tanzania. Suspicion quickly focused on Bin Ladin. Unusually good intelligence, chiefly from the yearlong monitoring of al Qaeda's cell in Nairobi, soon firmly fixed responsibility on him and his associates.[^37-4]

%%page 116%%
```

The id is invisible, the page break is wrong by two lines, provenance is absent. (Simplified: in the real file "%%page 115%%" sits several paragraphs earlier.)

### B. Everything inline (attribute-rich markdown)

markdown-it-attrs dialect, CriticMarkup for a correction, a span for the page break:

```markdown
On August 7, 1998, National Security Advisor Berger woke President Clinton with a phone call at 5:35 A.M. to tell him of the almost simultaneous bombings of the U.S. embassies in Nairobi, Kenya, and Dar es Salaam, Tanzania. Suspicion quickly focused on Bin Ladin. Unusually good intelligence, chiefly from the []{.pb n=116}yearlong monitoring of al Qaeda's cell in Nairobi, soon firmly fixed responsibility on him and his associates.[^37-4] {#august-7-1998-national-security pages=115-116 src=html:911Report_Ch4.htm}
```

Everything travels with the text and others see it all. But every one of about 50,000 paragraphs carries a trailer that has to agree with what the renderer derives; the syntax is markdown-it-attrs-only (Pandoc has no paragraph attributes, remark needs an unmaintained plugin or a different dialect); human layers written inline are destroyed by the next ingest; and two layers on one paragraph collide in one line.

### C. Everything standoff (clean text, one annotation file)

`full.md` has no page markers at all:

```markdown
On August 7, 1998, National Security Advisor Berger woke President Clinton … Unusually good intelligence, chiefly from the yearlong monitoring of al Qaeda's cell in Nairobi, soon firmly fixed responsibility on him and his associates.[^37-4]
```

and `annotations.jsonl` carries the page as a W3C-style record:

```json
{"id":"pb-116","motivation":"page-break","body":{"label":"116"},"target":{"selector":{"type":"FragmentSelector","value":"august-7-1998-national-security","refinedBy":{"type":"TextQuoteSelector","exact":"yearlong monitoring of al Qaeda's","prefix":"chiefly from the "}}}}
```

The cleanest text and unlimited layers, and it is the most reusable for annotation tools. But a reader of the raw file loses the pages, which are the canonical edition's own locators (0001); every consumer must join two files to answer "what page is this on"; and a structural fact about the source becomes an annotation that can orphan.

### D. Recommended: one inline milestone, a generated block ledger, human layers standoff

`full.md`:

```markdown
On August 7, 1998, National Security Advisor Berger woke President Clinton with a phone call at 5:35 A.M. to tell him of the almost simultaneous bombings of the U.S. embassies in Nairobi, Kenya, and Dar es Salaam, Tanzania. Suspicion quickly focused on Bin Ladin. Unusually good intelligence, chiefly from the %%page 116%% yearlong monitoring of al Qaeda's cell in Nairobi, soon firmly fixed responsibility on him and his associates.[^37-4]
```

`blocks.jsonl` (generated with `full.md`, one line per citable block):

```json
{"id":"august-7-1998-national-security","kind":"paragraph","section":"42-crisis-august-1998","pages":["115","116"],"num":null,"source":"html:reference/raw/911Report_Ch4.htm","sha256":"…"}
```

a human layer, here a highlight in `editorial/us-911-commission.yaml` (the shape it has today, with `quote` as the TextQuoteSelector's `exact`):

```yaml
highlights:
  - paragraph: august-7-1998-national-security
    quote: soon firmly fixed responsibility on him and his associates
```

and for a UK report, a printed paragraph number stays text, recognised by a pattern in front matter:

```markdown
---
locators:
  pages: { scheme: printed, labels: "1-28: roman; 29: 1" }   # illustrative
  paragraph_numbers: '^(\d+(?:\.\d+)*)\\?\.?\s'
---

1.1 The object of the Inquiry was to examine the circumstances that led to loss of life …
```

rendered with `id="1-1-object-inquiry-examine"` as now, plus an anchor `para-1.1` and the citation "para 1.1".

### E. Variant of D: HTML comments for the milestone

As D, but `chiefly from the <!-- page 116 --> yearlong monitoring`. It is invisible in every viewer and parsed natively by remark. It costs a rename across the corpus and the consumers, and it hides the page from a GitHub reader who would otherwise see it. See open question 1.

## 6. Tradeoffs

| | A status quo | B all inline | C all standoff | D recommended | E = D with `<!-- -->` |
|---|---|---|---|---|---|
| Raw `full.md` readable | yes | poor (trailer on every paragraph) | best | yes (a few inline `%%page%%`) | yes (comments hidden in viewers) |
| Diffs | good | noisy: an id change rewrites the trailer | text clean; layer diffs separate | good; ledger diffs one line per block | good |
| Exact page position | no (block only) | yes | yes | yes | yes |
| Ids explicit for reuse | no | yes | no (unless added) | yes, in the ledger | yes, in the ledger |
| Per-block provenance | no | yes | yes | yes, in the ledger | yes |
| Layers coexist | separate files, four anchor styles | collide in one line; human layers lost on re-ingest | yes | yes, one anchor model | yes |
| Survives id moves | aliases only | ids rewritten each ingest | id + quote fallback | aliases, then quote fallback | same |
| markdown-it / remark | custom block rule / custom node | plugin-dialect lock-in | trivial | text-node transform in both, no parser extension | native `html` node in both |
| Migration | none | large | large; pages leave the text | small to moderate, phased, no id moves | D plus a rename |
| Reuse by others | poor | good if they use markdown-it-attrs | good | good: plain markdown, JSONL ledger, W3C export | good |

Why the page milestone stays inline when everything else goes standoff: it is a property of the canonical edition's text (the same reason TEI, Akoma Ntoso and Wikisource keep it inline), it is a position, which standoff can only express by quoting the words after it, and it is what someone reading the raw file needs to cite it. It is also the one addition the pipeline, not a human, makes, so writing it inline never conflicts with re-ingestion.

Why printed paragraph numbers get no syntax: they are already in the text, as printed. Wrapping them (`[1.1]{.num}`) would make `full.md` differ from the report for no reader's benefit. A declared pattern gives the renderer what Akoma Ntoso's `<num>` gives, and the one real hazard, markdown reading `1. ` as a list, is fixed by escaping (`1\.`, as Chilcot already does), which the pipeline should do everywhere.

Why ids go into a ledger, not inline: an inline id duplicates what the renderer derives and must be kept in agreement on about 50,000 paragraphs; a ledger generated in the same run cannot disagree, and `pnpm corpus check` can verify it against the rendered HTML with independent code (the lesson of the 4k6 missing-id incident).

## 7. Recommendation

1. **`full.md` profile.** CommonMark + GFM footnotes + front matter + one extension: the page milestone `%%page LABEL%%` (and `%%page LABEL#k%%` for a repeated label), as its own line when a page begins at a block boundary, and inline, surrounded by single spaces, at the first word of the page when it begins mid-block. Every consumer strips milestones before deriving ids, indexing search, checking quotations or counting words. No other inline additions.
2. **Locators in front matter.** `locators.pages` records the label scheme, measured not assumed (b78.10), in a Wikisource-pagelist-like range form, or `none` for a web-native report (0001 case 3). `locators.paragraph_numbers` is a regex for reports whose canonical edition numbers its paragraphs; the renderer adds `para-N` anchors and "para N" citations. The pipeline escapes every printed number that markdown would read as a list.
3. **Generated block ledger.** `@rtm/ingest` writes `blocks.jsonl` beside `full.md`: per citable block, `id`, `kind`, `section`, `pages` (first and last), `num` (printed paragraph number), `source` (edition file, PDF page, or `correction:c-0001`) and a text hash. The site copies it like `full.md`; a check verifies its ids against the rendered HTML.
4. **One anchor model for human layers.** `{paragraph: <id>, quote: {exact, prefix?, suffix?}}`, which is W3C's FragmentSelector refined by a TextQuoteSelector. Resolution order: the id, then `aliases.yaml`, then a search for the quotation across the report (exact, then whitespace- and punctuation-normalised), then orphan, which fails the check that owns the layer. Layers keep their files: `corrections.yaml` (report repo; gains an optional `paragraph:` scope beside `where.printed`), `editorial/<id>.yaml` (site), D1 marks (`page` becomes TEXT so roman labels fit), `aliases.yaml` and `published-ids.txt` (the id history, per 0008).
5. **Generated views stay generated.** `fidelity.md` stays a review queue; it can gain a machine-readable twin later if a tool needs it.
6. **Export for reuse.** `pnpm annotations export <report>` writes the ledger and all human layers as W3C Web Annotation JSON-LD (and later TEI `<standOff>` if anyone asks). We author in our small formats and publish in the standard one.
7. **Not adopted:** attribute syntax on paragraphs (B), CriticMarkup or MyST in `full.md`, all-standoff pages (C). The spelling of the milestone (`%%` vs `<!-- -->`) is open question 1; D keeps `%%` because it is what 7,604 lines and a dozen consumers already use, it is visible to a GitHub reader, and under remark it is a text-node transform needing no micromark extension (`%` has no meaning in CommonMark).

## 8. Open questions for Rufus

1. **Spelling of the page milestone:** keep `%%page 116%%` (visible as text on GitHub, Obsidian hides it, no churn), or move to `<!-- page 116 -->` (invisible everywhere, native HTML node in every parser, a corpus-wide rename)? Recommendation: keep `%%`.
2. **Mid-paragraph milestones:** are you happy for the raw text to read "chiefly from the %%page 116%% yearlong monitoring"? It is what makes citations to a sentence, and the page scorer, exact. Recommendation: yes.
3. **Freeze ids?** 4,101 of 50,228 published ids (8%) now resolve nowhere. The ledger could become the source of truth for ids (carry each paragraph's id forward by matching, so an OCR fix in the opening words no longer moves it), instead of deriving ids afresh each render. That reverses part of 0008. Recommendation: not now; add the quotation fallback first and measure how many orphans remain.
4. **Publish a spec?** A one-page "Reports that Matter text profile" (`full.md` rules, `blocks.jsonl` schema, anchor model) published with the W3C export, so others can reuse the corpus and its layers. Recommendation: yes, after migration step 4.
5. **Where do layers by other people live** (a newsroom's annotations, a translation)? Recommendation: out of scope until someone asks; the anchor model and the export are what they would need.

## 9. Migration sketch

Each step is its own bead and PR; none moves an id, and each is measured by `pnpm ingest check` and `pnpm corpus check` showing byte-identical ids.

1. **Fix numbered paragraphs read as lists** (independent of this decision): Hillsborough's 384 `1. ` paragraphs get the Chilcot escape (woke). Ids are added, none move; about 384 new citable paragraphs.
2. **Locators in front matter** (b78.10): the pipeline writes `locators.pages` (measured per report from golden pages or Wikisource) and, for the five UK inquiries, `locators.paragraph_numbers`. The renderer adds `para-N` anchors and citations. Text unchanged.
3. **Block ledger:** ingest emits `blocks.jsonl`; `edition.ts` and the PDF pipeline keep the source of each block instead of dropping it; corrections stamp the blocks they touch. Site copies it; corpus check compares its ids with the rendered HTML. Text unchanged. Roughly a day.
4. **Inline milestones:** first the reader side, a no-op on today's corpus: renderer, fidelity, baseline, quality signals, scorers, search and editorial checks strip inline milestones; `data-page` stays the first page and `data-page-end` is added; citations print "pp. 115–116" for a spanning paragraph. Then an opt-in ingest pass (`exactPageBreaks`) that places the milestone at the word, starting with 9/11 (the aligner already knows every word's PDF page) and the Wikisource-backed reports, measured as markers moved inline and page-scorer error before and after. Then PDF reports, where the break position comes from the page split itself. About 2–3 days across ingest and site.
5. **Anchor model:** one shared resolver (id → aliases → quotation → orphan) used by `pnpm editorial`, the reading view's marks, corrections (`paragraph:` scope) and the `?p=` redirect, where the quotation comes from the last published ledger for that id. Measure: unmatched ids before and after. D1 `marks.page` to TEXT.
6. **Export:** `pnpm annotations export`, plus the spec page if question 4 is yes.
7. **c0h (remark):** the milestone becomes a text-node visitor and the ledger is the remark port's acceptance test (ids, pages and kinds byte-identical).

## 10. Evidence and examples used

- 9/11 page 116: `reference/wikisource/pages/` shows the page beginning "the yearlong monitoring of al Qaeda's cell in Nairobi"; `full.md` places `%%page 116%%` after the paragraph. 170 of the 362 proofread pages begin with a lower-case word (a lower bound for mid-paragraph starts).
- `@rtm/ingest` v0.19.0: `markdown.ts` (`PAGE_MARKER`, `paragraphId`, `rtm_anchors`), `paragraphs.ts` (`mergeAcrossPages`, `blockToMarkdown`), `edition.ts` (marker placement after a joined paragraph), `corrections.ts`.
- Site: `migrations/0001_marks.sql`, `src/lib/editorial.ts` (`Citation.page: number | null`), `src/lib/score/pages.ts`, `reports/*/aliases.yaml`, `reports/*/published-ids.txt`.
- Hillsborough `full.md` lines 174–218 (`1. In 1981…`), rendered by `renderMarkdown` as `<ol start="2">` with no ids.
