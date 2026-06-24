import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createMessagesTransformHook } = await import("./messages-transform-hook.js")
const { StatsStore, closeSharedStores, defaultDbPath } = await import("@ctxlite/core")

function toolPart(callID: string, tool: string, input: Record<string, unknown>, output: string) {
  return { type: "tool" as const, callID, tool, state: { status: "completed", input, output } }
}

describe("createMessagesTransformHook", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-messages-hook-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("logs a prune entry when a duplicate large tool output is found, tagged with the last message's sessionID", async () => {
    const hook = createMessagesTransformHook()
    const big = "x".repeat(2000)
    const messages = [
      { parts: [toolPart("call-1", "read", { path: "a.ts" }, big)], info: { sessionID: "ses-1" } },
      { parts: [toolPart("call-2", "read", { path: "a.ts" }, big)], info: { sessionID: "ses-1" } },
    ]

    await hook({}, { messages })

    expect(messages[0]?.parts[0]?.state.output).toContain("Duplicate")
    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-1")
    expect(summary.pruneRequests).toBe(1)
    store.close()
  })

  it("logs a compact entry for a large stale output in a non-last message", async () => {
    const hook = createMessagesTransformHook()
    const big = Array.from({ length: 200 }, (_, i) => `line ${i} padding padding padding`).join("\n")
    const messages = [
      { parts: [toolPart("call-1", "bash", { command: "ls" }, big)], info: { sessionID: "ses-2" } },
      { parts: [toolPart("call-2", "bash", { command: "pwd" }, "/tmp")], info: { sessionID: "ses-2" } },
    ]

    await hook({}, { messages })

    expect(messages[0]?.parts[0]?.state.output).toContain("ctxlite")
    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-2")
    expect(summary.compactRequests).toBe(1)
    store.close()
  })

  it("logs nothing when there is nothing to prune or cap", async () => {
    const hook = createMessagesTransformHook()
    const messages = [{ parts: [toolPart("call-1", "bash", { command: "ls" }, "short")], info: { sessionID: "ses-3" } }]

    await hook({}, { messages })

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-3")
    expect(summary.pruneRequests).toBe(0)
    expect(summary.compactRequests).toBe(0)
    store.close()
  })

  it("does not throw when no message carries a sessionID", async () => {
    const hook = createMessagesTransformHook()
    const messages = [{ parts: [toolPart("call-1", "bash", { command: "ls" }, "short")] }]

    await expect(hook({}, { messages })).resolves.not.toThrow()
  })
})
