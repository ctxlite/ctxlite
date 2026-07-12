import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-diff-read-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleDiffRead } = await import("./diff-read.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleDiffRead", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ctxlite-mcp-diff-read-"))
  })

  it("returns hunk output for valid diff", async () => {
    const filePath = join(tmpDir, "a.ts")
    writeFileSync(filePath, "line1\nline2\nline3\n")
    const diff = `--- a/a.ts\n+++ b/a.ts\n@@ -2,1 +2,1 @@\n-line2\n+line2changed\n`
    const result = await handleDiffRead({ path: filePath, diff })
    expect(result).toContain("line2")
    expect(result).not.toContain("diff_read error")
  })

  it("returns error text for bad diff", async () => {
    const result = await handleDiffRead({ path: "missing.ts", diff: "not a diff" })
    expect(result).toContain("diff_read error")
  })
})
