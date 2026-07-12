import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-code-search-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleCodeSearch } = await import("./code-search.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleCodeSearch", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ctxlite-mcp-code-search-"))
    mkdirSync(join(tmpDir, "src"), { recursive: true })
    writeFileSync(join(tmpDir, "src", "auth.ts"), "export function authenticate(token: string) {}\n")
  })

  it("returns ranked hits", async () => {
    const result = await handleCodeSearch({ query: "authenticate token", root: tmpDir })
    expect(result).toContain("code_search")
    expect(result).toContain("auth.ts")
  })

  it("returns error text for empty query", async () => {
    const result = await handleCodeSearch({ query: "   " })
    expect(result).toContain("code_search error")
  })
})
