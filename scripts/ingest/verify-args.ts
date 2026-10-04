/**
 * `pnpm ingest verify` flags that take a value: `--findings [N|all]` (how many findings per oracle signal to print;
 * bare `--findings` is 5, as before) and `--findings-json <file>` (every oracle finding, for `pnpm ingest try`).
 * The value is removed from the positional arguments, so `verify --findings 20 us-x` still names a report.
 */
export type VerifyArgs = { positional: string[]; flags: string[]; findingsLimit: number | undefined; findingsJson: string | undefined };

export function parseVerifyArgs(args: string[]): VerifyArgs {
  const positional: string[] = [];
  const flags: string[] = [];
  let findingsLimit: number | undefined;
  let findingsJson: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--findings-json") {
      findingsJson = args[++i];
      if (!findingsJson || findingsJson.startsWith("--")) throw new Error("--findings-json needs a file");
    } else if (a === "--findings") {
      findingsLimit = 5;
      const next = args[i + 1];
      if (next === "all") (findingsLimit = Infinity), i++;
      else if (next !== undefined && /^\d+$/.test(next)) (findingsLimit = Number(next)), i++;
    } else if (a.startsWith("--")) flags.push(a);
    else positional.push(a);
  }
  return { positional, flags, findingsLimit, findingsJson };
}
