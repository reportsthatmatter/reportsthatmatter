import { staleReason } from "../../scripts/prerender-stamp.mjs";

/** vitest globalSetup: one clear message instead of dozens of cryptic failures. */
export default function setup() {
  const reason = staleReason();
  if (reason) {
    throw new Error(`\n\n${reason}.\n\nSeveral tests read assets/generated/ and would fail or pass against stale output.\nRun: pnpm prerender   (a fresh worktree: pnpm bootstrap)\n`);
  }
}
