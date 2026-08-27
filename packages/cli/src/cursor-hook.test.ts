import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { runCursorPreToolUseHook } = await import("./cursor-hook.js")
const { closeSharedStores, StatsStore, defaultDbPath, openStatsSqlite } = await import("@ctxlite/core")

async function* stdinOf(value: unknown): AsyncIterable<string> {
  yield JSON.stringify(value)
}

/** Reads the (single, isolated-per-test) logged row's upstream/host directly — StatsStore's aggregate methods don't expose raw per-row fields. */
function readLoggedRow(dbPath: string): { upstream: string; host: string | null } | undefined {
  const raw = openStatsSqlite(dbPath)
  try {
    return raw.get<{ upstream: string; host: string | null }>("SELECT upstream, host FROM requests LIMIT 1")
  } finally {
    raw.close()
  }
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

  it("blocks a low-signal read path via the 'path' field (the actual key real Cursor CLI sends for Read tool calls)", async () => {
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { path: "/some/repo/node_modules/foo/index.js" } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { permission: string }
      expect(body.permission).toBe("deny")
    } finally {
      out.restore()
    }
  })

  it("does NOT block a large-file read (regression guard: the OpenCode-only size-threshold rule leaked into every hook once — caught live via this repo's own dogfooded Claude Code hook — must never fire for Cursor either)", async () => {
    const out = captureStdout()
    const bigFile = join(tmpHome, "large.ts")
    writeFileSync(bigFile, "x".repeat(2000 * 4 + 100))
    try {
      const code = await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: bigFile } }),
      )
      expect(code).toBe(0)
      expect(out.calls.join("")).toBe("")
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

  it("blocks a read matched by the project's .ctxliteignore (cwd threaded through to optimizeReadPath)", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
    writeFileSync(join(tmpHome, ".ctxliteignore"), "vendor/\n")
    const out = captureStdout()
    try {
      const code = await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "vendor/some-lib/file.go" } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { permission: string }
      expect(body.permission).toBe("deny")
    } finally {
      out.restore()
      cwdSpy.mockRestore()
    }
  })

  it("logs the real tool name as upstream (not the host) for a rewritten Shell command, leaving host unchanged", async () => {
    const out = captureStdout()
    try {
      await runCursorPreToolUseHook(stdinOf({ tool_name: "Shell", tool_input: { command: "npm test" } }))
    } finally {
      out.restore()
    }
    const row = readLoggedRow(defaultDbPath())
    expect(row?.upstream).toBe("bash")
    expect(row?.host).toBe("cursor")
  })

  it("logs the real tool name as upstream for a blocked read", async () => {
    const out = captureStdout()
    try {
      await runCursorPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "node_modules/foo/index.js" } }),
      )
    } finally {
      out.restore()
    }
    const row = readLoggedRow(defaultDbPath())
    expect(row?.upstream).toBe("read")
    expect(row?.host).toBe("cursor")
  })
})
