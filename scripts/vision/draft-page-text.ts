/**
 * Draft a page reference from cached vision output, for a person to correct against the page image
 * (reportsthatmatter-kyj3). The draft is NOT a reference until it has been read word by word against
 * the image; it exists so the checker starts from 99% right text instead of typing a page.
 *
 *   pnpm exec tsx scripts/vision/draft-page-text.ts <report-repo> <pdf pages, comma separated> <out dir>
 *
 * Writes <out>/<pdf>.txt (blocks by blank lines, `# ` headings, `- ` list items, `[^n]` markers),
 * <out>/<pdf>.notes.txt (`[^n]: text`) and <out>/<pdf>.png (the page at 110 dpi).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDoctags } from "../../src/lib/vision/doctags";

const [repoArg, pagesArg, outArg] = process.argv.slice(2);
const repo = resolve(repoArg);
const pdf = join(repo, "archive", readdirSync(join(repo, "archive")).filter((f) => f.endsWith(".pdf")).sort()[0]);
const digest = createHash("sha256").update(readFileSync(pdf)).digest("hex");
const cdir = join(process.env.RTM_VISION_CACHE ?? join(repo, ".cache", "vision"), digest, process.env.RTM_VISION_BACKEND ?? "mlx");
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
for (const p of pagesArg.split(",").map(Number)) {
  const blocks = parseDoctags(readFileSync(join(cdir, `p${String(p).padStart(4, "0")}.doctags`), "utf8"));
  const body: string[] = [];
  const notes: string[] = [];
  for (const b of blocks) {
    if (b.type === "furniture" || b.type === "other") continue;
    if (b.type === "footnote") {
      notes.push(`[^${b.label ?? "?"}]: ${b.text.replace(/^\s*\d{1,4}\s*/, "")}`);
      continue;
    }
    let t = b.text;
    for (const m of [...b.markers].sort((x, y) => y.offset - x.offset)) t = t.slice(0, m.offset) + `[^${m.label}]` + t.slice(m.offset + m.label.length);
    body.push(b.type === "heading" ? `${"#".repeat(Math.min(b.level ?? 2, 6))} ${t}` : b.type === "list_item" ? `- ${t}` : t);
  }
  writeFileSync(join(out, `${p}.txt`), body.join("\n\n") + "\n");
  writeFileSync(join(out, `${p}.notes.txt`), notes.join("\n") + (notes.length ? "\n" : ""));
  execFileSync("pdftoppm", ["-r", "110", "-f", String(p), "-l", String(p), "-png", "-singlefile", pdf, join(out, String(p))]);
}
