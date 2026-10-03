/**
 * A report's passages as the search index should hold them, read from the pre-rendered section pages
 * (`pnpm prerender`), the same bytes a reader is served. Shared by `pnpm index-search` (whole-file index)
 * and the incremental reindex, so what is indexed cannot differ between the two.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Passage } from "./reindex";

type Extract = (html: string) => Array<{ paragraphId: string; text: string; page: string | null }>;

export function readReportPassages(root: string, reportId: string, extractPassages: Extract): { contentVersion: string; passages: Passage[] } {
  const dir = join(root, `assets/generated/reports/${reportId}`);
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { sections: Array<{ slug: string; title: string }> };

  // Content-hashed, not hand-maintained: a version that can drift from what was actually indexed is the
  // exact defect this is meant to catch. Hashed over the section pages in order, which is what is indexed.
  const digest = createHash("sha256");
  const passages: Passage[] = [];
  for (const section of meta.sections) {
    const html = readFileSync(join(dir, `fragments/${section.slug}.html`), "utf8");
    digest.update(section.slug).update("\0").update(html).update("\0");
    for (const passage of extractPassages(html)) {
      passages.push({ section: section.title, paragraph_id: passage.paragraphId, page: passage.page, body: passage.text });
    }
  }
  return { contentVersion: digest.digest("hex").slice(0, 12), passages };
}
