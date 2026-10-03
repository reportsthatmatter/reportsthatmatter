import { describe, expect, it } from "vitest";
import { EDITOR_ACTOR, planSeed, planSql } from "../src/lib/seed-highlights";
import { isEditorActor } from "../src/lib/marks";

const h = (paragraph: string, exact = "the words", report = "r") => ({
  report, section: "sec", paragraph, exact, prefix: "", suffix: "", page: 3,
});

describe("planSeed (decision 0013, wb0)", () => {
  it("writes nothing when D1 already holds exactly the wanted highlights", () => {
    const plan = planSeed([{ ...h("a"), id: 1 }, { ...h("b"), id: 2 }], [h("a"), h("b")], ["r"]);
    expect(plan).toMatchObject({ unchanged: 2, writes: 0 });
    expect(planSql(plan, 0)).toBe("");
  });

  it("deletes a removed highlight and inserts a new one, and nothing else", () => {
    const plan = planSeed([{ ...h("a"), id: 1 }, { ...h("gone"), id: 2 }], [h("a"), h("new")], ["r"]);
    expect(plan.deletes.map((row) => row.id)).toEqual([2]);
    expect(plan.inserts.map((row) => row.paragraph)).toEqual(["new"]);
    expect(plan.writes).toBe(2);
  });

  it("replaces a highlight whose id or page moved", () => {
    const plan = planSeed([{ ...h("a"), id: 1 }], [{ ...h("a"), page: 4 }], ["r"]);
    expect(plan.writes).toBe(2);
  });

  it("deletes duplicate stored rows down to one", () => {
    const plan = planSeed([{ ...h("a"), id: 1 }, { ...h("a"), id: 2 }], [h("a")], ["r"]);
    expect(plan.deletes.map((row) => row.id)).toEqual([2]);
    expect(plan.inserts).toEqual([]);
  });

  it("leaves reports outside its scope alone", () => {
    const plan = planSeed([{ ...h("a", "x", "other"), id: 1 }], [h("b", "y", "other")], ["r"]);
    expect(plan.writes).toBe(0);
  });

  it("writes SQL that deletes only the editor's rows, by id, and inserts as the editor", () => {
    const plan = planSeed([{ ...h("gone"), id: 7 }], [h("new", "it's")], ["r"]);
    const sql = planSql(plan, 123);
    expect(sql).toContain(`DELETE FROM marks WHERE actor = '${EDITOR_ACTOR}' AND id IN (7);`);
    expect(sql).toContain(`'it''s'`);
    expect(sql).toContain(`'save', '${EDITOR_ACTOR}', 123);`);
  });

  it("uses an actor no reader can have", () => {
    expect(isEditorActor(EDITOR_ACTOR)).toBe(true);
    expect(isEditorActor("a".repeat(64))).toBe(false);
  });
});
