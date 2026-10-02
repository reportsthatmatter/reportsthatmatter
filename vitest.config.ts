import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/support/require-prerender.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", ".worktrees/**", ".wrangler/**", ".claude/**"],
  },
});
