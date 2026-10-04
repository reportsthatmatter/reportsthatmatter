/**
 * `pnpm ship`'s command line, parsed strictly (reportsthatmatter-hyph, reportsthatmatter-pvzd for repeated flags).
 *
 * An unknown flag used to be ignored, so `pnpm ship --pln` ran the release from step 1; and `--redo a --redo b`
 * applied only `a`. Here an unknown flag, a stray word, a value flag with no value are errors, and a repeated
 * list flag (`--ack`, `--skip`, `--redo`, `--from`, `--only`) collects every occurrence (each may also be a
 * comma list).
 */
export const BOOLEAN_FLAGS = ["--plan", "--measure", "--status", "--reset", "--shared", "--yes", "--allow-dirty", "--verbose", "--help", "-h"] as const;
export const VALUE_FLAGS = ["--ack", "--skip", "--redo", "--from", "--only", "--base", "--old-ref", "--d1-limit", "--d1-read-limit", "--root", "--state"] as const;

export type ShipArgs = {
  /** Human-readable problems; empty when the line is valid. */
  errors: string[];
  flag(name: string): boolean;
  /** The last value given for a single-valued option. */
  opt(name: string): string | undefined;
  /** Every value given for a flag, repeated or comma-separated, in order. */
  list(name: string): string[];
};

export function parseShipArgs(argv: string[]): ShipArgs {
  const errors: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((BOOLEAN_FLAGS as readonly string[]).includes(a)) flags.add(a);
    else if ((VALUE_FLAGS as readonly string[]).includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) errors.push(`${a} needs a value`);
      else {
        values.set(a, [...(values.get(a) ?? []), v]);
        i++;
      }
    } else if (a.startsWith("-")) errors.push(`unknown flag ${a}`);
    else errors.push(`unexpected argument "${a}"`);
  }
  return {
    errors,
    flag: (name) => flags.has(name),
    opt: (name) => values.get(name)?.at(-1),
    list: (name) => (values.get(name) ?? []).flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean),
  };
}
