import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeAnchor, selectorFor } from "../assets/anchor.js";
import { checkEditorial, checkLink, checkMark, fails, regressions, type ReportText } from "../src/lib/marks-check";
import { exportMarks, loadMarks, readOnly } from "../scripts/lib/marks-export";
import type { Runner } from "../scripts/lib/d1";

const para = (id: string, text: string) => `<p id="${id}">${text}</p>\n`;

function text(paragraphs: Record<string, string>, extra: Partial<ReportText> = {}): ReportText {
  return {
    html: Object.entries(paragraphs).map(([id, t]) => para(id, t)).join(""),
    paragraphToSection: Object.fromEntries(Object.keys(paragraphs).map((id) => [id, "s"])),
    sections: [{ slug: "s" }],
    ...extra,
  };
}

const OLD = "He said it was \"fine\" and left the room before anyone could answer him.";
const mark = (exact: string, paragraph = "a", readers = 1) => ({ report: "r", paragraph, exact, prefix: "", suffix: "", readers });

describe("checkMark", () => {
  it("anchors where it was made", () => {
    const v = checkMark(text({ a: OLD }), { ...mark("left the room"), prefix: "fine\" and ", suffix: " before" });
    expect(v.status).toBe("ok");
    expect(v.fail).toBe(false);
  });

  it("folds typography: a straight-quote mark still anchors on curly-quoted text (qgf7)", () => {
    const v = checkMark(text({ a: "He said it was “fine” and left." }), mark("was \"fine\" and"));
    expect(v.status).toBe("ok");
  });

  it("reports a mark whose words are gone from a paragraph that is still there", () => {
    const v = checkMark(text({ a: "Something else entirely." }), mark("left the room"));
    expect(v.status).toBe("text-gone");
    expect(v.fail).toBe(true);
  });

  it("reports context that moved but the words did not as weaker, not failing", () => {
    const v = checkMark(text({ a: OLD }), { ...mark("left the room"), prefix: "and then he ", suffix: " quickly" });
    expect(v.status).toBe("weaker");
    expect(v.fail).toBe(false);
  });

  it("fails a mark that only anchors through an alias, because the page looks marks up by id", () => {
    const t = text({ b: OLD }, { paragraphAliases: { a: "b" } });
    const v = checkMark(t, mark("left the room"));
    expect(v.status).toBe("aliased");
    expect(v.now).toBe("b");
    expect(v.fail).toBe(true);
    expect(v.detail).toContain("re-pointed");
  });

  it("names the paragraph now holding words whose paragraph was split", () => {
    const v = checkMark(text({ a: "He said it was fine.", c: "He left the room before anyone answered." }), mark("left the room"));
    expect(v.status).toBe("elsewhere");
    expect(v.now).toBe("c");
    expect(v.fail).toBe(true);
  });

  it("reports a vanished paragraph with no alias and no words anywhere", () => {
    const v = checkMark(text({ z: "Nothing relevant." }), mark("left the room"));
    expect(v.status).toBe("paragraph-gone");
  });

  it("resolves a long passage named by its ends", () => {
    const long = `Start of a long passage ${"filler ".repeat(60)}and the very end.`;
    const selector = selectorFor(long, 0, long.length);
    const anchor = encodeAnchor(selector)!;
    const [prefix, exact, suffix] = anchor.split("|").map(decodeURIComponent);
    const v = checkMark(text({ a: long }), { report: "r", paragraph: "a", exact, prefix, suffix, readers: 2 });
    expect(v.status).toBe("ok");
  });

  it("ignores sidenotes and permalinks the way the page does", () => {
    const t = text({});
    t.html = `<p id="a">He left the room<span class="sidenote">12 Note text.</span> early.<a class="permalink">¶</a></p>`;
    t.paragraphToSection = { a: "s" };
    expect(checkMark(t, mark("left the room early")).status).toBe("ok");
  });
});

describe("checkLink", () => {
  const link = (p: string, exact?: string) =>
    `https://reportsthatmatter.org/reports/r?p=${p}` + (exact ? `&h=${encodeAnchor({ prefix: "", exact, suffix: "" })}` : "") + "&src=bsky";

  it("passes a link whose words are in its paragraph", () => {
    expect(checkLink(text({ a: OLD }), "r", "q1", link("a", "left the room"))!.fail).toBe(false);
  });

  it("lets a link survive an id move: the Worker redirects, the page finds the words", () => {
    const v = checkLink(text({ b: OLD }, { paragraphAliases: { a: "b" } }), "r", "q1", link("a", "left the room"))!;
    expect(v.status).toBe("aliased");
    expect(v.fail).toBe(false);
  });

  it("lets a link survive words that moved paragraph, but says so", () => {
    const v = checkLink(text({ a: "gone", c: OLD }), "r", "q1", link("a", "left the room"))!;
    expect(v.status).toBe("elsewhere");
    expect(v.fail).toBe(false);
  });

  it("fails a link whose words are gone", () => {
    const v = checkLink(text({ a: "gone" }), "r", "q1", link("a", "left the room"))!;
    expect(v.fail).toBe(true);
  });

  it("checks only the paragraph when there is no h=", () => {
    expect(checkLink(text({ a: OLD }), "r", "q1", link("a"))!.status).toBe("ok");
    expect(checkLink(text({ a: OLD }), "r", "q1", link("zzz"))!.status).toBe("paragraph-gone");
  });

  it("returns null for a link that names no paragraph", () => {
    expect(checkLink(text({ a: OLD }), "r", "q1", "https://reportsthatmatter.org/reports/r")).toBeNull();
  });
});

describe("checkEditorial", () => {
  const source = (over: object) => ({ report: "r", status: "approved", why_it_matters: "x", findings: [], ...over }) as never;

  it("passes a quotation, a citation and a reading-guide section that are still there", () => {
    const v = checkEditorial(
      text({ a: OLD }),
      source({
        findings: [{ text: "f", cites: ["a"], excerpt: { paragraph: "a", quote: "left the room" } }],
        reading_guide: [{ section: "s", why: "w", excerpt: { paragraph: "a", quote: "before anyone" } }],
        highlights: [{ paragraph: "a", quote: "said it was \"fine\"" }],
      })
    );
    expect(v).toHaveLength(4);
    expect(v.every((x) => !x.fail)).toBe(true);
  });

  it("fails each kind of break and says where the editorial file is wrong", () => {
    const v = checkEditorial(
      text({ b: OLD }),
      source({
        findings: [{ text: "f", cites: ["a", "nope"], excerpt: { paragraph: "a", quote: "left the room" } }],
        reading_guide: [{ section: "old-slug", why: "w" }],
      })
    );
    const failed = v.filter((x) => x.fail);

    expect(failed).toHaveLength(4);
    expect(failed[0].origin).toContain("editorial/r.yaml findings[0].cites[0]");
  });

  it("does not fail a quote that folds to the same words", () => {
    const v = checkEditorial(text({ a: "It’s fine — really." }), source({ highlights: [{ paragraph: "a", quote: "It's fine - really." }] }));
    expect(v[0].fail).toBe(false);
  });
});

describe("regressions", () => {
  it("separates what the candidate broke from what was already broken", () => {
    const base = text({ a: OLD, b: "Other words here." });
    const cand = text({ a: "changed", b: "Other words here." });
    const marks = [mark("left the room", "a"), mark("words here", "b"), mark("never there", "b")];
    const before = marks.map((m) => checkMark(base, m));
    const after = marks.map((m) => checkMark(cand, m));
    const reg = regressions(before, after);
    expect(reg.map((v) => v.paragraph)).toEqual(["a"]);
    expect(after.filter((v) => v.fail)).toHaveLength(2);
  });
});

it("fails() depends on what the kind needs", () => {
  expect(fails("mark", "aliased")).toBe(true);
  expect(fails("link", "aliased")).toBe(false);
  expect(fails("editorial", "elsewhere")).toBe(true);
  expect(fails("link", "text-gone")).toBe(true);
  expect(fails("mark", "weaker")).toBe(false);
});

describe("reading D1", () => {
  const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ report: "r", section: "s", paragraph: `p${from + i}`, exact: "x", prefix: null, suffix: "", readers: 2 }));

  it("refuses anything that is not one SELECT", () => {
    const run: Runner = () => [{ results: [], meta: {} }];
    const safe = readOnly(run);
    expect(() => safe("--remote", { command: "DELETE FROM marks" })).toThrow(/read-only/);
    expect(() => safe("--remote", { command: "SELECT 1; DROP TABLE marks" })).toThrow(/read-only/);
    expect(() => safe("--remote", { command: "INSERT INTO marks VALUES (1)" })).toThrow(/read-only/);
    expect(() => safe("--remote", { file: "x.sql" })).toThrow(/read-only/);
    expect(safe("--remote", { command: "  select count(*) from marks" })).toHaveLength(1);
  });

  it("pages through the export and sums the rows read, never sending a write", () => {
    const sent: string[] = [];
    const run: Runner = (_t, sql) => {
      const command = (sql as { command: string }).command;
      sent.push(command);
      const offset = Number(command.match(/OFFSET (\d+)/)![1]);
      return [{ results: offset === 0 ? rows(3) : offset === 3 ? rows(1, 3) : [], meta: { rows_read: 10 } }];
    };
    const out = exportMarks(run, "--remote", 3);
    expect(out.marks).toHaveLength(4);
    expect(out.marks[0].prefix).toBe("");
    expect(out.rowsRead).toBe(20);
    expect(sent.every((s) => /^SELECT /.test(s))).toBe(true);
    expect(sent.join()).not.toMatch(/actor,|\bactor\b(?! *\))/); // actor hashes are counted, never exported
  });

  it("reads D1 once, then serves the cache, unless refreshed or for another target", () => {
    const dir = mkdtempSync(join(tmpdir(), "marks-cache-"));
    const cachePath = join(dir, "sub/marks.json");
    let calls = 0;
    const run: Runner = () => (calls++, [{ results: rows(2), meta: { rows_read: 2 } }]);
    expect(loadMarks({ cachePath, target: "--remote", refresh: false, run }).fromCache).toBe(false);
    expect(existsSync(cachePath)).toBe(true);
    expect(loadMarks({ cachePath, target: "--remote", refresh: false, run }).fromCache).toBe(true);
    expect(calls).toBe(1);
    expect(loadMarks({ cachePath, target: "--local", refresh: false, run }).fromCache).toBe(false);
    expect(loadMarks({ cachePath, target: "--local", refresh: true, run }).fromCache).toBe(false);
    expect(calls).toBe(3);
  });
});

describe("pnpm marks check (CLI)", () => {
  const root = join(import.meta.dirname, "..");
  const dir = mkdtempSync(join(tmpdir(), "marks-cli-"));

  function build(name: string, paragraphs: Record<string, string>) {
    const base = join(dir, name, "reports/uk-saville-inquiry");
    mkdirSync(base, { recursive: true });
    const t = text(paragraphs);
    writeFileSync(join(base, "full-body.html"), t.html);
    writeFileSync(join(base, "meta.json"), JSON.stringify({ paragraphToSection: t.paragraphToSection, sections: t.sections }));
    return join(dir, name);
  }
  const main = build("main", { a: OLD, b: "Other words here." });
  const next = build("next", { a: "changed", b: "Other words here." });
  mkdirSync(join(dir, "ed"));
  writeFileSync(join(dir, "queue.yaml"), "items: []\n");
  const marksFile = join(dir, "marks.json");
  writeFileSync(
    marksFile,
    JSON.stringify({ fetchedAt: new Date().toISOString(), target: "--remote", rowsRead: 0, marks: [mark("left the room", "a"), mark("words here", "b")].map((m) => ({ ...m, report: "uk-saville-inquiry" })) })
  );

  const run = (...args: string[]) => {
    try {
      const out = execFileSync("pnpm", ["-s", "marks", "check", "uk-saville-inquiry", "--marks-file", marksFile, "--queue", join(dir, "queue.yaml"), "--editorial-dir", join(dir, "ed"), ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: err.stdout + err.stderr };
    }
  };

  it("passes when everything anchors", () => {
    const r = run("--candidate", main);
    expect(r.code).toBe(0);
    expect(r.out).toContain("OK: 2 reference(s) replayed");
  });

  it("exits 1 and names the mark that stops anchoring", () => {
    const r = run("--candidate", next);
    expect(r.code).toBe(1);
    expect(r.out).toContain("STOP ANCHORING: 1");
    expect(r.out).toContain("left the room");
  });

  it("with a baseline, counts only regressions", () => {
    const same = run("--baseline", main, "--candidate", main);
    expect(same.code).toBe(0);
    const worse = run("--baseline", main, "--candidate", next);
    expect(worse.code).toBe(1);
    expect(worse.out).toContain("REGRESSIONS");
    const alreadyBroken = run("--baseline", next, "--candidate", next);
    expect(alreadyBroken.code).toBe(0);
    expect(alreadyBroken.out).toContain("already broken on the baseline");
  });

  it("is a usage error without a report or --all, and when the candidate has no text", () => {
    expect(run("--candidate", join(dir, "nowhere")).code).toBe(2);
    const noArgs = execFileSync("sh", ["-c", `pnpm -s marks check; echo "exit=$?"`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(noArgs).toContain("exit=2");
  });
});
