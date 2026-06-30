import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    pool: "threads",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
})
