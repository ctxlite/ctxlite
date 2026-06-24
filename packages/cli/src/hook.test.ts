import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { runPreToolUseHook, runPostToolUseHook } = await import("./hook.js")
const { closeSharedStores, StatsStore } = await import("@ctxlite/core")

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

describe("runPreToolUseHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-hook-home-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("rewrites a noisy bash command and emits updatedInput", async () => {
    const out = captureStdout()
    try {
      const code = await runPreToolUseHook(stdinOf({ tool_name: "Bash", tool_input: { command: "npm test" } }))
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as {
        hookSpecificOutput: { hookEventName: string; updatedInput: { command: string } }
      }
      expect(body.hookSpecificOutput.hookEventName).toBe("PreToolUse")
      expect(body.hookSpecificOutput.updatedInput.command).toContain("--silent")
    } finally {
      out.restore()
    }
  })

  it("blocks a low-signal read path via permissionDecision", async () => {
    const out = captureStdout()
    try {
      const code = await runPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "node_modules/foo/index.js" } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { hookSpecificOutput: { permissionDecision: string } }
      expect(body.hookSpecificOutput.permissionDecision).toBe("deny")
    } finally {
      out.restore()
    }
  })

  it("writes nothing when there's nothing to optimize", async () => {
    const out = captureStdout()
    try {
      const code = await runPreToolUseHook(stdinOf({ tool_name: "Read", tool_input: { file_path: "src/index.ts" } }))
      expect(code).toBe(0)
      expect(out.calls.join("")).toBe("")
    } finally {
      out.restore()
    }
  })

  it("never throws on malformed JSON", async () => {
    const out = captureStdout()
    try {
      const code = await runPreToolUseHook(
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

  it("tags the logged row with host=claude-code and the real session_id", async () => {
    const out = captureStdout()
    try {
      await runPreToolUseHook(
        stdinOf({ tool_name: "Bash", tool_input: { command: "npm test" }, session_id: "ses-cc-1" }),
      )
    } finally {
      out.restore()
    }

    const { defaultDbPath } = await import("@ctxlite/core")
    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("claude-code", "ses-cc-1")
    expect(summary.totalRequests).toBe(1)
    store.close()
  })

  it("blocks a read matched by the project's .ctxliteignore (cwd threaded through to optimizeReadPath)", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
    writeFileSync(join(tmpHome, ".ctxliteignore"), "vendor/\n")
    const out = captureStdout()
    try {
      const code = await runPreToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "vendor/some-lib/file.go" } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as { hookSpecificOutput: { permissionDecision: string } }
      expect(body.hookSpecificOutput.permissionDecision).toBe("deny")
    } finally {
      out.restore()
      cwdSpy.mockRestore()
    }
  })
})

describe("runPostToolUseHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-hook-home-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("compresses a large string tool_output", async () => {
    const out = captureStdout()
    try {
      const big = "line\n".repeat(5000)
      const code = await runPostToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "a.txt" }, tool_output: big }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as {
        hookSpecificOutput: { hookEventName: string; updatedToolOutput: string }
      }
      expect(body.hookSpecificOutput.hookEventName).toBe("PostToolUse")
      expect(typeof body.hookSpecificOutput.updatedToolOutput).toBe("string")
      expect(body.hookSpecificOutput.updatedToolOutput.length).toBeLessThan(big.length)
    } finally {
      out.restore()
    }
  })

  it("compresses an object-shaped tool_output, preserving its shape", async () => {
    const out = captureStdout()
    try {
      const big = "line\n".repeat(5000)
      const code = await runPostToolUseHook(
        stdinOf({ tool_name: "Bash", tool_input: { command: "ls -R" }, tool_output: { stdout: big, exit_code: 0 } }),
      )
      expect(code).toBe(0)
      const body = JSON.parse(out.calls.join("")) as {
        hookSpecificOutput: { updatedToolOutput: { stdout: string; exit_code: number } }
      }
      expect(body.hookSpecificOutput.updatedToolOutput.exit_code).toBe(0)
      expect(body.hookSpecificOutput.updatedToolOutput.stdout.length).toBeLessThan(big.length)
    } finally {
      out.restore()
    }
  })

  it("writes nothing for small output", async () => {
    const out = captureStdout()
    try {
      const code = await runPostToolUseHook(
        stdinOf({ tool_name: "Read", tool_input: { file_path: "a.txt" }, tool_output: "short" }),
      )
      expect(code).toBe(0)
      expect(out.calls.join("")).toBe("")
    } finally {
      out.restore()
    }
  })

  it("never throws on malformed JSON", async () => {
    const code = await runPostToolUseHook(
      (async function* () {
        yield "{not valid json"
      })(),
    )
    expect(code).toBe(0)
  })
})
