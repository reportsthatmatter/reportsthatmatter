# Processing notes — Report on the Investigation into Russian Interference in the 2016 Presidential Election (the Mueller Report)

How the text on Reports that Matter was made, and where it still falls short of the printed page. Nothing has been rewritten. Where we know the text differs from the published report, this page says so.

*Last reviewed 9 October 2026.*

## The edition

- **Source:** the two volumes as the U.S. Department of Justice publishes them today, [Volume I](https://www.justice.gov/storage/report_volume1.pdf) (207 PDF pages, SHA-256 `0df965b7…ce3d0`) and [Volume II](https://www.justice.gov/storage/report_volume2.pdf) (187 PDF pages, SHA-256 `67bffcdc…e69e34`), kept in the [report's repository](https://github.com/reportsthatmatter/us-mueller-report). They are the canonical citation target.
- **Which release:** the report was dated March 2019 and first released, redacted, on 18 April 2019. After freedom-of-information lawsuits the Department released it again with fewer redactions, in 2019, 2020 and (for Volume I) February 2022. These files are the latest releases, with the most text. Page numbers are the same in every release. The April 2019 release, and the Government Publishing Office's copy of it on govinfo, are not used.
- **Licence:** public domain, a work of the U.S. Government.
- **Covers:** Volume I (Russian interference in the 2016 election and the investigation of links to the Trump Campaign) and Volume II (the investigation of the President for obstruction of justice), each with its own contents, introduction and executive summary. The four appendices (the appointment order, a glossary, the President's written answers, and the cases the Office transferred or referred) are a separate file and are not here yet.
- **Size:** about 186,000 words, 2,147 notes, 389 printed pages marked (Volume I's contents i-v and pp. 1-199, Volume II's contents i-iv and pp. 1-182; the title pages carry no number).

## Redactions

The released report blacks out what was withheld. Each black box prints, in white, the exemptions of the Freedom of Information Act it was withheld under, and the margin beside it repeats them. Here each box is shown as **[Redacted: …]** with the codes the box prints, for example "[Redacted: (b) (7)(A), (b) (7)(E)]"; the margin labels, which repeat the box's codes with a processing number ("(b)(3)-1"), are left out. What the codes mean:

- **(b) (3)**: withheld under a statute; in this report, mostly grand-jury material, which Federal Rule of Criminal Procedure 6(e) keeps secret (the April 2019 release labelled it "Grand Jury").
- **(b) (6)** and **(b) (7)(C)**: personal privacy ("Personal Privacy" in 2019).
- **(b) (7)(A)**: could interfere with enforcement proceedings still pending ("Harm to Ongoing Matter" in 2019).
- **(b) (7)(E)**: investigative techniques ("Investigative Technique" in 2019).

A box can be several lines long; it is shown once, where it starts. A note withheld whole shows only its marker.

## How the text was read

- **Two kinds of page.** Volume II, and 133 of Volume I's 207 pages, carry the PDF's own text. The other 74 pages of Volume I (printed pages 17-20, 23, 25-27, 32-35, 37-41, 43, 46-49, 55-57, 60, 63, 67, 72, 85, 92-94, 96, 98, 100-103, 109, 111-112, 114, 116-118, 120-122, 130, 134, 136-137, 139-140, 142-144, 147-148, 150-155, 161, 166-167, 169-170, 172, 194 and 199) are pictures of the printed page, with text recognised by the Department's software (OCR). They are the most heavily redacted pages, re-released in 2020. Their words are served as that OCR reads them, errors included (see below).
- **Page numbers.** The printed page numbers, which restart in Volume II: Volume I's page 12 and Volume II's page 12 are different pages, the second shown as the second page 12. The contents pages carry their roman numbers. An independent check that reads each page's opening words in the PDF places 98.4% of the markers it can locate on their page.
- **Headings.** Each volume's contents is read as an outline, and the body's headings are taken from it, at its levels and in its spelling: the sections ("II. RUSSIAN 'ACTIVE MEASURES' SOCIAL MEDIA CAMPAIGN"), their parts ("A.", "1.") and their subparts ("a.", "i."), 228 in all, with the executive summaries' own subheads beneath them. On the scanned pages, a heading the OCR misspelt ("Trnmp Tower Moscow Project") is matched to its contents entry and spelt as the contents spells it.
- **Page breaks.** Where a paragraph runs over a page turn, the paragraph is joined. Of 30 page turns checked by hand against the page images (a sample drawn at random and by how sure the rules were), 27 of the 29 that could be matched are right; both errors are on scanned pages, where a note left in the body stands between the two halves.
- **Notes.** 2,147 notes at the page feet are linked to their markers. Volume II's are complete (1,089 of 1,092). Volume I's are complete on its text pages; on its scanned pages 225 of its 1,283 notes are not separated from the body (see below).
- **No hand corrections.** Every difference from the PDF's text layer comes from a rule declared in `ingest.ts`.

## Known limitations

- **OCR errors on Volume I's scanned pages.** The 74 scanned pages carry the Department's OCR, which often confuses letters: "Trnmp" or "Tnunp" for "Trump", "se1ved" for "served", "Depaiiment" for "Department". The words are served as the OCR reads them; the PDF is the authority. `fidelity.md` lists the suspect words.
- **Notes on the scanned pages.** On those pages the OCR does not set the notes apart from the text clearly, and 225 of Volume I's notes (among them notes 6-25, 29-32, 35-46, 113-122 and 1132-1154) are shown as paragraphs of the text near where they are printed, not as notes; their markers in the text are left as plain numbers.
- **Layout round the redactions.** Where a scanned page is mostly black boxes, the OCR reads the boxes' edges as stray characters ("I . I • I I") and sometimes runs a note, a box label and the text together. On some of those pages the OCR did not read a box's white label at all, so that redaction leaves no marker in the text.
- **Subheads.** Volume II's sections set their parts under "Overview", "Evidence" and "Analysis"; these are shown as short paragraphs, not subheads.
- **The appendices** are not included yet, and the report's few photographs are not shown.

## Reporting a problem

If the text here differs from the published report, the PDF is the authority. Open an issue on the [report's repository](https://github.com/reportsthatmatter/us-mueller-report/issues) with the volume, the page number and the passage.
