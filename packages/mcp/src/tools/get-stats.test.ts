import { describe, it, expect, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// shared.ts computes STATS_DB_PATH from homedir() once, at import time — the
// fake homedir must exist before that import happens, or this test suite
// reads/writes the user's actual ~/.ctxlite/stats.db on every run.
const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-get-stats-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleGetStats } = await import("./get-stats.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleGetStats", () => {
  it("returns formatted stats for empty db", async () => {
    const result = await handleGetStats({ period: "today" })
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("accepts all valid periods without throwing", async () => {
    const periods = ["session", "today", "7d", "30d", "all"] as const
    for (const period of periods) {
      const result = await handleGetStats({ period })
      expect(typeof result).toBe("string")
    }
  })

  it("uses current session as default when period is undefined", async () => {
    const result = await handleGetStats({})
    expect(result).toContain("current session")
  })

  it("renders the full bar-chart breakdown when there are real savings to report", async () => {
    const { logOptimizationSavings } = await import("@ctxlite/core")
    logOptimizationSavings(
      { source: "precall", upstream: "bash", tokensIn: 800, tokensOut: 0 },
      join(tmpHome, ".ctxlite", "stats.db"),
    )

    const result = await handleGetStats({ period: "all" })
    expect(result).toContain("Tokens saved")
    expect(result).toContain("precall")
    expect(result).toContain("Est. cost saved")
  })

  it("returns a clear error message instead of throwing when the db file is corrupt", async () => {
    // STATS_DB_PATH is frozen at import time, so this test runs last and
    // corrupts the same file the earlier tests already created — `new
    // StatsStore()` opens lazily per call (no caching), so overwriting the
    // file with non-sqlite content makes the next open() genuinely fail.
    const dbPath = join(tmpHome, ".ctxlite", "stats.db")
    writeFileSync(dbPath, "not a real sqlite file")

    const result = await handleGetStats({ period: "all" })
    expect(result).toContain("ctxlite stats unavailable")
  })
})
