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
    expect(body).toContain("https://cdn.tailwindcss.com");
    expect(body).toContain("Reports that Matter");
    expect(body).toContain("href=\"#reports\"");
    expect(body).toContain("Wall Street and the Financial Crisis");
  });

  it("renders report index", async () => {
    const res = await app.request("http://localhost/reports");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Reports");
  });

  it("renders report detail", async () => {
    const res = await app.request(
      "http://localhost/reports/us-senate-wall-street-and-financial-crisis"
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Wall Street and the Financial Crisis");
    expect(body).toContain("id=\"p-1\"");
    expect(body).toContain("max-w-3xl");
  });
});
