import { execFileSync } from "node:child_process";

export type Page = {
  /** 1-based index as it appears in the PDF, not the printed page number. */
  index: number;
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
    .map((page, i) => ({ index: i + 1, lines: page.split("\n") }))
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
