import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { ToolContext } from "@opencode-ai/plugin"

let tmpHome: string
let tmpDir: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { smartReadTool } = await import("./smart-read-tool.js")

function fakeContext(directory: string): ToolContext {
  return {
    sessionID: "ses-1",
    messageID: "msg-1",
    agent: "build",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

describe("smartReadTool", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-smart-read-home-"))
    tmpDir = mkdtempSync(join(tmpdir(), "ctxlite-smart-read-project-"))
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns symbol signatures for a TypeScript file", async () => {
    const filePath = join(tmpDir, "math.ts")
    writeFileSync(
      filePath,
      `export function add(a: number, b: number): number {\n  return a + b\n}\n`,
    )

    const result = await smartReadTool.execute({ path: "math.ts" }, fakeContext(tmpDir))
    const output = typeof result === "string" ? result : result.output

    expect(output).toContain("export function add(a: number, b: number): number {")
    expect(output).not.toContain("return a + b")
  })

  it("falls back to a budgeted read for unsupported languages", async () => {
    const filePath = join(tmpDir, "script.py")
    const body = "x = 1\n".repeat(2000)
    writeFileSync(filePath, body)

    const result = await smartReadTool.execute({ path: "script.py", budget: 50 }, fakeContext(tmpDir))
    const output = typeof result === "string" ? result : result.output

    expect(output.length).toBeLessThan(body.length)
  })

  it("resolves relative paths against context.directory", async () => {
    writeFileSync(join(tmpDir, "small.ts"), `export const x = 1\n`)

    const result = await smartReadTool.execute({ path: "small.ts" }, fakeContext(tmpDir))
    const output = typeof result === "string" ? result : result.output

    expect(output).toContain("export const x = 1")
  })
})
