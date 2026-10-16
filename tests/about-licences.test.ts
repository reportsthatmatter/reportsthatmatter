/** /about says what the licences are (reportsthatmatter-y2y8.9, decision 0024), and the registry records none it cannot back. */
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { readFileSync } from "node:fs";

describe("licences", () => {
  it("/about has a Licences section naming MIT, the public-domain and OGL statuses and CC BY 4.0", async () => {
    const html = await (await app.request("http://localhost/about")).text();
    const section = html.match(/id="licences"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(section).toMatch(/MIT licence/);
    expect(section).toMatch(/public\s+domain/);
    expect(section).toMatch(/Open Government Licence/);
    expect(section).toMatch(/CC BY 4\.0/);
  });

  it("the registry records no licence for reports whose status is unconfirmed (Hillsborough, Lehman)", () => {
    const yaml = readFileSync("reports/registry.yaml", "utf8");
    for (const id of ["uk-hillsborough-panel", "us-lehman-examiner"]) {
      const block = yaml.split(/^  - id: /m).find((b) => b.startsWith(id)) ?? "";
      expect(block, id).not.toBe("");
      expect(block, id).not.toMatch(/^    license:/m);
    }
  });
});
