import type { ReportRegistry } from "../lib/registry";
import { renderLayout, escapeHtml } from "./layout";

export function renderReportList(registry: ReportRegistry): string {
  if (!registry.reports.length) {
    return `<p class="mono">No reports published yet.</p>`;
  }

  const items = registry.reports
    .map((report) => {
      const meta = [report.authors, report.published_at].filter(Boolean).join(" · ");
      return `<li>
        <a href="/reports/${escapeHtml(report.id)}">
          <span class="title serif">${escapeHtml(report.title)}</span>
          <span class="meta mono">${escapeHtml(meta)}</span>
          <span class="cue mono">Read →</span>
        </a>
      </li>`;
    })
    .join("");

  return `<ul class="report-list">${items}</ul>`;
}

export function renderIndex(registry: ReportRegistry): string {
  const body = `
<main>
  <section class="hero wrap">
    <h1>Reports that shaped history are still trapped in PDFs.</h1>
    <p class="standfirst">Official inquiries publish the evidence that anchors public understanding — then bury it in
    scanned documents on decaying websites. We rebuild them as web pages you can read, search, and cite by passage.</p>
    <div class="actions">
      <a class="btn btn-filled mono" href="/reports">Read the reports</a>
      <a class="btn mono" href="/about">What this is</a>
    </div>
  </section>

  <section class="section wrap">
    <p class="section-label mono">The problem</p>
    <div class="cols cols-aside">
      <div>
        <h2>The failure is systemic.</h2>
      </div>
      <div>
        <p>Important reports exist, then decay. Links rot. Formats become brittle. Discoverability collapses.
        A 174-page inquiry arrives as a single scanned PDF with no headings, no search, and no way to point
        anyone at page 62.</p>
        <p>The web is built for sharing and searching. These documents are published as if it did not exist.</p>
      </div>
    </div>
  </section>

  <section class="section wrap">
    <p class="section-label mono">What we change</p>
    <div class="cols cols-3">
      <div class="col">
        <h3>Readable</h3>
        <p>Web-native text at a comfortable measure, on any device. Not a download.</p>
      </div>
      <div class="col">
        <h3>Linkable</h3>
        <p>Every paragraph has a permanent address. Highlight a passage, get a link straight to it.</p>
      </div>
      <div class="col">
        <h3>Findable</h3>
        <p>Full text a search engine can actually index, hosted somewhere stable.</p>
      </div>
    </div>
  </section>

  <section class="section wrap" id="reports">
    <p class="section-label mono">The archive</p>
    ${renderReportList(registry)}
  </section>
</main>`;

  return renderLayout("Reports that Matter", body);
}

export function renderReportsIndex(registry: ReportRegistry): string {
  const body = `
<main>
  <section class="report-header wrap">
    <p class="kicker mono">The archive</p>
    <h1>Reports</h1>
    <p class="byline mono">${registry.reports.length} report${registry.reports.length === 1 ? "" : "s"} published</p>
  </section>
  <section class="section wrap" style="border-top:0">
    ${renderReportList(registry)}
  </section>
</main>`;

  return renderLayout("Reports — Reports that Matter", body);
}
