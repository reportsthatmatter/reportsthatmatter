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
        <h3>Faithful text</h3>
        <p>Reports are converted from their original PDFs by a deterministic pipeline, with
        automated fidelity checks against the source.</p>
      </div>
      <div class="col">
        <h3>Paragraph permalinks</h3>
        <p>Every paragraph has its own address. Highlight any passage to copy a link straight
        to it.</p>
      </div>
      <div class="col">
        <h3>Stable hosting</h3>
        <p>Published as plain web pages that search engines can index and that will not rot
        behind a broken departmental site.</p>
      </div>
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
  });
}
