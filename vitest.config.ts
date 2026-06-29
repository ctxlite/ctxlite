import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    pool: "threads",
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "packages/*/src/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "packages/*/dist/**",
        // Legacy Go-binary npm distribution — separate product surface, not
        // TypeScript application logic. See README's "legacy Go proxy" split.
        "npm/**",
        "scripts/**",
        // Process entrypoints: call main()/connect a real stdio transport at
        // module load, so importing them in-process under a test runner would
        // execute that immediately (and, for the CLI, call process.exit()).
        // Covered instead by black-box tests that spawn the built binary as
        // a child process (index.test.ts in each package) — real coverage,
        // just not visible to v8 coverage, which only instruments the
        // current process, not children it spawns.
        "packages/cli/src/index.ts",
        "packages/mcp/src/index.ts",
        // Terminal-UI sidebar widget using @opentui/solid's custom renderer
        // (not solid-js/web) — no test renderer exists for this target, and
        // JSX compilation for it isn't wired into the test transform. Its
        // only real logic (readSnapshot) is a thin composition of
        // summaryForSession/buildStatsBreakdown/formatSavingsLine/
        // renderStatsBarChart, all separately covered elsewhere.
        "packages/opencode/src/tui.tsx",
      ],
    },
  },
})
