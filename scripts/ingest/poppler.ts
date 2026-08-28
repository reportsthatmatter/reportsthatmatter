import { execFileSync } from "node:child_process";

/**
 * The poppler version every committed baseline was produced with.
 *
 * `pdftotext` is an unpinned dependency that drifts. It changed under this
 * project mid-flight: re-ingesting `challenger-accident` with **unchanged**
 * ingestion code once produced 2,000+ lines of diff purely from a Homebrew
 * update two weeks earlier (#108). For a project whose promise is that a
 * citation resolves to the same text forever, that is a real risk — and one
 * a routine `brew upgrade` can trigger with nobody noticing.
 *
 * Bumping this is a deliberate act: change it, re-run `pnpm ingest check`,
 * read the diffs, and re-baseline. Never bump it to make a check pass.
 */
export const EXPECTED_POPPLER = "26.08.0";

export function popplerVersion(): string {
  try {
    const out = execFileSync("pdftotext", ["-v"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return /pdftotext version (\S+)/.exec(out)?.[1] ?? "unknown";
  } catch {
    return "missing";
  }
}

/** A warning line when the installed poppler is not the pinned one. */
export function popplerWarning(): string | null {
  const found = popplerVersion();
  if (found === EXPECTED_POPPLER) return null;
  return (
    `poppler ${found}, expected ${EXPECTED_POPPLER} — extraction output can ` +
    "differ between versions, so any diff you see may be tool drift rather " +
    "than a code change (#117). Baselines were built on " +
    `${EXPECTED_POPPLER}.`
  );
}
