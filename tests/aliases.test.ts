import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../src/index";
import { followAlias, resolveParagraph, resolveSection } from "../src/lib/aliases";
import { renderArtifacts, extractPassages } from "@rtm/ingest";
import { acceptReuse, computeMoves, detectReuse, emptyAliases, fold, formatIds, parseIds, render, type Rendered } from "../src/lib/alias-gen";

const doc = (sections: Record<string, string[]>) =>
  Object.entries(sections)
    .map(([title, paras]) => `## ${title}\n\n${paras.join("\n\n")}\n`)
    .join("\n");

const A = "The committee found that the launch decision was taken against the advice of the engineers responsible for the booster joints.";
const B = "Engineers at the contractor warned in writing the night before that cold weather would compromise the seals on the field joints.";
const C = "Management reversed the contractor recommendation after a short private caucus and asked the engineers to prove it was unsafe.";

describe("alias generation", () => {
  const before = render(doc({ "The decision": [A, B, C] }));

  it("finds where a merged paragraph went by text containment", () => {
    const after = render(doc({ "The decision": [A, `${B} ${C}`] }));
    const { moved, lost } = computeMoves(before, after);
    const idOf = (text: string) => before.passages.find((p) => p.text.startsWith(text.slice(0, 20)))!.id;
    const merged = after.passages.find((p) => p.text.startsWith("Engineers at the contractor"))!.id;
    expect(moved[idOf(C)]).toBe(merged);
    expect(lost).toEqual([]);
  });

  it("reports an id whose text is gone as lost, and unmatched in the file", () => {
    const after = render(doc({ "The decision": [A, B] }));
    const file = fold(emptyAliases(), before, after);
    expect(file.unmatched).toHaveLength(1);
    expect(file.aliases).toEqual({});
  });

  it("maps a renamed section to the section its paragraphs went to", () => {
    const after = render(doc({ "What was decided": [A, B, C] }));
    const file = fold(emptyAliases(), before, after);
    expect(file.sections).toEqual({ "the-decision": "what-was-decided" });
  });

  it("collapses chains across successive moves and drops ids that are live again", () => {
    const middle = render(doc({ "The decision": [A, `${B} ${C}`] }));
    const last = render(doc({ "The decision": [`${A} ${B} ${C}`] }));
    const one = fold(emptyAliases(), before, middle);
    const two = fold(one, middle, last);
    const final = last.passages[0].id;
    for (const target of Object.values(two.aliases)) expect(target).toBe(final);
    expect(Object.keys(two.aliases).length).toBeGreaterThanOrEqual(2);
    // the earlier middle id now aliases the final one too
    expect(Object.keys(two.aliases)).toContain(middle.passages[1].id);
    // and if the original text comes back, the alias for it goes away
    const back = fold(two, last, before);
    expect(back.aliases).toEqual({});
  });

  it("round-trips the id record", () => {
    expect(parseIds(formatIds(["b", "a", "b"]))).toEqual(["a", "b"]);
  });
});

describe("alias resolution", () => {
  const meta = {
    paragraphToSection: { new: "sec-b", other: "sec-a" } as Record<string, string>,
    paragraphAliases: { old: "new", older: "old", loop1: "loop2", loop2: "loop1" },
    sectionAliases: { "gone-section": "sec-b" },
    sections: [{ slug: "sec-a" }, { slug: "sec-b" }],
  };

  it("keeps a current id as it is, follows a chain, and gives up on a cycle or an unknown id", () => {
    expect(resolveParagraph(meta, "other")).toEqual({ id: "other", slug: "sec-a" });
    expect(resolveParagraph(meta, "older")).toEqual({ id: "new", slug: "sec-b" });
    expect(resolveParagraph(meta, "loop1")).toBeNull();
    expect(resolveParagraph(meta, "nope")).toBeNull();
    expect(resolveParagraph({ paragraphToSection: {} }, "x")).toBeNull();
    expect(followAlias({}, "constructor", () => false)).toBeNull();
  });

  it("resolves a renamed section only when the slug is gone", () => {
    expect(resolveSection(meta, "gone-section")).toBe("sec-b");
    expect(resolveSection(meta, "sec-a")).toBeNull();
    expect(resolveSection(meta, "unknown")).toBeNull();
  });
});

describe("alias routes", () => {
  // Backfilled from git history (pnpm aliases seed): the 38s.10 join merged this Jack Smith paragraph.
  const OLD = "trump-has-something-else-left";
  const NEW = "just-before-2-24-p";

  it("redirects a stale ?p= on the report root to the new id and section, keeping ?h=", async () => {
    const res = await app.request(`http://localhost/reports/jack-smith-vol1?p=${OLD}&h=abc`);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/reports\/jack-smith-vol1\/[^/?]+\?p=just-before-2-24-p&h=abc#just-before-2-24-p$/);
  });

  it("redirects the section-qualified form, from a renamed section", async () => {
    const meta = JSON.parse(readFileSync(join(import.meta.dirname, "../assets/generated/reports/jack-smith-vol1/meta.json"), "utf8"));
    const [oldSlug, newSlug] = Object.entries(meta.sectionAliases as Record<string, string>)[0];
    const renamed = await app.request(`http://localhost/reports/jack-smith-vol1/${oldSlug}`);
    expect(renamed.status).toBe(302);
    expect(renamed.headers.get("location")).toContain(`/reports/jack-smith-vol1/${newSlug}`);

    const slug = meta.paragraphToSection[NEW];
    const res = await app.request(`http://localhost/reports/jack-smith-vol1/${oldSlug}?p=${OLD}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`/reports/jack-smith-vol1/${slug}?p=${NEW}#${NEW}`);
  });

  it("redirects a stale ?p= on /full to the new id", async () => {
    const res = await app.request(`http://localhost/reports/jack-smith-vol1/full?p=${OLD}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`/reports/jack-smith-vol1/full?p=${NEW}#${NEW}`);
  });

  it("leaves a current id and an unknown id alone", async () => {
    const live = await app.request(`http://localhost/reports/jack-smith-vol1/full?p=${NEW}`);
    expect(live.status).toBe(200);
    const unknown = await app.request("http://localhost/reports/jack-smith-vol1?p=no-such-passage");
    expect(unknown.status).toBe(200);
  });
});

describe("section records and reuse (hxo4, rf4c)", () => {
  const A1 = "The committee found that the launch decision was taken against the advice of the engineers responsible for the booster joints.";
  const items = ["The review was conducted in accordance with the established procedure for every flight of the shuttle fleet.", "The decision to launch was based on a faulty engineering analysis of the seal behaviour of the field joint."];

  it("renders the old text with the ingest it is given, so an ingest change that renames a slug is seen", () => {
    const md = doc({ "The decision": [A1] });
    const oldIngest = {
      renderArtifacts: (m: string) => {
        const r = renderArtifacts(m);
        return { ...r, meta: { ...r.meta, sections: r.meta.sections.map((s: { slug: string }) => ({ ...s, slug: "11-" + s.slug })) }, fragments: Object.fromEntries(Object.entries(r.fragments).map(([k, v]) => ["11-" + k, v])) };
      },
      extractPassages,
    } as never;
    const old = render(md, oldIngest);
    const next = render(md);
    expect(old.sections[0].slug).toBe("11-the-decision");
    expect(fold(emptyAliases(), old, next).sections).toEqual({ "11-the-decision": "the-decision" });
  });

  it("lists a section that vanished with no traceable paragraph as unmatched, not silently", () => {
    // sections under a few hundred words are folded into their neighbour (the sliver rule), so make them long enough to stand
    const long = (tag: string) => Array.from({ length: 12 }, (_, i) => Array.from({ length: 60 }, (_, j) => `${tag}${i}x${j}`).join(" ") + ".");
    const before = render(doc({ "Kept": long("k"), "Gone": long("g") }));
    const after = render(doc({ "Kept": long("k") }));
    const file = fold(emptyAliases(), before, after);
    expect(file.sections).toEqual({});
    expect(file.unmatchedSections).toEqual(["gone"]);
    // and it clears when the section comes back
    expect(fold(file, after, before).unmatchedSections).toEqual([]);
  });

  it("flags an id that now names a different paragraph, and where the old text went", () => {
    const before = render(doc({ "S": [A1, B, C] }));
    const idB = before.passages[1].id;
    // B's id is taken by a new paragraph (text unrelated), and B itself moved to the end
    const after = render(doc({ "S": [A1, C, B] }));
    const forged: Rendered = { ...after, passages: after.passages.map((p, i) => (i === 1 ? { ...p, id: idB } : i === 2 ? { ...p, id: "b-moved" } : p)) };
    const { reused } = detectReuse(before, forged);
    expect(Object.keys(reused)).toEqual([idB]);
    expect(reused[idB].movedTo).toBe("b-moved");
    expect(fold(emptyAliases(), before, forged).reused[idB]).toEqual({ movedTo: "b-moved" });
  });

  it("does not flag an edited or joined paragraph that keeps its id", () => {
    const before = render(doc({ "S": [A1, B] }));
    const edited = render(doc({ "S": [A1.replace("found", "concluded"), B] }));
    expect(detectReuse(before, edited).reused).toEqual({});
    const joined = render(doc({ "S": [`${A1} ${B}`] }));
    expect(detectReuse(before, joined).reused).toEqual({});
  });

  it("notes an id that kept its paragraph but lost the list it introduced (the Challenger findings-3 shape)", () => {
    const before = render(`## S\n\nFindings\n\n1. ${items[0]}\n\n2. ${items[1]}\n\nAfter the list there is a closing paragraph that nobody cites.\n`.replace(/\n\n(\d)\. /g, "\n\n$1. "));
    expect(before.passages[0].block ?? "").toContain("faulty engineering analysis");
    const after = render(`## S\n\nFindings\n\n1\\. ${items[0]}\n\n2\\. ${items[1]}\n\nAfter the list there is a closing paragraph that nobody cites.\n`);
    const { reused, movedOut } = detectReuse(before, after);
    expect(reused).toEqual({});
    expect(Object.keys(movedOut)).toContain(before.passages[0].id);
  });

  it("acceptReuse marks pending entries accepted and keeps them through later folds", () => {
    const f = acceptReuse({ ...emptyAliases(), reused: { x: { movedTo: null } } });
    expect(f.reused.x.accepted).toBe(true);
    const doc1 = render(doc({ "S": [A1] }));
    const doc2 = { ...doc1, passages: [{ ...doc1.passages[0], id: "x" }] };
    expect(fold(f, doc2, doc2).reused.x.accepted).toBe(true);
  });
});
