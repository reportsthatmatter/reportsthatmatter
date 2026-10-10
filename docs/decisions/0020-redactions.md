# 0020. How do we show a redaction in a report's text?

- **Status:** proposed
- **Date raised:** 2026-10-09 · **Date decided:** —
- **Decided by:** — (applied provisionally to the Mueller report, reversible)
- **Beads:** the `decision` bead filed from reportsthatmatter-gqsy.5

## Question

A FOIA-processed report (the Mueller report as DOJ publishes it now) blacks out withheld passages and prints in each black box the exemptions it was withheld under, "(b) (6), (b) (7)(C)". It also repeats the codes in the page margin with a processing number, "(b)(3)-1". How should the text we serve show a redacted passage?

## Context

- No report in the corpus had a convention. Leveson and the PSI report print their own "[REDACTED]" / "[redacted]" in the text, which we serve as printed.
- Read as text, the box labels are words in the middle of a sentence ("of Michael Cohen, Richard Gates, (b) (6), (b) (7)(C) Roger Stone"), and the margin labels are welded onto whichever line they sit beside ("…in the 2016 (b)(6)/"). A reader cannot tell a redaction from a citation.
- The codes are the release's own words; the reader of the PDF sees them. The 2019 release printed category names instead ("Harm to Ongoing Matter", "Grand Jury", "Investigative Technique", "Personal Privacy"); the FOIA re-releases replaced them with codes.
- The fidelity check counts words we add; any marker adds at least one.

## Options

1. Leave the labels as text. Faithful to the characters, unreadable as prose.
2. `[Redacted: (b) (6), (b) (7)(C)]`: a visible marker with the box's printed codes, and the margin labels dropped (they repeat the box's codes). Reversible: the codes are kept, and the processing numbers are recoverable from the PDF.
3. A plain-language marker, "[Redacted: personal privacy]", translating the codes. Easier to read; the words are ours, not the release's, and a code covers more than one ground ((b)(3) is any statute; here mostly grand-jury material).
4. Rendered markup (a styled black bar with the codes on hover). Needs a site change and a format decision (0002).

## Decision

Proposed: option 2, applied to the Mueller report by the opt-in `foiaRedactions()` pass in `@rtm/ingest`. The fidelity check does not count the word "Redacted" in a marker of that exact shape as invented. `PROCESSING.md` explains each code in plain words. Option 4 can be layered on later: the marker is a fixed, parseable shape.

## Consequences

- Paragraph ids derive from opening words, so a paragraph that opens on a redaction gets an id from "redacted-b-…". Changing the marker later moves those ids (aliases keep the links).
- A redaction that removes a whole note leaves a note whose text is only the marker. That is faithful: the note exists, its text is withheld.
- If Rufus prefers option 3 or 4, the change is in the pass (or the renderer), not in the report's text.

## Links

- `@rtm/ingest` `src/redactions.ts` (`foiaRedactions`)
- The Mueller report's `README.md` ("Redactions") and `PROCESSING.md`

## Addendum, 2026-10-10: a box with no printed code (the Senate Intelligence Committee study)

The Senate Select Committee on Intelligence's study of the CIA's detention and interrogation programme (S. Rept. 113-288, `us-senate-cia-torture-report`, reportsthatmatter-gqsy.6) is a declassified report, not a FOIA release: its 11,680 black boxes print no exemption code. Its scan's OCR reads a box as garble ("H ^ H", "B I H I H", "|") or as nothing, so where a box is has to be read off the page image.

Proposed, applied provisionally to that report: the same marker without codes, **`[Redacted]`**, one per printed box, in the same place as option 2 would put it. The library holds the shape (`UNCODED_REDACTION` in `@rtm/ingest` `src/redactions.ts`); the fidelity check treats the word "Redacted" in that exact shape as ours, as it does "[Redacted: …". The report's own source pass writes it, from a committed pack of box positions read off the page images (`scripts/redaction-boxes.ts` in the report's repo, which also keeps each box's coordinates, so a later rendering, option 4, needs no re-detection).

Considerations particular to this report:

- **It prints its own "[REDACTED]".** The Committee substituted "[REDACTED]" for some names in its text (and pseudonyms, "[CIA OFFICER 1]"; bracketed site names, "[DETENTION SITE GREEN]"). Those are the report's words and are served as printed. Our marker differs only by case, which a reader may not notice; `PROCESSING.md` explains the difference. If that proves confusing, option 4 (a styled bar) or a different uncoded word ("[Box]", "[Withheld]") would separate them; the change is in the pass.
- **One marker per box, whatever its length.** A box over a word and a box over a paragraph read the same. The pack records each box's size, so a later rendering could show length.
- **Classification markings are not redactions.** The struck-through banners ("TOP SECRET//[box]//NOFORN") and portion markings ("(TS//[box]//NF)") are dropped with their boxes, as furniture, and said so in `PROCESSING.md`.

Settle together with the FOIA form above (beads reportsthatmatter-oh89 and reportsthatmatter-8fsl).
