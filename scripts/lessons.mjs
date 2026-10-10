/* The lessons log: one file per entry in docs/design/lessons/.
 *
 *   pnpm lessons new <slug> --theme "<theme>"   # create docs/design/lessons/<today>-<slug>.md to fill in
 *   pnpm lessons [<theme words>]                # print the entries written since the split, by theme, newest first
 *   pnpm lessons themes                         # the themes in use (the archive's headings, then the files')
 *   pnpm lessons check                          # exit 1 on a misnamed file, a missing theme, a wrapped or malformed entry
 *
 * docs/design/lessons.md is the frozen archive of the 406 entries written before the split; read it for history.
 * `tests/lessons.test.ts` runs `check` and fails if the archive changes (an append to it is a rebase mistake:
 * move the line into its own file here). Format and why: docs/design/lessons/README.md.
 */
import "./lib/help.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkLessons, compiled, lessonsDir, template, themes } from "./lib/lessons.ts";

const root = join(import.meta.dirname, "..");
const [command, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i < 0 ? undefined : rest[i + 1];
};

if (command === "new") {
  const slug = rest[0];
  const theme = flag("theme");
  if (!slug || slug.startsWith("--") || !theme) {
    console.error('Usage: pnpm lessons new <slug> --theme "<theme>"   (themes: pnpm lessons themes)');
    process.exit(2);
  }
  const date = flag("date") ?? new Date().toISOString().slice(0, 10);
  const file = join(lessonsDir(root), `${date}-${slug}.md`);
  if (existsSync(file)) {
    console.error(`${file} exists: pick another slug`);
    process.exit(1);
  }
  writeFileSync(file, template(theme, date));
  console.log(`Created ${file}: replace the placeholders, keep it to one line.`);
} else if (command === "themes") {
  console.log(themes(root).join("\n"));
} else if (command === "check") {
  const problems = checkLessons(root);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) process.exit(1);
  console.log("lessons: ok");
} else if (command === undefined || !["new", "themes", "check"].includes(command)) {
  console.log(compiled(root, [command, ...rest].filter(Boolean).join(" ") || undefined));
}
