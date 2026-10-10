/** `pnpm posts --report <id>` (reportsthatmatter-5qmm): which problems belong to the reports the caller named. */
export type Problem = { report: string; text: string };

/** The report ids given with `--report`, repeated or comma-separated. Empty means every report. */
export function reportScope(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--report" && argv[i + 1]) out.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
  return out;
}

/** Problems in scope; everything when the scope is empty. */
export function inScope<T extends { report: string }>(problems: T[], scope: string[]): T[] {
  return scope.length ? problems.filter((p) => scope.includes(p.report)) : problems;
}
