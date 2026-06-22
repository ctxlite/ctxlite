import { describe, it, expect } from "vitest"
import { handleGetStats } from "./get-stats.js"

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

  it("uses today as default when period is undefined", async () => {
    const result = await handleGetStats({})
    expect(result).toContain("today")
  })
})
