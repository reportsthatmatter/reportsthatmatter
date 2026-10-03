/* Paragraph-id aliases and the record of every id ever published (reportsthatmatter-q8c).
 *
 *   pnpm aliases generate [<id>... | --all] [--old-ref origin/main] [--old <full.md>] [--old-pin <spec>] [--accept-reuse]
 *       Old text (the report's full.md at --old-ref, i.e. what is published) against the new text
 *       (the working tree's reports/<id>/full.md): writes reports/<id>/aliases.yaml and adds every id of
 *       both to reports/<id>/published-ids.txt. Idempotent; run after `pnpm ingest aggregate`
 *       on every re-ingest, then `pnpm prerender`. Both files start from their --old-ref versions, not the
 *       working tree's, so running it against an intermediate re-ingest and again against the final text
 *       records only what --old-ref published plus the final text (with --old, the working tree's files).
 *       The OLD text is rendered with the @rtm/ingest pinned in package.json at --old-ref (fetched once into
 *       node_modules/.cache/rtm-ingest/; --old-pin github:org/repo#ref overrides), the new text with the
 *       installed one, so a section slug an ingest release renamed is recorded as a section alias (hxo4).
 *       Prints REUSED ID for an id that now names a different paragraph (rf4c); `pnpm aliases check` fails
 *       until the ids are fixed at their citers and `--accept-reuse` records that somebody read them.
 *   pnpm aliases seed [<id>... | --all] [--ref origin/main]
 *       Rebuilds both files from the git history of reports/<id>/full.md (every distinct version, oldest
 *       first, folded one step at a time into the working tree's text). For the first run and for backfill.
 *   pnpm aliases seed-sections [<id>... | --all] [--ref origin/main]
 *       Only reports/<id>/published-sections.txt: the live slugs, those of the text at --ref (rendered with its
 *       pin) and every slug already aliased. The backfill for a repo that predates the section record.
 *   pnpm aliases check
 *       Every recorded id is either in the current text, an alias of something that is, or named in
 *       `unmatched` (a loss somebody can read). Every alias lands on a current id. Every current id is
 *       recorded. Every published section slug is a live section, an alias to one, or in `unmatched_sections`.
 *       No pending `reused` id. Fails otherwise. Part of verify.sh; needs `pnpm prerender`.
 *
 * Files, per report, in this repo (not the report repo: aliases are derived from what was published,
 * which only this repo knows; a report repo's own aliases.yaml, as in us-911-commission#9, is not read):
 *   aliases.yaml       {aliases: {old: new}, sections: {old-slug: new-slug}, unmatched: [old]}
 *   published-ids.txt  one id per line, sorted
 *   published-sections.txt  every section slug ever published, one per line, sorted
 * Matching is by text containment; see src/lib/alias-gen.ts.
 */
import "./lib/help.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { extractPassages } from "@rtm/ingest";
import { followAlias } from "../src/lib/aliases";
import * as installed from "@rtm/ingest";
import { acceptReuse, emptyAliases, fold, formatIds, idsOf, parseIds, render, slugsOf, type AliasFile, type Ingest, type Rendered } from "../src/lib/alias-gen";
import { loadIngest, pinOf } from "./lib/old-ingest";
import { assertFresh } from "./prerender-stamp.mjs";

const root = join(import.meta.dirname, "..");
const registry = parse(readFileSync(join(root, "reports/registry.yaml"), "utf8")) as { reports: { id: string; source_path: string }[] };
const [cmd, ...rest] = process.argv.slice(2);

const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const VALUE_FLAGS = new Set(["--old-ref", "--old", "--ref", "--old-pin"]);
const positional = rest.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(rest[i - 1] ?? ""));
const ids = rest.includes("--all") || !positional.length ? registry.reports.map((r) => r.id) : positional;

const aliasesPath = (id: string) => join(root, `reports/${id}/aliases.yaml`);
const recordPath = (id: string) => join(root, `reports/${id}/published-ids.txt`);

function parseAliases(text: string | null): AliasFile {
  if (text === null) return emptyAliases();
  const y = parse(text) ?? {};
  return { aliases: y.aliases ?? {}, sections: y.sections ?? {}, unmatched: y.unmatched ?? [], unmatchedSections: y.unmatched_sections ?? [], reused: y.reused ?? {}, movedOut: y.moved_out ?? {} };
}
const loadAliases = (id: string): AliasFile => parseAliases(existsSync(aliasesPath(id)) ? readFileSync(aliasesPath(id), "utf8") : null);
const sectionsPath = (id: string) => join(root, `reports/${id}/published-sections.txt`);
const loadSections = (id: string) => (existsSync(sectionsPath(id)) ? parseIds(readFileSync(sectionsPath(id), "utf8")) : []);
const loadRecord = (id: string) => (existsSync(recordPath(id)) ? parseIds(readFileSync(recordPath(id), "utf8")) : []);

const HEADER =
  "# Generated by `pnpm aliases generate` (reportsthatmatter-q8c); do not edit by hand.\n" +
  "# aliases: an id that used to be published -> the id that holds its text now. sections: likewise for section slugs.\n" +
  "# unmatched: ids whose text could not be found in the new text; a ?p= to one of these is a plain miss.\n" +
  "# unmatched_sections: published section slugs that have no alias and no page; the old URL is a plain miss.\n" +
  "# reused: an id that now names a different paragraph than it did (movedTo: where the old text went); pending until accepted (hxo4, rf4c).\n" +
  "# moved_out: an id that kept its paragraph but lost the list/quotation it introduced; value is where that content is now (null: nowhere traceable).\n";

function save(id: string, file: AliasFile, record: Iterable<string>, slugs: Iterable<string>) {
  const { unmatchedSections, movedOut, ...rest } = file;
  const out: Record<string, unknown> = { ...rest };
  if (Object.keys(movedOut).length) out.moved_out = movedOut;
  if (unmatchedSections.length) out.unmatched_sections = unmatchedSections;
  if (!Object.keys(file.reused).length) delete out.reused;
  const empty = !Object.keys(file.aliases).length && !Object.keys(file.sections).length && !file.unmatched.length && !unmatchedSections.length && !Object.keys(file.reused).length && !Object.keys(movedOut).length;
  if (empty) {
    if (existsSync(aliasesPath(id))) writeFileSync(aliasesPath(id), HEADER + "aliases: {}\n");
  } else writeFileSync(aliasesPath(id), HEADER + stringify(out, { lineWidth: 0 }));
  writeFileSync(recordPath(id), formatIds(record));
  writeFileSync(sectionsPath(id), formatIds(slugs));
}

/** Where the files we control cite a paragraph id (editorial/<report>.yaml, docs/share-quotes.yaml). */
function citers(id: string, x: string): string[] {
  const re = new RegExp(`(?<![\\w-])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  return [`editorial/${id}.yaml`, "docs/share-quotes.yaml"].filter((f) => existsSync(join(root, f)) && re.test(readFileSync(join(root, f), "utf8")));
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 29 });
const gitShow = (ref: string, path: string): string | null => {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 29, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const summary = (id: string, file: AliasFile, before: number, record: number) => {
  const pending = Object.entries(file.reused).filter(([, r]) => !r.accepted);
  console.log(`  ${id}: ${Object.keys(file.aliases).length} alias(es) (${Object.keys(file.aliases).length - before} new), ${Object.keys(file.sections).length} section alias(es), ${file.unmatched.length} unmatched, ${file.unmatchedSections.length} unmatched section(s), ${record} id(s) recorded`);
  for (const [x, to] of Object.entries(file.movedOut)) {
    const by = citers(id, x);
    if (by.length) console.log(`      \x1b[31mMOVED-OUT ID\x1b[0m ${x}: ${by.join(", ")} cites it, but the list it introduced is ${to ? `now ${to}` : "with no unique new home"}; cite that instead if it is what is meant`);
  }
  for (const [x, r] of pending) console.log(`      \x1b[31mREUSED ID\x1b[0m ${x}: named another paragraph when published; that text is ${r.movedTo ? `now ${r.movedTo}` : "gone"}. Fix what cites ${x}, then --accept-reuse`);
};

/** The renderer for text committed at `ref`: that ref's ingest pin, fetched once; the installed one when the pin is the same. */
const ingestCache = new Map<string, Ingest>();
async function ingestAt(ref: string | null, override?: string): Promise<Ingest> {
  const pkg = ref === null ? null : gitShow(ref, "package.json");
  const spec = override ?? (pkg ? pinOf(pkg) : undefined);
  const now = pinOf(readFileSync(join(root, "package.json"), "utf8"));
  if (spec === now) return installed;
  const key = String(spec);
  if (!ingestCache.has(key)) {
    let ingest: Ingest = installed;
    if (spec) {
      const got = await loadIngest(root, spec, installed);
      // The earliest pins predate the renderer's current exports; those commits are rendered with the installed one.
      if (typeof got.ingest.renderArtifacts === "function" && typeof got.ingest.extractPassages === "function") {
        ingest = got.ingest;
        if (got.fetched) console.log(`  (rendering old text with @rtm/ingest ${got.ref}; the new text with the installed one)`);
      }
    }
    ingestCache.set(key, ingest);
  }
  return ingestCache.get(key)!;
}

async function generate() {
  const ref = flag("--old-ref") ?? "origin/main";
  const oldPath = flag("--old");
  const oldIngest = await ingestAt(ref, flag("--old-pin"));
  for (const id of ids) {
    const entry = registry.reports.find((r) => r.id === id);
    if (!entry) throw new Error(`no such report: ${id}`);
    const next = render(readFileSync(join(root, entry.source_path), "utf8"));
    const oldMd = oldPath ? readFileSync(oldPath, "utf8") : gitShow(ref, entry.source_path);
    // The base is what --old-ref published, not the working tree: a generate run against an intermediate
    // re-ingest would otherwise leave that text's ids (never published) in published-ids.txt for good (s24x).
    const committed = oldPath ? null : gitShow(ref, `reports/${id}/published-ids.txt`);
    const committedSections = oldPath ? null : gitShow(ref, `reports/${id}/published-sections.txt`);
    const prev = oldPath ? loadAliases(id) : parseAliases(gitShow(ref, `reports/${id}/aliases.yaml`));
    const record = new Set([...(committed === null ? loadRecord(id) : parseIds(committed)), ...idsOf(next)]);
    const slugs = new Set([...(committedSections === null ? loadSections(id) : parseIds(committedSections)), ...slugsOf(next)]);
    let file: AliasFile;
    if (oldMd === null) file = fold(prev, next, next);
    else {
      const old = render(oldMd, oldIngest);
      for (const x of idsOf(old)) record.add(x);
      for (const x of slugsOf(old)) slugs.add(x);
      file = fold(prev, old, next);
    }
    if (rest.includes("--accept-reuse")) file = acceptReuse(file);
    save(id, file, record, slugs);
    summary(id, file, Object.keys(prev.aliases).length, record.size);
  }
}

async function seed() {
  const ref = flag("--ref") ?? "origin/main";
  for (const id of ids) {
    const entry = registry.reports.find((r) => r.id === id);
    if (!entry) throw new Error(`no such report: ${id}`);
    const commits = git("log", "--reverse", "--format=%H", ref, "--", entry.source_path).split("\n").filter(Boolean);
    const seen = new Set<string>();
    const versions: Rendered[] = [];
    for (const c of commits) {
      let blob: string;
      try {
        blob = git("rev-parse", `${c}:${entry.source_path}`).trim();
      } catch {
        continue;
      }
      if (seen.has(blob)) continue;
      seen.add(blob);
      // Each historic text is rendered by the ingest pinned in the commit that introduced it.
      versions.push(render(git("show", blob), await ingestAt(c)));
    }
    versions.push(render(readFileSync(join(root, entry.source_path), "utf8")));
    const record = new Set<string>();
    const slugs = new Set<string>();
    let file = emptyAliases();
    for (let i = 0; i < versions.length; i++) {
      for (const x of idsOf(versions[i])) record.add(x);
      for (const x of slugsOf(versions[i])) slugs.add(x);
      if (i > 0) file = fold(file, versions[i - 1], versions[i]);
    }
    save(id, file, record, slugs);
    summary(id, file, 0, record.size);
  }
}

/** Backfill of published-sections.txt only: what is served now, what --ref (default origin/main) served, and every slug already aliased. */
async function seedSections() {
  const ref = flag("--ref") ?? "origin/main";
  const oldIngest = await ingestAt(ref);
  for (const id of ids) {
    const entry = registry.reports.find((r) => r.id === id);
    if (!entry) throw new Error(`no such report: ${id}`);
    const slugs = new Set([...slugsOf(render(readFileSync(join(root, entry.source_path), "utf8"))), ...Object.keys(loadAliases(id).sections), ...loadSections(id)]);
    const oldMd = gitShow(ref, entry.source_path);
    if (oldMd !== null) for (const x of slugsOf(render(oldMd, oldIngest))) slugs.add(x);
    writeFileSync(sectionsPath(id), formatIds(slugs));
    console.log(`  ${id}: ${slugs.size} section slug(s) recorded`);
  }
}

function check() {
  assertFresh("pnpm aliases check");
  let failed = 0;
  for (const id of ids) {
    const dir = join(root, `assets/generated/reports/${id}`);
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    const live = new Set<string>();
    const slugs = new Set<string>(meta.sections.map((s: { slug: string }) => s.slug));
    for (const s of meta.sections) for (const p of extractPassages(readFileSync(join(dir, `fragments/${s.slug}.html`), "utf8"))) live.add(p.paragraphId);
    const file = loadAliases(id);
    const { aliases, sections, unmatched } = file;
    const problems: string[] = [];
    if (!existsSync(recordPath(id))) problems.push("no published-ids.txt (run pnpm aliases seed)");
    const record = new Set(loadRecord(id));
    const missing = [...live].filter((x) => !record.has(x));
    if (missing.length) problems.push(`${missing.length} current id(s) not recorded, e.g. ${missing.slice(0, 3).join(", ")} (run pnpm aliases generate ${id})`);
    const lostIds = [...record].filter((x) => !live.has(x) && !followAlias(aliases, x, (y) => live.has(y)) && !unmatched.includes(x));
    if (lostIds.length) problems.push(`${lostIds.length} published id(s) resolve nowhere and are not in unmatched, e.g. ${lostIds.slice(0, 3).join(", ")}`);
    const dead = Object.entries(aliases).filter(([, to]) => !live.has(to));
    if (dead.length) problems.push(`${dead.length} alias(es) point at an id that is not current, e.g. ${dead[0][0]} -> ${dead[0][1]}`);
    const shadowed = Object.keys(aliases).filter((k) => live.has(k));
    if (shadowed.length) problems.push(`${shadowed.length} alias key(s) are current ids, e.g. ${shadowed[0]}`);
    const deadSections = Object.entries(sections).filter(([, to]) => !slugs.has(to));
    if (deadSections.length) problems.push(`${deadSections.length} section alias(es) point at a missing section, e.g. ${deadSections[0][0]}`);
    if (!existsSync(sectionsPath(id))) problems.push("no published-sections.txt (run pnpm aliases seed)");
    else {
      // (a) a section slug that was published must still be a page or alias to one, or be named in unmatched_sections.
      const gone = loadSections(id).filter((x) => !slugs.has(x) && !followAlias(sections, x, (y) => slugs.has(y)) && !file.unmatchedSections.includes(x));
      if (gone.length) problems.push(`${gone.length} published section slug(s) have no alias and no live page, e.g. ${gone.slice(0, 3).join(", ")} (an old URL would 404; run pnpm aliases generate ${id} from a branch based on what is published)`);
      const unrecorded = [...slugs].filter((x) => !loadSections(id).includes(x));
      if (unrecorded.length) problems.push(`${unrecorded.length} current section slug(s) not recorded, e.g. ${unrecorded.slice(0, 3).join(", ")} (run pnpm aliases generate ${id})`);
    }
    // (b) an id that names a different paragraph than when published: loud until somebody accepts it.
    for (const [x, r] of Object.entries(file.reused)) {
      if (r.accepted) continue;
      problems.push(`id ${x} was reused: it named another paragraph when published, whose text is ${r.movedTo ? `now ${r.movedTo}` : "gone"}${citers(id, x).length ? `; ${citers(id, x).join(", ")} cites ${x} (check it means the NEW paragraph)` : ""}. Fix what cites it (editorial, posts queue, highlights), then pnpm aliases generate ${id} --accept-reuse`);
    }
    for (const [x, to] of Object.entries(file.movedOut)) {
      const by = citers(id, x);
      // A warning, not a failure: `pnpm editorial` already fails on a quote that is no longer in its paragraph, so what
      // is left here is a bare cite of the label paragraph, which may now mean less than the editor intended.
      if (by.length) console.warn(`      \x1b[33mwarning\x1b[0m ${id}: ${by.join(", ")} cites ${x}, which lost the list it introduced (${to ? `now ${to}` : "not traceable"}); cite that instead if that is what is meant`);
    }
    const served = meta.paragraphAliases ?? {};
    const unserved = Object.keys(aliases).filter((k) => served[k] !== aliases[k]);
    if (unserved.length) problems.push(`${unserved.length} alias(es) not in the pre-rendered meta.json (run pnpm prerender)`);
    if (problems.length) {
      failed++;
      console.error(`  \x1b[31m✗\x1b[0m ${id}`);
      for (const p of problems) console.error(`      ${p}`);
    } else console.log(`  \x1b[32m✓\x1b[0m ${id}: ${record.size} recorded id(s), ${Object.keys(aliases).length} alias(es), ${unmatched.length} unmatched`);
  }
  process.exit(failed ? 1 : 0);
}

if (cmd === "generate") await generate();
else if (cmd === "seed") await seed();
else if (cmd === "seed-sections") await seedSections();
else if (cmd === "check") check();
else {
  console.error("usage: pnpm aliases generate|seed|seed-sections [<id>... | --all] | check");
  process.exit(2);
}
