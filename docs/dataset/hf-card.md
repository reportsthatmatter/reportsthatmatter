---
license: other
license_name: per-report
license_link: https://reportsthatmatter.org/data#licences
pretty_name: Reports that Matter, per-paragraph dataset
language:
  - en
task_categories:
  - text-retrieval
  - question-answering
  - text-classification
tags:
  - public-inquiries
  - government-reports
  - official-reports
  - legal
  - paragraph-level
size_categories:
  - 10K<n<100K
annotations_creators:
  - no-annotation
language_creators:
  - found
source_datasets:
  - original
configs:
  - config_name: default
    data_files:
      - split: train
        path: data/train.jsonl
---

# Reports that Matter: one row per paragraph

60,884 paragraphs from 22 official public reports (inquiries, commissions, investigations and one court examiner's report), each with its section, printed page, a stable paragraph id, a link to the official document and a link to the paragraph on [reportsthatmatter.org](https://reportsthatmatter.org). Built from the same text the site serves, so every row can be cited and checked.

Home page and latest files: <https://reportsthatmatter.org/data>. The site: <https://reportsthatmatter.org>.

## The licence is per report, and not all of it is settled

The `license: other` in the header is deliberate: the text of each report keeps the status it has at its source, which is not ours to change, and the reports differ. Read the `licence` and `licence_status` columns, or this table, before reusing any one of them.

**Not in this upload:** *The Report of the Hillsborough Independent Panel* (not under an open licence we can find) and *Report of Anton R. Valukas, Examiner, In re Lehman Brothers Holdings Inc., et al. — Volumes 1 and 3* (copyright not established). Their text status is not settled, so they are left out here. The site serves them, and the files at <https://reportsthatmatter.org/data> include them with their statements.

| Report | Paragraphs | Licence of the report's text |
| --- | ---: | --- |
| [Investigation of the Challenger Accident](https://reportsthatmatter.org/reports/challenger-accident) | 2,586 | Public domain (US federal government work) |
| [Report of Special Counsel Jack Smith, Volume One: The Election Case](https://reportsthatmatter.org/reports/jack-smith-vol1) | 329 | Public domain (US federal government work) |
| [Wall Street and the Financial Crisis: Anatomy of a Financial Collapse](https://reportsthatmatter.org/reports/us-psi-financial-crisis) | 2,328 | Public domain (US federal government work) |
| [The Litvinenko Inquiry](https://reportsthatmatter.org/reports/litvinenko-inquiry) | 1,999 | Open Government Licence v3.0 (UK Crown copyright) |
| [An Inquiry into the Culture, Practices and Ethics of the Press](https://reportsthatmatter.org/reports/uk-leveson-inquiry) | 9,114 | Open Government Licence, version not stated (UK Crown copyright) |
| [Columbia Accident Investigation Board Report, Volume I](https://reportsthatmatter.org/reports/columbia-accident) | 2,274 | Treated as a US federal government work (public domain); not confirmed |
| [The 9/11 Commission Report](https://reportsthatmatter.org/reports/us-911-commission) | 2,438 | Treated as a US federal government work (public domain); not confirmed |
| [Deep Water: The Gulf Oil Disaster and the Future of Offshore Drilling](https://reportsthatmatter.org/reports/us-deepwater-horizon) | 1,730 | Public domain by the report's own notice, except as noted |
| [United States v. Philip Morris USA Inc.: Amended Final Opinion](https://reportsthatmatter.org/reports/us-v-philip-morris) | 5,837 | Public domain (US federal government work) |
| [The Report of the Bloody Sunday Inquiry, Volume I](https://reportsthatmatter.org/reports/uk-saville-inquiry) | 1,458 | UK Crown copyright; Open Government Licence v3.0 as published on GOV.UK, imprint gives HMSO reuse terms |
| [The Report of the Iraq Inquiry — Executive Summary](https://reportsthatmatter.org/reports/uk-chilcot-inquiry) | 949 | Open Government Licence v3.0 (UK Crown copyright) |
| [Post Office Horizon IT Inquiry Report, Volume 1](https://reportsthatmatter.org/reports/uk-post-office-horizon-inquiry) | 942 | Open Government Licence v3.0 (UK Crown copyright) |
| [Final Report of the Select Committee to Investigate the January 6th Attack on the United States Capitol](https://reportsthatmatter.org/reports/us-jan6-committee) | 2,295 | Public domain (US federal government work) |
| [Grenfell Tower Inquiry: Phase 2 Report](https://reportsthatmatter.org/reports/uk-grenfell-tower-inquiry) | 6,930 | Open Government Licence v3.0 (UK Crown copyright) |
| [Committee Study of the Central Intelligence Agency's Detention and Interrogation Program](https://reportsthatmatter.org/reports/us-senate-cia-torture-report) | 2,407 | Public domain (US federal government work) |
| [Report on the Investigation into Russian Interference in the 2016 Presidential Election](https://reportsthatmatter.org/reports/us-mueller-report) | 1,315 | Public domain (US federal government work) |
| [UK Covid-19 Inquiry, Modules 2, 2A, 2B, 2C: Core decision-making and political governance](https://reportsthatmatter.org/reports/uk-covid-inquiry-module-2) | 3,761 | Open Government Licence v3.0 (UK Crown copyright) |
| [The Southport Inquiry Report, Volume 1](https://reportsthatmatter.org/reports/uk-southport-inquiry) | 1,029 | Open Government Licence v3.0 (UK Crown copyright) |
| [Assessing Russian Activities and Intentions in Recent US Elections](https://reportsthatmatter.org/reports/us-ica-2017-russia-elections) | 143 | Public domain (US federal government work) |
| [Report of the Public Inquiry into events at the Countess of Chester Hospital, 2015 to 2018](https://reportsthatmatter.org/reports/uk-thirlwall-inquiry) | 4,148 | Open Government Licence v3.0 (UK Crown copyright) |
| [Stern Review: The Economics of Climate Change](https://reportsthatmatter.org/reports/uk-stern-review) | 5,019 | Open Government Licence v3.0 (UK Crown copyright) |
| [Comprehensive Report of the Special Advisor to the DCI on Iraq's WMD, Volume I](https://reportsthatmatter.org/reports/us-duelfer-report) | 1,853 | Public domain (US federal government work) |

The statements, report by report:

- **Investigation of the Challenger Accident** (`challenger-accident`): Public domain: a US congressional report (H. Rept. 99-1016) printed by the Government Publishing Office, a work of the US government (17 U.S.C. § 105). One reprinted ASTM table carries its own copyright notice.
- **Report of Special Counsel Jack Smith, Volume One: The Election Case** (`jack-smith-vol1`): Public domain: written and published by the US Department of Justice, a work of the US government (17 U.S.C. § 105). The PDF carries no copyright notice.
- **Wall Street and the Financial Crisis: Anatomy of a Financial Collapse** (`us-psi-financial-crisis`): Public domain: written by US Senate staff and published by the Senate and the Government Publishing Office, a work of the US government (17 U.S.C. § 105). Third-party material the report reproduces is not covered.
- **The Litvinenko Inquiry** (`litvinenko-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2016). Third-party material the report identifies is excluded.
- **An Inquiry into the Culture, Practices and Ethics of the Press** (`uk-leveson-inquiry`): Crown copyright, reusable under the Open Government Licence; the 2012 imprint does not state a version. Third-party copyright information the report identifies is excluded.
- **Columbia Accident Investigation Board Report, Volume I** (`columbia-accident`): Treated as a work of the US government (public domain); not confirmed. The report was produced by a board chartered by NASA and carries no copyright notice, but some Board members were not federal employees and no document we found states its status. Third-party photographs and credits are not covered.
- **The 9/11 Commission Report** (`us-911-commission`): Treated as a work of the US government (public domain); not confirmed. A federal commission created by Act of Congress, printed by the Government Publishing Office, no copyright notice, but no statement of its status in terms. Third-party photographs are not covered.
- **Deep Water: The Gulf Oil Disaster and the Future of Offshore Drilling** (`us-deepwater-horizon`): Public domain except as noted, by the report's own notice ("Except as noted herein, materials contained in this report are in the public domain"). Illustrations, photographs and other information contributed by others may carry their own copyright.
- **United States v. Philip Morris USA Inc.: Amended Final Opinion** (`us-v-philip-morris`): Public domain: the opinion of a federal judge (D.D.C., 2006), a work of the US government (17 U.S.C. § 105); court opinions are in any case not copyrightable. Material it quotes from others is not covered.
- **The Report of the Bloody Sunday Inquiry, Volume I** (`uk-saville-inquiry`): Crown copyright. The imprint of Volume I allows the original content to be reproduced free of charge in any format or medium provided it is used accurately and not in a misleading context, with the source title and copyright acknowledged; the registry records the Open Government Licence v3.0 as published on GOV.UK. Third-party quotations are not covered.
- **The Report of the Iraq Inquiry — Executive Summary** (`uk-chilcot-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2016). Third-party material the report identifies is excluded.
- **Post Office Horizon IT Inquiry Report, Volume 1** (`uk-post-office-horizon-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2025). Third-party material the report identifies is excluded.
- **Final Report of the Select Committee to Investigate the January 6th Attack on the United States Capitol** (`us-jan6-committee`): Public domain: a congressional report (H. Rept. 117-663) printed by the Government Publishing Office, a work of the US government (17 U.S.C. § 105). Third-party photograph credits are not covered (text only is served).
- **Grenfell Tower Inquiry: Phase 2 Report** (`uk-grenfell-tower-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2024). Third-party material the report identifies is excluded.
- **Committee Study of the Central Intelligence Agency's Detention and Interrogation Program** (`us-senate-cia-torture-report`): Public domain: a congressional report (S. Rept. 113-288) published by the Government Publishing Office, a work of the US government (17 U.S.C. § 105). Third-party material is not covered.
- **Report on the Investigation into Russian Interference in the 2016 Presidential Election** (`us-mueller-report`): Public domain: written and published by the Special Counsel's Office of the US Department of Justice, a work of the US government (17 U.S.C. § 105). Third-party material is not covered.
- **UK Covid-19 Inquiry, Modules 2, 2A, 2B, 2C: Core decision-making and political governance** (`uk-covid-inquiry-module-2`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2025). Third-party material the report identifies is excluded.
- **The Southport Inquiry Report, Volume 1** (`uk-southport-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint). Third-party material the report identifies is excluded.
- **Assessing Russian Activities and Intentions in Recent US Elections** (`us-ica-2017-russia-elections`): Public domain: an assessment by US intelligence agencies (ODNI, CIA, FBI, NSA), a work of the US government (17 U.S.C. § 105), as recorded in the registry; this report's repository has no LICENSE statement yet. Third-party material is not covered.
- **Report of the Public Inquiry into events at the Countess of Chester Hospital, 2015 to 2018** (`uk-thirlwall-inquiry`): Crown copyright, published under the Open Government Licence v3.0 (the report's imprint: © Crown copyright 2026). Third-party material the report identifies is excluded.
- **Stern Review: The Economics of Climate Change** (`uk-stern-review`): Crown copyright (HM Treasury, 2006). The PDFs print no copyright line; material available under the old Click-Use licence can now be reused under the Open Government Licence v3.0, per the National Archives. Third-party data and figures are not covered.
- **Comprehensive Report of the Special Advisor to the DCI on Iraq's WMD, Volume I** (`us-duelfer-report`): Public domain: the Iraq Survey Group's report to the Director of Central Intelligence, published by the Government Publishing Office, a work of the US government (17 U.S.C. § 105), as recorded in the registry; this report's repository has no LICENSE statement yet. Third-party material is not covered.

What we add (the structure, paragraph ids, paragraph numbers and the `licence` and link columns) is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); attribute it to "Reports that Matter". This is a statement of status, not legal advice. Third-party material a report reproduces is not covered by any of the above.

## Columns

| Column | Meaning |
| --- | --- |
| `report` | Our report id (the URL slug on the site) |
| `report_title` | The report's title |
| `section` | The heading of the section the paragraph sits in, and `section_slug` its slug |
| `paragraph_number` | 1-based position of the paragraph in the report, in document order. It is our count, not the report's own paragraph numbers |
| `page` | The printed page the paragraph starts on (a number, or a roman numeral in front matter); empty where the pipeline recorded none |
| `paragraph_id` | Our stable id for the paragraph, the target of the site's permalinks (`/reports/<report>/<section>?p=<paragraph_id>`) |
| `text` | The paragraph's words, with footnotes removed |
| `official_pdf_url` | The official document. Where the source is a PDF and the page is a number it ends `#page=<page>`; otherwise it is the plain source URL. See the limits below |
| `site_url` | The paragraph on reportsthatmatter.org |
| `licence`, `licence_status` | The report's text status as a label, and the machine-readable kind it comes from |

## Limits you should know

- **`#page=` uses the printed page, not the PDF's page index.** Most PDFs have front matter, so the link can open a few pages from the paragraph (in the 9/11 report the printed page is the PDF's minus 17). It is a pointer to look near, not an exact deep link.
- **The official document is the authority.** The text is taken from the published document by deterministic software and checked against it, with no language model writing any of it, but where this dataset and the official document differ, the official document is right. [Report a problem](https://github.com/reportsthatmatter/reportsthatmatter/issues/new?template=text-defect.yml).
- **A row is a citable unit**: a paragraph or a whole list, as the site addresses it. Headings and footnotes are not rows (the footnotes are not in `text` either).
- **Text only**: no figures, images or tables as images.
- Reports are added over time; the row counts above are for this version. The report list and licence statements are in the table above.

## Citation

```bibtex
@misc{reportsthatmatter_paragraphs_2026,
  author       = {Pollock, Rufus and contributors},
  title        = {Reports that Matter: a per-paragraph dataset of official public reports},
  year         = {2026},
  howpublished = {\url{https://reportsthatmatter.org/data}},
  note         = {Hugging Face dataset reportsthatmatter/paragraphs; version of 2026-11-20. The text of each report remains subject to its own licence}
}
```

Cite the report itself (title, issuing body, page or paragraph) as well; each row has what you need.

## Source and code

Built by `pnpm dataset` in [reportsthatmatter/reportsthatmatter](https://github.com/reportsthatmatter/reportsthatmatter) (MIT), from the text of each report's own repository under <https://github.com/reportsthatmatter>.
