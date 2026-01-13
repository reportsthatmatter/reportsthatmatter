import type { ReportRegistry } from "../lib/registry";
import { renderLayout } from "./layout";

export function renderIndex(registry: ReportRegistry): string {
  const reportCards = registry.reports
    .map((report) => {
      const meta = [report.authors, report.published_at].filter(Boolean).join(" · ");
      return `
        <article class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
          <div class="text-xs uppercase tracking-[0.2em] text-[#5a5861]">Report</div>
          <h3 class="brand-serif mt-3 text-2xl font-semibold">${report.title}</h3>
          ${meta ? `<p class="mt-3 text-sm text-[#5a5861]">${meta}</p>` : ""}
          <a class="mt-4 inline-flex text-sm font-semibold text-[#2e6b6a] transition-colors hover:text-[#121014]" href="/reports/${report.id}">
            Read report →
          </a>
        </article>
      `;
    })
    .join("");

  const body = `
    <main>
      <section class="px-[6vw] pb-16 pt-5 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" id="problem">
        <div>
          <span class="inline-flex items-center rounded-full bg-[#121014] px-3 py-1 text-[0.7rem] uppercase tracking-[0.2em] text-[#f7f0e7]">Public-interest web access</span>
          <h1 class="brand-serif mt-4 text-[clamp(2.8rem,5vw,5.4rem)] leading-[0.95]">Reports that shaped history are still trapped in PDFs.</h1>
          <p class="mt-4 max-w-xl text-[1.05rem] text-[#5a5861]">
            Governments publish deep, authoritative reports. Yet readers still face broken websites,
            fragmented downloads, and near-impossible citation. Reports that Matter rebuilds them for real use.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <a class="rounded-xl bg-[#c35f3a] px-5 py-3 text-sm font-semibold text-[#f7f0e7]" href="#reports">Explore reports</a>
            <a class="rounded-xl border border-[#121014] px-5 py-3 text-sm font-semibold text-[#121014]" href="#">Get updates</a>
          </div>
        </div>
        <div class="rounded-2xl bg-[linear-gradient(120deg,rgba(195,95,58,0.12),rgba(46,107,106,0.12))] p-7">
          <h2 class="brand-serif text-2xl font-semibold">What should be true</h2>
          <p class="mt-3 text-[#5a5861]">Search, browse, and cite a public report in the same way you read an article — by passage, not by PDF volume.</p>
          <div class="mt-6 space-y-4">
            <div class="flex flex-wrap gap-4 border-b border-[#d6cbbc] pb-3">
              <span class="min-w-[140px] font-bold text-[#2e6b6a]">Discoverable</span>
              <span class="text-[#5a5861]">Search engines can index it.</span>
            </div>
            <div class="flex flex-wrap gap-4 border-b border-[#d6cbbc] pb-3">
              <span class="min-w-[140px] font-bold text-[#2e6b6a]">Linkable</span>
              <span class="text-[#5a5861]">Deep links to any paragraph.</span>
            </div>
            <div class="flex flex-wrap gap-4">
              <span class="min-w-[140px] font-bold text-[#2e6b6a]">Readable</span>
              <span class="text-[#5a5861]">Web-native, not a download.</span>
            </div>
          </div>
        </div>
      </section>

      <section class="border-y border-[#d6cbbc] bg-[#e7dfd2] px-[6vw] py-16" id="evidence">
        <div class="grid gap-7 lg:grid-cols-2">
          <div class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
            <h3 class="brand-serif text-2xl font-semibold">US Senate financial crisis investigation</h3>
            <p class="mt-3 text-[#5a5861]">One of the most cited reports in post-2008 journalism is still hidden behind committee pages and PDF listings with unreliable links.</p>
            <img class="mt-4 w-full rounded-xl border border-[#e7dfd2]" src="/assets/images/senate-screenshot-2.png" alt="Senate subcommittee report list" />
          </div>
          <div class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
            <h3 class="brand-serif text-2xl font-semibold">Saville Inquiry (UK)</h3>
            <p class="mt-3 text-[#5a5861]">The inquiry has a site, but navigation breaks down: plain text links, fragmented downloads, and email-only alternatives.</p>
            <img class="mt-4 w-full rounded-xl border border-[#e7dfd2]" src="/assets/images/saville-screenshot-2.png" alt="Saville Inquiry reports page" />
          </div>
        </div>
      </section>

      <section class="px-[6vw] py-16">
        <div class="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div>
            <h2 class="brand-serif text-3xl font-semibold">The failure is systemic.</h2>
            <p class="mt-3 text-[#5a5861]">Important reports exist, then decay. Links rot. Formats become brittle. Discoverability collapses. The web is built for sharing and searching; these reports are published as if the web did not exist.</p>
          </div>
          <div class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
            <h3 class="brand-serif text-2xl font-semibold">What Reports that Matter changes</h3>
            <div class="mt-5 space-y-4">
              <div class="flex flex-wrap gap-4 border-b border-[#d6cbbc] pb-3">
                <span class="min-w-[140px] font-bold text-[#2e6b6a]">Permanence</span>
                <span class="text-[#5a5861]">Stable, modern hosting.</span>
              </div>
              <div class="flex flex-wrap gap-4 border-b border-[#d6cbbc] pb-3">
                <span class="min-w-[140px] font-bold text-[#2e6b6a]">Full text</span>
                <span class="text-[#5a5861]">Extraction for search and browse.</span>
              </div>
              <div class="flex flex-wrap gap-4 border-b border-[#d6cbbc] pb-3">
                <span class="min-w-[140px] font-bold text-[#2e6b6a]">Deep links</span>
                <span class="text-[#5a5861]">Cite the exact passage.</span>
              </div>
              <div class="flex flex-wrap gap-4">
                <span class="min-w-[140px] font-bold text-[#2e6b6a]">Clarity</span>
                <span class="text-[#5a5861]">A calm, readable interface.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="border-y border-[#d6cbbc] bg-[#e7dfd2] px-[6vw] py-16" id="change">
        <div class="grid gap-7 lg:grid-cols-2">
          <div class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
            <h3 class="brand-serif text-2xl font-semibold">Why this matters</h3>
            <p class="mt-3 text-[#5a5861]">Inquiry reports contain evidence, testimony, timelines, and findings that anchor public understanding. When access is poor, public discourse becomes thinner and less accountable.</p>
          </div>
          <div class="rounded-2xl border border-[#e7dfd2] bg-white p-6 shadow-[0_18px_36px_rgba(18,16,20,0.12)]">
            <h3 class="brand-serif text-2xl font-semibold">Scope and status</h3>
            <p class="mt-3 text-[#5a5861]">We focus on English-language reports from the UK and US. Independent, public-interest project. No marketing spin — just better access.</p>
          </div>
        </div>
      </section>

      <section class="px-[6vw] py-16" id="reports">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 class="brand-serif text-3xl font-semibold">Reports</h2>
            <p class="mt-2 text-[#5a5861]">Browse the current archive of rendered reports.</p>
          </div>
          <a class="text-sm font-semibold text-[#2e6b6a] hover:text-[#121014]" href="/reports">View all</a>
        </div>
        <div class="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          ${reportCards}
        </div>
      </section>
    </main>

    <footer class="px-[6vw] pb-24 text-[#5a5861]" id="scope">
      Reports that Matter is a public-interest initiative focused on web-native access to official inquiries.
    </footer>
  `;

  return renderLayout(
    "Reports that Matter",
    body,
    [
      { label: "Problem", href: "#problem" },
      { label: "Evidence", href: "#evidence" },
      { label: "Change", href: "#change" },
      { label: "Reports", href: "#reports" },
    ]
  );
}
