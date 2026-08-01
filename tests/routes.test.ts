import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("routes", () => {
  it("serves static assets", async () => {
    const res = await app.request(
      "http://localhost/assets/images/senate-screenshot-2.png"
    );
    expect(res.status).toBe(200);
  });

  it("serves static assets via ASSETS binding", async () => {
    const res = await app.request(
      "http://localhost/assets/images/senate-screenshot-2.png",
      {},
      {
        ASSETS: {
          fetch: async (req: Request) => {
            const url = new URL(req.url);
            return url.pathname === "/images/senate-screenshot-2.png"
              ? new Response("ok")
              : new Response("not found", { status: 404 });
          },
        },
      }
    );
    expect(res.status).toBe(200);
  });

  it("renders home page with report link", async () => {
    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports that Matter");
    expect(body).toContain('href="/reports"');
    expect(body).toContain("Wall Street and the Financial Crisis");
  });

  it("serves the design system stylesheet, not a CDN framework", async () => {
    const res = await app.request("http://localhost/");
    const body = await res.text();
    expect(body).toContain('href="/assets/styles.css"');
    expect(body).not.toContain("cdn.tailwindcss.com");
  });

  it("renders report index", async () => {
    const res = await app.request("http://localhost/reports");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports");
    expect(body).toContain("Wall Street and the Financial Crisis");
  });

  it("renders the about page", async () => {
    const res = await app.request("http://localhost/about");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("made accessible");
  });

  it("renders report detail with paragraph anchors and share affordance", async () => {
    const res = await app.request(
      "http://localhost/reports/us-senate-wall-street-and-financial-crisis"
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Wall Street and the Financial Crisis");
    expect(body).toContain('id="p-1"');
    expect(body).toContain('class="permalink" href="#p-1"');
    expect(body).toContain('id="share-pop"');
    expect(body).toContain("/assets/share.js");
  });

  it("returns 404 for an unknown report", async () => {
    const res = await app.request("http://localhost/reports/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("escapes markup in report titles", async () => {
    const { renderReport } = await import("../src/templates/report");
    const html = renderReport({ title: "<script>alert(1)</script>" }, "<p>body</p>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
