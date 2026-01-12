import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("routes", () => {
  it("renders home page with report link", async () => {
    const res = await app.request("http://localhost/");
    expect(res.status).toBe(200);
    const body = await res.text();
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
  });
});
