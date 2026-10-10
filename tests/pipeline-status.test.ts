import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatStatus, hasDrift, pinnedFiles, pipelineStatus, readRecord } from "../scripts/lib/pipeline-status";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const put = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const yaml = (o: unknown) => JSON.stringify(o); // JSON is YAML

type Stage = "repo" | "ingest" | "evaluate" | "editorial" | "announce" | "promote";
const ORDER: Stage[] = ["repo", "ingest", "evaluate", "editorial", "announce", "promote"];

/**
 * A site checkout with a sibling report repo `<id>-repo` for report `r1`, filled in cumulatively up to
 * and including `upTo` (publish needs the network, so it is never filled in).
 */
function fixture(upTo: Stage | null, unit: Record<string, unknown> = {}, extra: { more?: Record<string, unknown>[] } = {}) {
  const base = mkdtempSync(join(tmpdir(), "rtm-pipeline-"));
  const root = join(base, "site");
  const repo = join(base, "r1-repo");
  const has = (s: Stage) => upTo !== null && ORDER.indexOf(s) <= ORDER.indexOf(upTo);
  const pdf = "the pdf";
  put(join(root, "reports/pipeline.yaml"), yaml({ units: [{ id: "r1", scope: "the report", reached: "candidate", state: "active", ...unit }, ...(extra.more ?? [])] }));
  put(join(root, "reports/manifest.yaml"), yaml({ reports: has("repo") ? [{ id: "r1", dir: "../r1-repo" }] : [] }));
  put(join(root, "reports/registry.yaml"), yaml({ reports: has("evaluate") ? [{ id: "r1", title: "The R1 Report", ingested: true }] : [] }));
  if (has("evaluate")) put(join(root, "reports/corpus-baseline/r1.json"), "{}");
  put(join(root, "reports/oracle-budget.yaml"), yaml({ reports: has("evaluate") ? { r1: {} } : {} }));
  if (has("repo")) {
    put(join(repo, "archive/a.pdf"), pdf);
    put(join(repo, "ingest.ts"), `volumes: [{ path: "archive/a.pdf", sha256: "${sha(pdf)}" }]`);
    put(join(repo, "datapackage.json"), JSON.stringify({ resources: [{ path: "archive/a.pdf", sources: [{ web: "https://x" }] }] }));
    put(join(repo, "README.md"), "# R1\n\n## Source\n\nThe official PDF.\n");
  }
  if (has("ingest")) {
    put(join(root, "reports/r1/full.md"), "# R1\n\ntext");
    put(join(repo, "baseline.json"), "{}");
  }
  if (has("evaluate")) {
    put(join(root, "reports/r1/PROCESSING.md"), "# Processing");
    put(join(repo, "golden.yaml"), yaml({ pages: [1, 2, 3, 4, 5].map((pdf) => ({ pdf })) }));
  }
  if (has("editorial")) {
    put(join(root, "editorial/r1.yaml"), yaml({ report: "r1", status: "approved", highlights: [{ card: true }, { card: true }, { card: true }, {}] }));
    for (const f of ["assets/marks/r1.webp", "assets/marks/r1-row.webp", "assets/cards/r1/default.png"]) put(join(root, f), "x");
  }
  if (has("announce")) put(join(root, "docs/CHANGELOG.md"), "# Changelog\n\n## 2026-10-03 — The R1 Report is published\n\ntext\n");
  if (has("promote")) {
    const items = [1, 2, 3].map((n) => ({ id: `r1:${n}`, report: "r1", scheduled: `2026-10-0${n}` }));
    put(join(root, "marketing/queue.yaml"), yaml({ items }));
  }
  return root;
}

const only = async (root: string) => (await pipelineStatus({ root })).statuses[0];

describe("pinnedFiles", () => {
  it("reads pairs on one line or on two, and ignores a path with no checksum", () => {
    const hex = "a".repeat(64);
    const text = `{ path: "archive/a.pdf", sha256: "${hex}" },\n{\n  path: "archive/b.pdf",\n  sha256: "${hex}",\n},\n{ path: "x.pdf" }`;
    expect(pinnedFiles(text).map((p) => p.path)).toEqual(["archive/a.pdf", "archive/b.pdf"]);
  });
});

describe("derivation", () => {
  it("derives each stage from its artefacts, cumulatively", async () => {
    expect((await only(fixture("repo"))).derived).toBe("repo");
    expect((await only(fixture("ingest"))).derived).toBe("ingest");
    expect((await only(fixture("evaluate"))).derived).toBe("evaluate");
    expect((await only(fixture("editorial"))).derived).toBe("editorial");
    expect((await only(fixture("announce"))).derived).toBe("announce");
    expect((await only(fixture("promote"))).derived).toBe("promote");
  });

  it("sees nothing below the repo stage from a unit with no repo", async () => {
    const s = await only(fixture(null));
    expect(s.derived).toBeNull();
    expect(s.verdict).toBe("ok");
  });

  it("does not skip a stage: a golden.yaml with 4 pages stops it at ingest", async () => {
    const root = fixture("editorial");
    put(join(root, "../r1-repo/golden.yaml"), yaml({ pages: [1, 2, 3, 4].map((pdf) => ({ pdf })) }));
    const s = await only(root);
    expect(s.derived).toBe("ingest");
    expect(s.items.find((i) => i.id === "evaluate.golden")?.state).toBe("unmet");
  });

  it("reports an unknown, not an unmet, when the report repo is not checked out", async () => {
    const root = fixture("editorial", { reached: "editorial" });
    rmSync(join(root, "../r1-repo"), { recursive: true });
    const s = await pipelineStatus({ root });
    const status = s.statuses[0];
    expect(status.items.find((i) => i.id === "repo.checkout")?.state).toBe("unknown");
    expect(status.verdict).not.toBe("over-claim");
    expect(hasDrift(s)).toBe(false);
  });

  it("verifies pinned checksums only with deep", async () => {
    const root = fixture("repo", { reached: "repo" });
    put(join(root, "../r1-repo/archive/a.pdf"), "tampered");
    expect((await pipelineStatus({ root })).statuses[0].verdict).toBe("ok");
    const deep = (await pipelineStatus({ root, deep: true })).statuses[0];
    expect(deep.verdict).toBe("over-claim");
    expect(deep.problems.join()).toContain("checksum differs: archive/a.pdf");
  });
});

describe("the record against the artefacts", () => {
  it("passes a row that claims what the artefacts show", async () => {
    const r = await pipelineStatus({ root: fixture("evaluate", { reached: "evaluate" }) });
    expect(r.statuses[0].verdict).toBe("ok");
    expect(hasDrift(r)).toBe(false);
  });

  it("fails a row that over-claims, naming the missing item", async () => {
    const r = await pipelineStatus({ root: fixture("ingest", { reached: "evaluate" }) });
    expect(r.statuses[0].verdict).toBe("over-claim");
    expect(r.statuses[0].problems.join()).toContain("claims evaluate but evaluate.registered is unmet");
    expect(hasDrift(r)).toBe(true);
  });

  it("fails a row that is behind the artefacts", async () => {
    const r = await pipelineStatus({ root: fixture("editorial", { reached: "ingest" }) });
    expect(r.statuses[0].verdict).toBe("behind");
    expect(hasDrift(r)).toBe(true);
  });

  it("accepts a candidate or source claim with no repo, and flags one with a repo behind", async () => {
    expect((await only(fixture(null, { reached: "source" }))).verdict).toBe("ok");
    expect((await only(fixture("repo", { reached: "source" }))).verdict).toBe("behind");
  });

  it("lets a claim at publish stand without the editorial gate (the fast path), but not a claim at editorial", async () => {
    const root = fixture("evaluate", { reached: "publish" });
    expect((await only(root)).verdict).toBe("unverified"); // publish needs the network
    expect((await only(fixture("evaluate", { reached: "editorial" }))).verdict).toBe("over-claim");
  });

  it("checks a claim at publish against the served hash with the network probe", async () => {
    const root = fixture("editorial", { reached: "publish" });
    const probe = (served: string) => async () => ({ local: "h1", served });
    const live = (await pipelineStatus({ root, publish: probe("h1") })).statuses[0];
    expect(live.derived).toBe("publish");
    expect(live.verdict).toBe("ok");
    const never = (await pipelineStatus({ root, publish: probe("assets") })).statuses[0];
    expect(never.verdict).toBe("over-claim");
    const stale = (await pipelineStatus({ root, publish: probe("h0") })).statuses[0];
    expect(stale.verdict).toBe("ok");
    expect(stale.next).toContain("republish");
    const down = (await pipelineStatus({ root, publish: async () => ({ error: "unreachable" }) })).statuses[0];
    expect(down.verdict).toBe("unverified");
  });

  it("does not count the announce gate from a changelog heading that does not announce it", async () => {
    const root = fixture("editorial", { reached: "publish" });
    put(join(root, "docs/CHANGELOG.md"), "## 2026-10-01 — Fixes in the R1 Report\n");
    const s = await pipelineStatus({ root, publish: async () => ({ local: "h", served: "h" }) });
    expect(s.statuses[0].derived).toBe("publish");
  });

  it("matches a changelog heading by the unit's own words", async () => {
    const root = fixture("editorial", { reached: "publish", match: ["Rone"] });
    put(join(root, "docs/CHANGELOG.md"), "## 2026-10-01 — Rone is published\n");
    const s = await pipelineStatus({ root, publish: async () => ({ local: "h", served: "h" }) });
    expect(s.statuses[0].derived).toBe("announce");
    expect(s.statuses[0].verdict).toBe("behind");
  });
});

describe("waivers", () => {
  it("accepts a named gap and names the bead, until the gap closes", async () => {
    const root = fixture("evaluate", { reached: "evaluate", waive: { "evaluate.processing": "rtm-1" } });
    rmSync(join(root, "reports/r1/PROCESSING.md"));
    const waived = await only(root);
    expect(waived.verdict).toBe("ok");
    expect(waived.items.find((i) => i.id === "evaluate.processing")?.waived).toBe("rtm-1");
    // The file lands: the waiver is stale.
    put(join(root, "reports/r1/PROCESSING.md"), "# Processing");
    const stale = await pipelineStatus({ root });
    expect(stale.statuses[0].problems.join()).toContain("waiver evaluate.processing (rtm-1) is stale");
    expect(hasDrift(stale)).toBe(true);
  });

  it("rejects a waiver that names no gate item", async () => {
    const s = await only(fixture("evaluate", { reached: "evaluate", waive: { "evaluate.nothing": "rtm-1" } }));
    expect(s.problems.join()).toContain("names no gate item");
  });
});

describe("the whole record", () => {
  it("derives only the first row of an id; further scopes are record only", async () => {
    const root = fixture("evaluate", { reached: "evaluate" }, { more: [{ id: "r1", scope: "volumes 2-3", reached: "candidate", state: "active" }] });
    const r = await pipelineStatus({ root });
    expect(r.statuses.map((s) => s.verdict)).toEqual(["ok", "record-only"]);
    expect(r.statuses[1].next).toContain("report-source");
  });

  it("flags a registered report with no row, and a malformed row", async () => {
    const root = fixture("evaluate", { reached: "evaluate" });
    put(join(root, "reports/pipeline.yaml"), yaml({ units: [{ id: "r2", reached: "nonsense", state: "active" }] }));
    const r = await pipelineStatus({ root });
    expect(r.problems.join("\n")).toContain('reached "nonsense" is not one of');
    expect(r.problems.join("\n")).toContain("r1 is in reports/registry.yaml but has no row");
    expect(hasDrift(r)).toBe(true);
    expect(readRecord(root).units).toEqual([]);
  });

  it("prints a table with the next action, and marks parked rows", async () => {
    const root = fixture("ingest", { reached: "ingest", state: "parked", bead: "rtm-9" });
    const text = formatStatus(await pipelineStatus({ root }));
    expect(text).toContain("r1 (the report)");
    expect(text).toContain("parked (rtm-9): report-evaluate: registered");
    expect(text).toContain("agrees with the artefacts");
  });
});

describe("the seeded record", () => {
  it("is well-formed, one derived row per report id, with every stage name valid", async () => {
    const root = join(import.meta.dirname, "..");
    const r = readRecord(root);
    expect(r.problems).toEqual([]);
    expect(r.units.length).toBeGreaterThan(10);
  });
});
