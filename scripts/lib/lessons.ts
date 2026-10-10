/**
 * Lessons: one file per entry in docs/design/lessons/, plus the frozen archive docs/design/lessons.md.
 *
 * Every agent used to append to the end of one file, so every concurrent PR conflicted there at every
 * integration (reportsthatmatter-r4q2). An entry is now its own file, `<YYYY-MM-DD>-<slug>.md`: a PR that adds
 * one touches no line another PR touches. The archive keeps the 406 entries written before the change.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Lesson {
  file: string;
  date: string;
  theme: string;
  /** The entry line: `- **<lesson>** (YYYY-MM-DD, <bead or doc>, <who>) ...`. */
  entry: string;
}

const NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9][a-z0-9-]*\.md$/;
const ENTRY = /^- \*\*.+\*\* \(\d{4}-\d{2}-\d{2}, .+\) .+/;

export const lessonsDir = (root: string) => join(root, "docs/design/lessons");
export const archiveFile = (root: string) => join(root, "docs/design/lessons.md");

/** Split a lesson file into its frontmatter `theme` and the rest. */
function parse(text: string): { theme: string; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return { theme: m?.[1].match(/^theme: (.+)$/m)?.[1].trim() ?? "", body: (m ? m[2] : text).trim() };
}

/** Every lesson file (not the README), oldest first. */
export function readLessons(root: string): Lesson[] {
  const dir = lessonsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((file) => {
      const { theme, body } = parse(readFileSync(join(dir, file), "utf8"));
      return { file, date: file.slice(0, 10), theme, entry: body };
    });
}

/** What is wrong with the lesson files; empty when sound. */
export function checkLessons(root: string): string[] {
  const dir = lessonsDir(root);
  if (!existsSync(dir)) return [`${dir} is missing`];
  const problems: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f !== "README.md")) {
    if (!NAME.test(f)) problems.push(`${f}: name it <YYYY-MM-DD>-<slug>.md (lowercase, digits, hyphens)`);
  }
  for (const l of readLessons(root)) {
    if (!l.theme) problems.push(`${l.file}: frontmatter needs "theme: <theme>" (\`pnpm lessons themes\` lists the existing ones)`);
    if (l.entry.split("\n").length !== 1) problems.push(`${l.file}: one entry per file, on one line (never hard-wrapped)`);
    else if (/<(the lesson|bead or doc|who|evidence)/.test(l.entry)) problems.push(`${l.file}: replace the placeholders from the template`);
    else if (!ENTRY.test(l.entry)) problems.push(`${l.file}: the entry must read "- **<lesson>** (YYYY-MM-DD, <bead or doc>, <who>) <evidence>. <what changed or is proposed>. [status: ...]"`);
  }
  return problems;
}

/** The archive's entries (bullet lines) and theme headings. */
export function readArchive(root: string): { entries: string[]; themes: string[] } {
  const lines = readFileSync(archiveFile(root), "utf8").split("\n");
  return {
    entries: lines.filter((l) => l.startsWith("- ")),
    themes: lines.filter((l) => l.startsWith("## ")).map((l) => l.slice(3)),
  };
}

/** Every theme in use: the archive's headings, then the lesson files'. */
export function themes(root: string): string[] {
  return [...new Set([...readArchive(root).themes, ...readLessons(root).map((l) => l.theme)])];
}

/** The new lessons grouped by theme, as markdown (what `pnpm lessons` prints). */
export function compiled(root: string, only?: string): string {
  const out: string[] = [];
  const all = readLessons(root).filter((l) => !only || l.theme.toLowerCase().includes(only.toLowerCase()));
  for (const theme of [...new Set(all.map((l) => l.theme))]) {
    out.push(`## ${theme}`, "");
    for (const l of all.filter((l) => l.theme === theme).reverse()) out.push(l.entry);
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/** The text of a new lesson file. */
export const template = (theme: string, date: string) =>
  `---\ntheme: ${theme}\n---\n- **<the lesson, as a rule someone can follow>** (${date}, <bead or doc>, <who>) <evidence in a sentence>. <What changed, or the proposal>. [status: done in <PR> | proposed | open question]\n`;
