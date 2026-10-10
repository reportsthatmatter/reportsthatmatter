// Lessons are one file per entry (reportsthatmatter-r4q2) so concurrent PRs cannot conflict on a shared file.
// The archive keeps the entries written before the split; this fails if it is appended to again.
import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLessons, compiled, readArchive, readLessons, template, themes } from "../scripts/lib/lessons";

const root = join(import.meta.dirname, "..");
const ARCHIVE_ENTRIES = 406;

const scratch = (files: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), "rtm-lessons-"));
  mkdirSync(join(d, "docs/design/lessons"), { recursive: true });
  cpSync(join(root, "docs/design/lessons.md"), join(d, "docs/design/lessons.md"));
  for (const [f, text] of Object.entries(files)) writeFileSync(join(d, "docs/design/lessons", f), text);
  return d;
};
const good = (theme = "Measuring") => `---\ntheme: ${theme}\n---\n- **A rule.** (2026-10-10, abcd, Opus) It happened. Do this. [status: proposed]\n`;

describe("docs/design/lessons/", () => {
  it("every lesson file is named, themed and one line", () => {
    expect(checkLessons(root)).toEqual([]);
  });

  it("the archive still holds exactly the entries written before the split: append new lessons as files", () => {
    const { entries, themes } = readArchive(root);
    expect(entries).toHaveLength(ARCHIVE_ENTRIES);
    expect(entries.every((e) => e.startsWith("- "))).toBe(true);
    expect(themes.length).toBeGreaterThan(40);
  });

  it("flags a misnamed file, a missing theme, a wrapped entry and unfilled placeholders", () => {
    const d = scratch({
      "notes.md": good(),
      "2026-10-10-no-theme.md": "- **A rule.** (2026-10-10, abcd, Opus) It happened. Do this.\n",
      "2026-10-10-wrapped.md": "---\ntheme: X\n---\n- **A rule.** (2026-10-10, abcd, Opus) It\nhappened.\n",
      "2026-10-10-template.md": template("X", "2026-10-10"),
      "2026-10-10-ok.md": good(),
    });
    const problems = checkLessons(d).join("\n");
    expect(problems).toMatch(/notes\.md: name it/);
    expect(problems).toMatch(/no-theme\.md: frontmatter needs "theme/);
    expect(problems).toMatch(/wrapped\.md: one entry per file/);
    expect(problems).toMatch(/template\.md: replace the placeholders/);
    expect(problems).not.toMatch(/ok\.md/);
  });

  it("two lessons written the same day with different slugs are two files", () => {
    const d = scratch({ "2026-10-10-a.md": good(), "2026-10-10-b.md": good("Release and process") });
    expect(readLessons(d).map((l) => l.file)).toEqual(["2026-10-10-a.md", "2026-10-10-b.md"]);
    expect(themes(d)).toContain("Release and process");
    expect(compiled(d, "release")).toMatch(/^## Release and process\n\n- \*\*A rule/);
  });
});
