import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createToolPrecallHook } = await import("./tool-precall-hook.js")
const { takePrecallPending } = await import("./precall-state.js")
const { StatsStore, closeSharedStores, defaultDbPath } = await import("@ctxlite/core")

function baseOutput(args: Record<string, unknown>): { args: Record<string, unknown>; result?: string } {
  return { args }
}

describe("createToolPrecallHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-precall-hook-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("rewrites a noisy bash command and marks it pending (not logged yet)", async () => {
    const hook = createToolPrecallHook()
    const output = baseOutput({ command: "npm test" })

    await hook({ tool: "bash", sessionID: "ses-1", callID: "call-1" }, output)

    expect(output.args.command).toContain("--silent")
    const pending = takePrecallPending("ses-1", "call-1")
    expect(pending?.estimatedTokensSaved).toBeGreaterThan(0)
    expect(pending?.label).toBe("npm_test")
  })

  it("blocks a low-signal read and logs immediately (not deferred)", async () => {
    const hook = createToolPrecallHook()
    const output = baseOutput({ filePath: "node_modules/foo/index.js" })

    await hook({ tool: "read", sessionID: "ses-2", callID: "call-2" }, output)

    expect(output.result).toContain("Blocked")
    expect(takePrecallPending("ses-2", "call-2")).toBeUndefined()

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-2")
    expect(summary.precallRequests).toBe(1)
    store.close()
  })

  it("does nothing for an already-quiet command", async () => {
    const hook = createToolPrecallHook()
    const output = baseOutput({ command: "npm test --silent" })

    await hook({ tool: "bash", sessionID: "ses-3", callID: "call-3" }, output)

    expect(output.args.command).toBe("npm test --silent")
    expect(takePrecallPending("ses-3", "call-3")).toBeUndefined()
  })

  it("skips get_stats/trim_context/smart_read tools entirely", async () => {
    const hook = createToolPrecallHook()
    const output = baseOutput({ command: "npm test" })

    await hook({ tool: "trim_context", sessionID: "ses-4", callID: "call-4" }, output)

    // Untouched — the hook returned immediately without inspecting args.
    expect(output.args.command).toBe("npm test")
    expect(takePrecallPending("ses-4", "call-4")).toBeUndefined()
  })

  it("defaults to an empty args object when output.args is undefined", async () => {
    const hook = createToolPrecallHook()
    const output: { args?: Record<string, unknown>; result?: string } = {}

    await expect(
      hook({ tool: "bash", sessionID: "ses-5", callID: "call-5" }, output as { args: Record<string, unknown> }),
    ).resolves.not.toThrow()
  })
})
