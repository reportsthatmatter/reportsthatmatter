import { SITE_ORIGIN } from "./site";
import { renderLayout } from "./layout";

/**
 * The announcement page — the landing zone for campaign traffic.
 * Copy follows the draft in docs/plans/2026-01-13-twitter-launch-campaign.md:
 * ~80 words of substance, neutral institutional tone, a single CTA.
 */
export function renderAbout(): string {
  const body = `
<main>
  <section class="report-header wrap">
    <p class="kicker mono">About</p>
    <h1>Just the source, made accessible.</h1>
  </section>

  <div class="prose wrap measure">
    <p>Important public reports — government inquiries, investigations, official findings —
    contain some of the most careful research ever produced on matters of public importance.</p>

    <p>But they are buried. Scattered across broken government websites, locked inside enormous
    PDFs, impossible to link to at the level that actually matters: the specific finding, the key
    paragraph, the actual evidence.</p>

    <p>Reports that Matter makes these reports usable on the web. Searchable. Readable. Linkable
    at the paragraph level.</p>

    <p>No commentary. No spin.</p>
  </div>

  <section class="section wrap">
    <p class="section-label mono">How it works</p>
    <div class="cols cols-3">
      <div class="col">
        <h2>Faithful text</h2>
        <p>Reports are converted from their original PDFs by a deterministic pipeline, with
        automated fidelity checks against the source.</p>
      </div>
      <div class="col">
        <h2>Paragraph permalinks</h2>
        <p>Every paragraph has its own address. Highlight any passage to copy a link straight
        to it, or save it to your own list.</p>
      </div>
      <div class="col">
        <h2>Stable hosting</h2>
        <p>Published as plain web pages that search engines can index and that will not rot
        behind a broken departmental site.</p>
      </div>
    </div>
  </section>

  <section class="section wrap" id="what-we-record" aria-labelledby="what-we-record-heading">
    <p class="section-label mono" id="what-we-record-heading">What we record</p>
    <div class="prose measure">
      <p>There are no accounts and no tracking cookies. When you save or share a passage, your browser sends us
      its words and a few words either side, with the report, paragraph and page they come from, whether you saved
      or shared it, and the time. We keep them alongside a code made from your network address and browser that
      changes every day, used only to count how many different readers marked a passage and to limit how many
      passages one reader can mark in a day; the address and browser themselves are not stored.</p>
      <p>Saves and shares are both counted, anonymously. When the words are found in the report, the passage can
      appear on <a href="/highlights">Highlights</a> about half an hour later, with the report's own text, page and
      a time rounded to the hour, and nothing about who chose it. Your own list of saved passages stays in your
      browser, and you can turn counting off on <a href="/highlights/yours">Yours</a>.</p>
    </div>
  </section>

  <section class="section wrap" id="licences" aria-labelledby="licences-heading">
    <p class="section-label mono" id="licences-heading">Licences</p>
    <div class="prose measure">
      <p>The code is open source under the <a href="https://github.com/reportsthatmatter/reportsthatmatter/blob/main/LICENSE">MIT licence</a>.
      Each report's text keeps the status it has at source, which is not ours to change: most are works of the
      US government, in the public domain, or UK Crown copyright reused under the Open Government Licence. A few
      are neither, or we could not confirm their status, and we say so. Our own markup and editorial writing are
      <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. The exact terms, with the evidence
      and anything we could not confirm, are in the LICENSE file of each
      <a href="https://github.com/reportsthatmatter">report's repository</a>.</p>
    </div>
  </section>

  <section class="section wrap">
    <div class="hero" style="padding-block: 0; text-align: left">
      <div class="actions" style="justify-content: flex-start; margin-top: 0">
        <a class="btn btn-filled mono" href="/reports">Read the reports</a>
      </div>
    </div>
  </section>
</main>`;

  return renderLayout("About — Reports that Matter", body, {
    description:
      "Reports that Matter makes official public reports readable, searchable, and linkable at the paragraph level. No commentary. No spin.",
    url: `${SITE_ORIGIN}/about`,
    follow: true,
  });
}
