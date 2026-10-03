/* `pnpm marks` — two tools share the name. `pnpm marks check ...` replays anchored references against a
 * candidate text (scripts/marks-check.mjs, reportsthatmatter-p4h6); anything else is the plate pipeline
 * (scripts/imagery/build.mjs: `pnpm marks`, `pnpm marks columbia`). */
if (process.argv[2] === "check") {
  process.argv.splice(2, 1);
  await import("./marks-check.mjs");
} else {
  await import("./imagery/build.mjs");
}
