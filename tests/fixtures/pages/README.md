# Golden page fixtures

Real pages, extracted with `pdftotext -layout -enc UTF-8 -f N -l N`, chosen for
being hard. Every synthetic unit test in `tests/ingest.test.ts` passed while the
Leveson defect shipped (#118 §1.5); these exist so a heuristic meets real input.

`N` below is the **PDF page index**, not the printed page number.

| Fixture | Source | Page | Why it is here |
| --- | --- | --- | --- |
| `leveson-running-header.txt` | `uk-leveson-inquiry/archive/0780_i.pdf` | 120 | Running header (`Chapter 2 \| The Press: …`) at the page edge — the furniture that became prose before the fix |
| `leveson-numbered-para.txt` | `uk-leveson-inquiry/archive/0780_ii.pdf` | 240 | Numbered paragraphs (`4.12 …`), which must not be read as headings |
| `leveson-bulleted-list.txt` | `uk-leveson-inquiry/archive/0780_ii.pdf` | 289 | A bulleted list, the shape that put text out of order in #12 |
| `psi-stacked-footnote.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 92 | Stacked footnote layout — number alone on its line, text beneath |
| `psi-quoted-bullets.txt` | `us-psi-financial-crisis/archive/PSI REPORT …pdf` | 146 | Bullets **inside a quoted email**: lifting them out of the quotation presents someone else's words as the report's |
| `challenger-ocr-noise.txt` | `challenger-accident/archive/GPO-CRPT-99hrpt1016…pdf` | 265 | Badly garbled scan (`c h a r a c t e r i z a t i o n`) — the messiest input in the corpus |
| `jack-smith-inline-notes.txt` | `jack-smith-report/archive/Report-of-Special-Counsel-Smith-Volume-1…pdf` | 40 | Inline footnote markers sitting against punctuation |

To add one: pick the page, extract it, and record it here with what it is for.
A fixture that does not contain its hard case is worse than none, because it
passes for the wrong reason.
