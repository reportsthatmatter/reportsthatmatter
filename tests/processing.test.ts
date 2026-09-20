import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { renderReportOverview } from "../src/templates/section";

const NOTES_PATH = "/generated/reports/uk-saville-inquiry/processing.html";

/** An ASSETS binding holding only the paths given, as the deploy would. */
function assetsWith(files: Record<string, string>) {
  return {
    fetch: async (req: Request) => {
      const body = files[new URL(req.url).pathname];
      return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
    },
  };
}

describe("processing notes", () => {
  it("serves a report's notes inside the site layout", async () => {
    const res = await app.request(
      "http://localhost/reports/uk-saville-inquiry/processing",
      {},
      { ASSETS: assetsWith({ [NOTES_PATH]: "<h2>Known limitations</h2><p>Twelve notes.</p>" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("About this edition");
    expect(body).toContain("Bloody Sunday Inquiry");
    expect(body).toContain("<h2>Known limitations</h2>");
    expect(body).toContain('href="/reports/uk-saville-inquiry"');
  });

  it("is a 404, not an empty page, for a report that has written none", async () => {
    const res = await app.request(
      "http://localhost/reports/uk-saville-inquiry/processing",
      {},
      { ASSETS: assetsWith({}) }
    );
    expect(res.status).toBe(404);
  });

  it("is a 404 for a report the registry does not know", async () => {
    const res = await app.request(
      "http://localhost/reports/no-such-report/processing",
      {},
      { ASSETS: assetsWith({ "/generated/reports/no-such-report/processing.html": "<p>x</p>" }) }
    );
    expect(res.status).toBe(404);
  });

  it("escapes the report title it is given", async () => {
    const { renderProcessing } = await import("../src/templates/processing");
    const html = renderProcessing({ id: "x", title: "<script>alert(1)</script>" }, "<p>ok</p>");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("report overview link to the notes", () => {
  const meta = { id: "uk-saville-inquiry", title: "Saville" };
  const sections = [{ slug: "intro", title: "Intro", level: 2 as const, page: "1" }];

  it("links to them only when the report has them", () => {
    const linked = renderReportOverview(meta, sections, { words: 10 }, [], { processingNotes: true });
    const bare = renderReportOverview(meta, sections, { words: 10 });
    expect(linked).toContain('href="/reports/uk-saville-inquiry/processing"');
    expect(bare).not.toContain("/processing");
  });
});
