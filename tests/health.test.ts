import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("health", () => {
  it("returns ok", async () => {
    const res = await app.request("http://localhost/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
