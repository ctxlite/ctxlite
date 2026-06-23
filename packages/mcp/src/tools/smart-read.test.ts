import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { handleSmartRead } from "./smart-read.js"

let tmpDir: string

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
