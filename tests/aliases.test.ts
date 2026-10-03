import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "../src/index";
import { followAlias, resolveParagraph, resolveSection } from "../src/lib/aliases";
import { computeMoves, emptyAliases, fold, formatIds, parseIds, render } from "../src/lib/alias-gen";

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
