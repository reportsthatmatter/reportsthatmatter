import { renderLayout } from "./layout";

export function renderReport(title: string, html: string): string {
  const body = `
    <main class="px-[6vw] pb-24">
      <div class="max-w-3xl mx-auto">
        <div class="mb-8">
          <p class="text-xs uppercase tracking-[0.2em] text-[#5a5861]">Report</p>
          <h1 class="brand-serif mt-3 text-4xl font-semibold">${title}</h1>
        </div>
        <div class="report-body text-[1.05rem] leading-8 text-[#1b1a1f]">
          ${html}
        </div>
      </div>
    </main>
  `;

  return renderLayout(title, body, [
    { label: "Home", href: "/" },
    { label: "Reports", href: "/reports" },
  ]);
}
