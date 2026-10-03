import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepo, formatPreflight, pinSkew, pinnedVersion, preflight } from "../scripts/lib/preflight";

const GH = (v: string) => `github:reportsthatmatter/ingest#v${v}`;

/** A fake report repo: package.json pinning `pin`, and (unless null) an installed copy at `installed`. */
function repo(pin: string | null, installed: string | null, how: "copy" | "link" = "copy"): string {
  const dir = mkdtempSync(join(tmpdir(), "rtm-preflight-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: pin === null ? {} : { "@rtm/ingest": GH(pin) } }));
  if (installed !== null) {
    const real =
      how === "copy"
        ? join(dir, "node_modules/.pnpm/@rtm+ingest@x/node_modules/@rtm/ingest")
        : join(mkdtempSync(join(tmpdir(), "rtm-ingest-checkout-")), "ingest");
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, "package.json"), JSON.stringify({ name: "@rtm/ingest", version: installed }));
    mkdirSync(join(dir, "node_modules/@rtm"), { recursive: true });
    symlinkSync(real, join(dir, "node_modules/@rtm/ingest"));
  }
  return dir;
}

describe("pinnedVersion", () => {
  it("reads a git tag, a plain version and a range", () => {
    expect(pinnedVersion(GH("0.18.0"))).toBe("0.18.0");
    expect(pinnedVersion("0.18.1")).toBe("0.18.1");
    expect(pinnedVersion("^0.12.3")).toBe("0.12.3");
  });
  it("has no version for a link or a branch", () => {
    expect(pinnedVersion("link:../ingest")).toBeNull();
    expect(pinnedVersion("github:reportsthatmatter/ingest#main")).toBeNull();
    expect(pinnedVersion(undefined)).toBeNull();
  });
});

describe("checkRepo", () => {
  it("passes when the installed copy is the pinned version", () => {
    expect(checkRepo("a", repo("0.18.0", "0.18.0")).ok).toBe(true);
  });

  it("fails a stale install, naming both versions and the fix", () => {
    const dir = repo("0.18.0", "0.17.0");
    const row = checkRepo("a", dir);
    expect(row.ok).toBe(false);
    expect(row.problem).toBe("pins v0.18.0 but v0.17.0 is installed");
    expect(row.fix).toBe(`pnpm -C ${dir} install`);
  });

  it("fails when nothing is installed", () => {
    const row = checkRepo("a", repo("0.18.0", null));
    expect(row.ok).toBe(false);
    expect(row.problem).toMatch(/not installed/);
  });

  it("fails a directory that is not there, telling the reader to clone it", () => {
    const row = checkRepo("a", join(tmpdir(), "rtm-preflight-no-such-dir"));
    expect(row.ok).toBe(false);
    expect(row.fix).toMatch(/clone/);
  });

  it("accepts a linked override whatever its version, and says so", () => {
    const row = checkRepo("a", repo("0.18.0", "0.19.0-dev", "link"));
    expect(row.ok).toBe(true);
    expect(row.linked).toBe(true);
    expect(formatPreflight([row])).toMatch(/linked override/);
  });

  it("fails a repo that does not depend on @rtm/ingest", () => {
    expect(checkRepo("a", repo(null, "0.18.0")).ok).toBe(false);
  });
});

describe("preflight", () => {
  it("checks the site first and each repo once, even when reports share a repo", () => {
    const site = repo("0.18.1", "0.18.1");
    const shared = repo("0.18.0", "0.18.0");
    const rows = preflight(site, [["x", shared], ["y", shared]]);
    expect(rows.map((r) => r.id)).toEqual(["site", "x"]);
  });

  it("reports pin skew against the site, grouped", () => {
    const rows = preflight(repo("0.18.1", "0.18.1"), [["x", repo("0.18.0", "0.18.0")], ["y", repo("0.18.0", "0.18.0")], ["z", repo("0.18.1", "0.18.1")]]);
    expect(pinSkew(rows)).toEqual(["2 report repo(s) pin v0.18.0, the site pins v0.18.1: x, y"]);
  });
});
