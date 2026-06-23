import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpDir: string

// shared.ts computes STATS_DB_PATH from homedir() once, at import time — the
// fake homedir must exist before that import happens, not just before each
// test, or this test suite writes real rows into the user's actual
// ~/.ctxlite/stats.db on every run.
const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-smart-read-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { handleSmartRead } = await import("./smart-read.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

describe("handleSmartRead", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ctxlite-mcp-smart-read-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns symbol signatures for a TypeScript file given an absolute path", async () => {
    const filePath = join(tmpDir, "math.ts")
    writeFileSync(filePath, `export function add(a: number, b: number): number {\n  return a + b\n}\n`)

    const result = await handleSmartRead({ path: filePath })

    expect(result).toContain("export function add(a: number, b: number): number {")
    expect(result).not.toContain("return a + b")
  })

  it("falls back to a budgeted read for unsupported languages", async () => {
    const filePath = join(tmpDir, "script.py")
    const body = "x = 1\n".repeat(2000)
    writeFileSync(filePath, body)

    const result = await handleSmartRead({ path: filePath, budget: 50 })

    expect(result.length).toBeLessThan(body.length)
  })
})
