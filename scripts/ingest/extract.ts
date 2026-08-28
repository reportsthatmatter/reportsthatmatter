import { execFileSync } from "node:child_process";

export type Page = {
  /** 1-based index across the whole report, not the printed page number. */
  index: number;
  /** Which source volume this page came from, 1-based. */
  volume: number;
  /** 1-based index within its own PDF. What you open the file at to check. */
  pdfIndex: number;
  lines: string[];
};

/**
 * Extracts text with `pdftotext -layout`, which preserves leading whitespace.
 * The indentation is load-bearing: it is what tells us where paragraphs begin.
 */
export function extractPages(pdfPath: string): Page[] {
  let raw: string;
  try {
    raw = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    throw new Error(
      `pdftotext failed on ${pdfPath}. Is poppler installed? (${String(error)})`
    );
  }

  return raw
    .split("\f")
    .map((page, i) => ({
      index: i + 1,
      // Volume is assigned by the caller: this function sees one PDF and has
      // no way to know where it sits in the report's order.
      volume: 1,
      pdfIndex: i + 1,
      lines: page.split("\n"),
    }))
    .filter((page) => page.lines.some((line) => line.trim().length > 0));
}

/** Normalises the characters pdftotext emits that would otherwise reach output. */
export function normaliseWhitespace(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "–")
    .replace(/[ \t]+/g, " ")
    .trim();
}
