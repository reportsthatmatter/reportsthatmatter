/**
 * `pnpm pipeline status`: derive how far each unit in reports/pipeline.yaml has actually got from the
 * artefacts the stage gates name, and check the record against it (reportsthatmatter-ifb5.9).
 *
 * Design: docs/design/2026-10-03-report-preparation-pipeline.md §6 and the exit gates in
 * .claude/skills/report-<stage>/SKILL.md. Every gate item here is one line of one of those checklists
 * that an artefact can answer; the ones that need a person (verify.sh exited 0, "rendered pages read")
 * are not derived.
 *
 * Three answers per item: met, unmet, unknown. Unknown is what a missing sibling checkout or a missing
 * network gives; it is never drift, so CI (no sibling repos) and offline runs stay quiet and the table
 * says what could not be checked.
 *
 * The record's claim is checked in three ways:
 *   over-claim: a stage at or below `reached` has an unmet item (editorial is exempt from a claim at or
 *               past publish: the fast path ships text first).
 *   behind:     the artefacts show a later stage than `reached`.
 *   waiver:     a unit may name an unmet item and the Bead that owns it (`waive: {"evaluate.processing":
 *               bead}`); that is accepted, and a waiver whose item is now met is stale and is drift.
 *
 * Only the first row for a report id is derived. Later rows with the same id are further scopes of a
 * live report (more volumes): the report repo's artefacts say nothing about them, so they are shown as
 * record only.
 *
 * Pure of process state: every input is a path or an injected probe, so tests build fixtures in a tmp dir.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { resolveReportDir } from "./report-dirs";

export const STAGES = ["candidate", "source", "repo", "ingest", "evaluate", "editorial", "publish", "announce", "promote"] as const;
export type Stage = (typeof STAGES)[number];
export const UNIT_STATES = ["active", "parked", "waiting", "ongoing"] as const;

export const SKILL: Record<Stage, string> = {
  candidate: "report-source",
  source: "report-repo",
  repo: "report-first-ingest",
  ingest: "report-evaluate",
  evaluate: "report-editorial",
  editorial: "report-publish",
  publish: "report-announce",
  announce: "report-promote",
  promote: "report-promote",
};

export type Unit = {
  id: string;
  scope?: string;
  bead?: string;
  reached: Stage;
  state: (typeof UNIT_STATES)[number];
  evidence?: string;
  notes?: string;
  /** Item id ("evaluate.processing") to the Bead that owns the gap. */
  waive?: Record<string, string>;
  /** Words that identify the report in a changelog or blog heading (default: its id and registry title). */
  match?: string[];
};

export type ItemState = "met" | "unmet" | "unknown";
export type Item = {
  /** `<stage>.<name>`, the key a waiver uses. */
  id: string;
  stage: Stage;
  state: ItemState;
  detail: string;
  /** Met, but there is work to do (a served hash that differs from the local one). */
  todo?: string;
  waived?: string;
};

export type Verdict = "ok" | "over-claim" | "behind" | "unverified" | "record-only" | "invalid";

export type UnitStatus = {
  unit: Unit;
  derived: Stage | null;
  /** Stages above `derived` that could not be checked. */
  unverified: Stage[];
  verdict: Verdict;
  problems: string[];
  next: string;
  items: Item[];
};

/** What the network can say about one report; injected so tests need no fetch. */
export type PublishProbe = (id: string) => Promise<{ local: string; served: string } | { error: string }>;

export type Options = {
  root: string;
  /** Verify archive checksums (reads every pinned file). */
  deep?: boolean;
  publish?: PublishProbe;
  /** Environment for the report-directory resolver (RTM_REPORT_DIRS). Default none: tests are pure of process state. */
  env?: NodeJS.ProcessEnv;
};

const rank = (stage: Stage) => STAGES.indexOf(stage);
const readText = (path: string) => readFileSync(path, "utf8");
const readYaml = (path: string): any => (existsSync(path) ? parse(readText(path)) : null);

// ---------- reading the record ----------

export function readRecord(root: string): { units: Unit[]; problems: string[] } {
  const raw = readYaml(join(root, "reports/pipeline.yaml"));
  const problems: string[] = [];
  const units: Unit[] = [];
  for (const [i, u] of ((raw?.units ?? []) as any[]).entries()) {
    const label = `row ${i + 1} (${u?.id ?? "no id"})`;
    if (!u?.id) problems.push(`${label}: no id`);
    else if (!STAGES.includes(u.reached)) problems.push(`${label}: reached "${u.reached}" is not one of ${STAGES.join(", ")}`);
    else if (!UNIT_STATES.includes(u.state)) problems.push(`${label}: state "${u.state}" is not one of ${UNIT_STATES.join(", ")}`);
    else units.push(u as Unit);
  }
  return { units, problems };
}

// ---------- locating a report's repo ----------

/** The report repo's directory from reports/manifest.yaml, or null when the id is not in it. */
export function manifestDir(root: string, id: string, env: NodeJS.ProcessEnv = {}): string | null {
  const manifest = readYaml(join(root, "reports/manifest.yaml"));
  const entry = (manifest?.reports ?? []).find((r: any) => r.id === id);
  return entry ? resolveReportDir(root, id, entry, env).dir : null;
}

// ---------- gate items ----------

const item = (stage: Stage, name: string, state: ItemState, detail: string, todo?: string): Item => ({ id: `${stage}.${name}`, stage, state, detail, ...(todo ? { todo } : {}) });
const check = (stage: Stage, name: string, ok: boolean, detail: string): Item => item(stage, name, ok ? "met" : "unmet", detail);

/** Volumes pinned in ingest.ts: `path: "...", sha256: "..."` pairs, however they are laid out. */
export function pinnedFiles(ingestTs: string): { path: string; sha256: string }[] {
  return [...ingestTs.matchAll(/path:\s*"([^"]+)"\s*,?\s*sha256:\s*"([0-9a-fA-F]{64})"/g)].map((m) => ({ path: m[1], sha256: m[2].toLowerCase() }));
}

function repoItems(root: string, id: string, repo: string | null, inManifest: boolean, repoMissing: string, opts: Options): Item[] {
  const out: Item[] = [];
  const unmigrated = existsSync(join(root, "reports", id, "ingest.ts"));
  out.push(check("repo", "manifest", inManifest || unmigrated, inManifest ? "entry in reports/manifest.yaml" : "no entry in reports/manifest.yaml"));
  if (!repo) return out;
  if (!existsSync(repo)) {
    out.push(item("repo", "checkout", "unknown", repoMissing));
    return out;
  }
  const ingestPath = join(repo, "ingest.ts");
  if (!existsSync(ingestPath)) {
    out.push(check("repo", "pinned", false, "no ingest.ts"));
  } else {
    const pins = pinnedFiles(readText(ingestPath));
    const missing = pins.filter((p) => !existsSync(join(repo, p.path))).map((p) => p.path);
    const bad: string[] = [];
    if (opts.deep) {
      for (const p of pins) {
        if (existsSync(join(repo, p.path)) && createHash("sha256").update(readFileSync(join(repo, p.path))).digest("hex") !== p.sha256) bad.push(p.path);
      }
    }
    const ok = pins.length > 0 && !missing.length && !bad.length;
    out.push(
      check(
        "repo",
        "pinned",
        ok,
        !pins.length ? "ingest.ts pins no file (path + sha256)" : missing.length ? `pinned but not on disk: ${missing.join(", ")}` : bad.length ? `checksum differs: ${bad.join(", ")}` : `${pins.length} file(s) pinned${opts.deep ? " and verified" : " (checksums not recomputed; --deep does)"}`,
      ),
    );
    const archive = pins.filter((p) => p.path.startsWith("archive/")).map((p) => p.path);
    const dpPath = join(repo, "datapackage.json");
    if (!existsSync(dpPath)) out.push(check("repo", "datapackage", false, "no datapackage.json"));
    else {
      let listed: string[] = [];
      try {
        listed = (JSON.parse(readText(dpPath)).resources ?? []).filter((r: any) => r.sources?.length).map((r: any) => r.path);
      } catch {
        /* an unreadable file lists nothing */
      }
      const absent = archive.filter((p) => !listed.includes(p));
      out.push(check("repo", "datapackage", !absent.length, absent.length ? `no resource with a source for ${absent.join(", ")}` : `${listed.length} resource(s) with sources`));
    }
  }
  const readme = join(repo, "README.md");
  out.push(check("repo", "readme", existsSync(readme) && /^#+\s*(scope|source|materials)/im.test(readText(readme)), "README.md with a Scope, Source or Materials heading"));
  if (existsSync(join(repo, "reference"))) out.push(check("repo", "reference-manifest", existsSync(join(repo, "reference/manifest.json")), "reference/manifest.json"));
  return out;
}

function ingestItems(root: string, id: string, repo: string | null): Item[] {
  const site = join(root, "reports", id, "full.md");
  const have = (p: string) => existsSync(p) && statSync(p).size > 0;
  const out = [check("ingest", "full-md", have(site) || (!!repo && have(join(repo, "full.md"))), "full.md (aggregated into reports/<id>/ or in the repo)")];
  if (repo && existsSync(repo)) out.push(check("ingest", "baseline", existsSync(join(repo, "baseline.json")), "baseline.json in the report repo"));
  else if (repo) out.push(item("ingest", "baseline", "unknown", "report repo not checked out"));
  return out;
}

function evaluateItems(root: string, id: string, repo: string | null): Item[] {
  const registry = readYaml(join(root, "reports/registry.yaml"));
  const entry = (registry?.reports ?? []).find((r: any) => r.id === id);
  const out: Item[] = [check("evaluate", "registered", entry?.ingested === true, entry ? `registry entry, ingested: ${entry.ingested}` : "no registry entry")];
  const corpus = JSON.parse(existsSync(join(root, "reports/corpus-baseline.json")) ? readText(join(root, "reports/corpus-baseline.json")) : "{}");
  out.push(check("evaluate", "corpus-baseline", !!corpus.reports?.[id], "entry in reports/corpus-baseline.json"));
  const oracle = readYaml(join(root, "reports/oracle-budget.yaml"));
  out.push(check("evaluate", "oracle-budget", !!oracle?.reports?.[id], "entry in reports/oracle-budget.yaml"));
  out.push(check("evaluate", "processing", existsSync(join(root, "reports", id, "PROCESSING.md")) || (!!repo && existsSync(join(repo, "PROCESSING.md"))), "PROCESSING.md"));
  if (repo && existsSync(repo)) {
    const golden = readYaml(join(repo, "golden.yaml"));
    const pages = Array.isArray(golden?.pages) ? golden.pages.length : 0;
    out.push(check("evaluate", "golden", pages >= 5, `golden.yaml has ${pages} page(s), the gate wants 5 or more`));
    if (existsSync(join(repo, "reference"))) out.push(check("evaluate", "adjudicated", existsSync(join(repo, "reference/adjudicated.yaml")), "reference/adjudicated.yaml"));
  } else if (repo) out.push(item("evaluate", "golden", "unknown", "report repo not checked out"));
  return out;
}

function editorialItems(root: string, id: string): Item[] {
  const editorial = readYaml(join(root, "editorial", `${id}.yaml`));
  const cards = (editorial?.highlights ?? []).filter((h: any) => h.card === true).length;
  return [
    check("editorial", "approved", editorial?.status === "approved", editorial ? `editorial/${id}.yaml status: ${editorial.status}` : `no editorial/${id}.yaml`),
    check("editorial", "plate", ["assets/marks/" + id + ".webp", "assets/marks/" + id + "-row.webp", "assets/cards/" + id + "/default.png"].every((p) => existsSync(join(root, p))), "plate (both sizes) and default card"),
    check("editorial", "card-highlights", cards >= 3, `${cards} card: true highlight(s), the gate wants 3 or more`),
  ];
}

async function publishItems(id: string, opts: Options): Promise<Item[]> {
  if (!opts.publish) return [item("publish", "served-hash", "unknown", "needs --network")];
  const r = await opts.publish(id);
  if ("error" in r) return [item("publish", "served-hash", "unknown", r.error)];
  if (r.served === "assets") return [check("publish", "served-hash", false, "never published: the deploy's own copy is served")];
  return [item("publish", "served-hash", "met", r.served === r.local ? "served hash is the local hash" : "served hash differs from the local prerender", r.served === r.local ? undefined : "republish")];
}

/** A dated heading in docs/CHANGELOG.md, or a published blog post, announcing the report. */
function announceItems(root: string, id: string, unit: Unit): Item[] {
  const registry = readYaml(join(root, "reports/registry.yaml"));
  const title: string = (registry?.reports ?? []).find((r: any) => r.id === id)?.title ?? "";
  const names = (unit.match ?? [id, title]).filter(Boolean).map((s) => s.toLowerCase());
  const announces = /\b(published|now live|new report|launch)/i;
  const headings: string[] = [];
  const changelog = join(root, "docs/CHANGELOG.md");
  if (existsSync(changelog)) headings.push(...readText(changelog).split("\n").filter((l) => l.startsWith("## ")));
  const posts = join(root, "content/posts");
  if (existsSync(posts)) {
    for (const f of readdirSync(posts).filter((n) => n.endsWith(".md"))) {
      const text = readText(join(posts, f));
      if (/^status:\s*published/m.test(text)) headings.push("## " + (text.match(/^title:\s*"?(.*?)"?$/m)?.[1] ?? f));
    }
  }
  const hit = headings.find((h) => announces.test(h) && names.some((n) => h.toLowerCase().includes(n)));
  return [check("announce", "entry", !!hit, hit ? `"${hit.replace(/^## /, "")}"` : "no changelog heading or published post that announces it")];
}

function promoteItems(root: string, id: string): Item[] {
  const queue = readYaml(join(root, "marketing/queue.yaml"));
  const mine = (queue?.items ?? []).filter((q: any) => q.report === id && q.scheduled);
  return [check("promote", "queue", mine.length >= 3, `${mine.length} scheduled queue item(s), the gate wants 3 or more`)];
}

// ---------- one unit ----------

function stageState(items: Item[], stage: Stage): ItemState | "none" {
  const mine = items.filter((i) => i.stage === stage && !i.waived);
  if (!mine.length) return items.some((i) => i.stage === stage) ? "met" : "none";
  if (mine.some((i) => i.state === "unmet")) return "unmet";
  return mine.some((i) => i.state === "unknown") ? "unknown" : "met";
}

/** Stages whose items must be met for a claim of `claimed` to stand. */
function required(claimed: Stage): Stage[] {
  const upTo = STAGES.filter((s) => rank(s) >= rank("repo") && rank(s) <= rank(claimed));
  // The fast path publishes text before the introduction and excerpts are done.
  return rank(claimed) >= rank("publish") ? upTo.filter((s) => s !== "editorial") : upTo;
}

export function judge(unit: Unit, items: Item[]): Pick<UnitStatus, "derived" | "unverified" | "verdict" | "problems" | "next"> {
  const problems: string[] = [];
  const stat = (s: Stage) => stageState(items, s);

  // Waivers: accepted while the item is unmet or unknown, stale once it is met.
  for (const [key, bead] of Object.entries(unit.waive ?? {})) {
    const it = items.find((i) => i.id === key);
    if (!it) problems.push(`waiver ${key} (${bead}) names no gate item`);
    else if (it.state === "met") problems.push(`waiver ${key} (${bead}) is stale: ${it.detail}. Remove it`);
    else it.waived = bead;
  }

  // Derived: the highest stage that is itself met with every required stage below it met or unknown.
  let derived: Stage | null = null;
  const unverified: Stage[] = [];
  for (const s of STAGES.filter((s) => rank(s) >= rank("repo"))) {
    if (stat(s) === "met" && required(s).every((r) => ["met", "unknown", "none"].includes(stat(r)))) derived = s;
  }
  if (derived) for (const s of STAGES) if (rank(s) > rank("repo") && rank(s) < rank(derived) && stat(s) === "unknown") unverified.push(s);
  for (const s of STAGES) if (derived && rank(s) > rank(derived) && stat(s) === "unknown") unverified.push(s);

  const claimed = unit.reached;
  const over = required(claimed).filter((s) => stat(s) === "unmet");
  let verdict: Verdict = "ok";
  if (over.length) {
    verdict = "over-claim";
    for (const s of over) for (const i of items.filter((i) => i.stage === s && i.state === "unmet" && !i.waived)) problems.push(`claims ${claimed} but ${i.id} is unmet: ${i.detail}`);
  } else if (derived && rank(derived) > Math.max(rank(claimed), rank("source"))) {
    verdict = "behind";
    problems.push(`record says ${claimed} but the artefacts reach ${derived}`);
  } else if (rank(claimed) >= rank("repo") && required(claimed).some((s) => stat(s) === "unknown")) {
    verdict = "unverified";
  }
  if (problems.some((p) => p.startsWith("waiver")) && verdict === "ok") verdict = "invalid";

  return { derived, unverified, verdict, problems, next: nextAction(unit, items) };
}

function nextAction(unit: Unit, items: Item[]): string {
  const prefix = unit.state === "parked" ? `parked${unit.bead ? ` (${unit.bead})` : ""}: ` : unit.state === "waiting" ? "waiting: " : "";
  // The first stage with an unmet item or a todo (a pending republish).
  for (const s of STAGES.filter((s) => rank(s) >= rank("repo"))) {
    const mine = items.filter((i) => i.stage === s);
    const open = mine.filter((i) => (i.state === "unmet" && !i.waived) || i.todo);
    if (open.length) return `${prefix}${SKILL[STAGES[rank(s) - 1]]}: ${open.map((i) => i.todo ?? i.id.split(".")[1]).join(", ")}`;
  }
  if (unit.reached === "promote") return `${prefix}ongoing: rerun pnpm posts after a re-ingest`;
  return `${prefix}${SKILL[unit.reached]}`;
}

export async function deriveUnit(unit: Unit, opts: Options, secondary: boolean): Promise<UnitStatus> {
  if (secondary) {
    return {
      unit,
      derived: null,
      unverified: [],
      verdict: "record-only",
      problems: [],
      next: `${unit.state === "parked" ? "parked: " : ""}${SKILL[unit.reached]} (a further scope of ${unit.id}; the repo's artefacts do not describe it)`,
      items: [],
    };
  }
  const { root } = opts;
  // reportsthatmatter-ai23: RTM_REPORT_DIRS (opts.env) wins, as for every other script (scripts/lib/report-dirs.ts), so a
  // unit whose repo work is on a worktree branch reads from the branch, not from the shared checkout's empty main.
  const listed = manifestDir(root, unit.id, opts.env);
  // A report not yet in the manifest still has its repo, by convention a sibling named for the id (or its worktree).
  const guess = resolveReportDir(root, unit.id, null, opts.env).dir;
  const dir = listed ?? (existsSync(guess) ? guess : null);
  const items: Item[] = [
    ...repoItems(root, unit.id, dir, listed !== null, `report repo not found at ${dir}`, opts),
    ...ingestItems(root, unit.id, dir),
    ...evaluateItems(root, unit.id, dir),
    ...editorialItems(root, unit.id),
    ...(await publishItems(unit.id, opts)),
    ...announceItems(root, unit.id, unit),
    ...promoteItems(root, unit.id),
  ];
  return { unit, items, ...judge(unit, items) };
}

export async function pipelineStatus(opts: Options): Promise<{ statuses: UnitStatus[]; problems: string[] }> {
  const { units, problems } = readRecord(opts.root);
  const seen = new Set<string>();
  const statuses: UnitStatus[] = [];
  for (const unit of units) {
    statuses.push(await deriveUnit(unit, opts, seen.has(unit.id)));
    seen.add(unit.id);
  }
  const registry = readYaml(join(opts.root, "reports/registry.yaml"));
  for (const r of registry?.reports ?? []) if (!seen.has(r.id)) problems.push(`${r.id} is in reports/registry.yaml but has no row in reports/pipeline.yaml`);
  return { statuses, problems };
}

export const hasDrift = (r: { statuses: UnitStatus[]; problems: string[] }) =>
  r.problems.length > 0 || r.statuses.some((s) => s.verdict === "over-claim" || s.verdict === "behind" || s.verdict === "invalid");

// ---------- output ----------

export function formatStatus(r: { statuses: UnitStatus[]; problems: string[] }, verbose = false): string {
  const label = (s: UnitStatus) => `${s.unit.id}${s.unit.scope ? ` (${s.unit.scope.length > 34 ? s.unit.scope.slice(0, 33) + "…" : s.unit.scope})` : ""}`;
  const w = Math.max(4, ...r.statuses.map((s) => label(s).length));
  const derivedText = (s: UnitStatus) => (s.verdict === "record-only" ? "-" : `${s.derived ?? "pre-repo"}${s.unverified.length ? ` (${s.unverified[0]}?)` : ""}`);
  const lines = [`  ${"unit".padEnd(w)}  ${"state".padEnd(8)}  ${"recorded".padEnd(9)}  ${"derived".padEnd(20)}  ${"verdict".padEnd(11)}  next action`];
  for (const s of r.statuses) lines.push(`  ${label(s).padEnd(w)}  ${s.unit.state.padEnd(8)}  ${s.unit.reached.padEnd(9)}  ${derivedText(s).padEnd(20)}  ${s.verdict.padEnd(11)}  ${s.next}`);
  const notes: string[] = [];
  for (const s of r.statuses) {
    for (const p of s.problems) notes.push(`  ${s.unit.id}${s.unit.scope ? ` (${s.unit.scope})` : ""}: ${p}`);
    if (verbose) for (const i of s.items) notes.push(`    ${i.state.padEnd(7)} ${i.id}${i.waived ? ` [waived: ${i.waived}]` : ""}: ${i.detail}`);
  }
  for (const p of r.problems) notes.push(`  ${p}`);
  const unverified = r.statuses.filter((s) => s.unverified.length);
  const out = [...lines];
  if (notes.length) out.push("", verbose ? "items and problems" : "problems", ...notes);
  out.push("");
  if (unverified.length) out.push(`(stage?) is the first stage above the derived one that could not be checked (no network, or a sibling report repo not checked out); unchecked: ${[...new Set(unverified.flatMap((s) => s.unverified))].join(", ")}`);
  out.push(hasDrift(r) ? "DRIFT: reports/pipeline.yaml claims more, or less, than the artefacts show." : "reports/pipeline.yaml agrees with the artefacts that could be checked.");
  return out.join("\n");
}
