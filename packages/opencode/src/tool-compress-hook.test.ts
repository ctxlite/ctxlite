import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createToolCompressHook } = await import("./tool-compress-hook.js")
const { markPrecallPending } = await import("./precall-state.js")
const { StatsStore, closeSharedStores, defaultDbPath } = await import("@ctxlite/core")

describe("createToolCompressHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-compress-hook-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("logs a deferred precall saving that was marked pending before the tool ran", async () => {
    const hook = createToolCompressHook()
    markPrecallPending("ses-1", "call-1", { estimatedTokensSaved: 800, label: "npm_test" })

    const output = { title: "Run tests", output: "ok", metadata: {} }
    await hook({ tool: "bash", sessionID: "ses-1", callID: "call-1" }, output)

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-1")
    expect(summary.precallRequests).toBe(1)
    expect(summary.precallTokensSaved).toBe(800)
    store.close()
  })

  it("compresses large tool output and logs the compression", async () => {
    const hook = createToolCompressHook()
    const big = Array.from({ length: 300 }, (_, i) => `line ${i} of noisy output padding padding`).join("\n")
    const output = { title: "Build", output: big, metadata: {} }

    await hook({ tool: "bash", sessionID: "ses-2", callID: "call-2" }, output)

    expect(output.output).toContain("ctxlite")
    expect(output.output.length).toBeLessThan(big.length)

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-2")
    expect(summary.compressRequests).toBe(1)
    store.close()
  })

  it("does not compress short output and logs nothing", async () => {
    const hook = createToolCompressHook()
    const output = { title: "Echo", output: "hello", metadata: {} }

    await hook({ tool: "bash", sessionID: "ses-3", callID: "call-3" }, output)

    expect(output.output).toBe("hello")
    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-3")
    expect(summary.compressRequests).toBe(0)
    store.close()
  })

  it("skips get_stats/trim_context/smart_read tools entirely", async () => {
    const hook = createToolCompressHook()
    const big = "x".repeat(5000)
    const output = { title: "stats", output: big, metadata: {} }

    await hook({ tool: "get_stats", sessionID: "ses-4", callID: "call-4" }, output)

    expect(output.output).toBe(big)
  })

  it("does nothing when output.output is empty", async () => {
    const hook = createToolCompressHook()
    const output = { title: "noop", output: "", metadata: {} }

    await expect(hook({ tool: "bash", sessionID: "ses-5", callID: "call-5" }, output)).resolves.not.toThrow()
    expect(output.output).toBe("")
  })

  it("routes grep tool output through the grep-aware compressor", async () => {
    const hook = createToolCompressHook()
    const lines = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts:${i}:match number ${i} found here`).join("\n")
    const output = { title: "Grep", output: lines, metadata: {} }

    await hook({ tool: "grep", sessionID: "ses-6", callID: "call-6" }, output)

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-6")
    expect(summary.compressRequests).toBe(1)
    store.close()
  })
})
