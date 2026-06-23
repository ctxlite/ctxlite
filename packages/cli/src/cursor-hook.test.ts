import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { runCursorPreToolUseHook } = await import("./cursor-hook.js")
const { closeSharedStores, StatsStore, defaultDbPath } = await import("@ctxlite/core")

async function* stdinOf(value: unknown): AsyncIterable<string> {
  yield JSON.stringify(value)
}

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string) => {
    calls.push(chunk)
    return true
  }) as typeof process.stdout.write
  return { calls, restore: () => (process.stdout.write = original) }
}

describe("runCursorPreToolUseHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-cursor-hook-home-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("rewrites a noisy Shell command via updated_input", async () => {
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(stdinOf({ tool_name: "Shell", tool_input: { command: "npm test" } }))
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { updated_input: { command: string } }
      expect(body.updated_input.command).toContain("--silent")
    } finally {
      out.restore()
    }
  })

  it("blocks a low-signal read path via permission deny", async () => {
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "node_modules/foo/index.js" } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { permission: string }
      expect(body.permission).toBe("deny")
    } finally {
      out.restore()
    }
  })

  it("writes nothing when there's nothing to optimize", async () => {
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "src/index.ts" } }),
      )
      expect(code).toBe(0)
      expect(out.calls.join("")).toBe("")
    } finally {
      out.restore()
    }
  })

  it("never throws on malformed JSON", async () => {
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(
        (async function* () {
          yield "{not valid json"
        })(),
      )
      expect(code).toBe(0)
      expect(out.calls.join("")).toBe("")
    } finally {
      out.restore()
    }
  })

  it("tags the logged row with host=cursor and the real conversation_id", async () => {
    const out = captureStdout()
    try {
      await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Shell", tool_input: { command: "npm test" }, conversation_id: "conv-1" }),
      )
    } finally {
      out.restore()
    }

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("cursor", "conv-1")
    expect(summary.totalRequests).toBe(1)
    store.close()
  })
})
