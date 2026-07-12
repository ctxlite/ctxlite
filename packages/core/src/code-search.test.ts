import { describe, it, expect } from "vitest"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { searchCodebase, formatCodeSearchOutput } from "./code-search.js"

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/mcp-efficiency/search-repo")

describe("searchCodebase", () => {
  it("SC-005: returns auth handler in top 3 with matching snippet", async () => {
    const result = await searchCodebase({
      query: "authentication token bearer",
      root: FIXTURE_DIR,
      maxResults: 5,
    })

    expect(result.hits.length).toBeGreaterThan(0)
    const topPaths = result.hits.slice(0, 3).map((h) => h.path)
    expect(topPaths.some((p) => p.includes("auth"))).toBe(true)
    const authHit = result.hits.find((h) => h.path.includes("auth"))
    expect(authHit?.snippet).toMatch(/authenticate|Bearer|token/i)
    expect(result.tokensSaved).toBeGreaterThan(0)
  })

  it("formats markdown output", async () => {
    const result = await searchCodebase({ query: "template render", root: FIXTURE_DIR })
    const text = formatCodeSearchOutput("template", result.hits)
    expect(text).toContain("## code_search")
    expect(text).toContain("render")
  })

  it("rejects empty query", async () => {
    await expect(searchCodebase({ query: "  ", root: FIXTURE_DIR })).rejects.toThrow(/empty/)
  })
})
