import { describe, it, expect, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
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
})
