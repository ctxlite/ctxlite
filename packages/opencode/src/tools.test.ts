import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { ToolContext } from "@opencode-ai/plugin"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { getStatsTool, trimContextTool } = await import("./tools.js")
const { closeSharedStores, StatsStore, defaultDbPath } = await import("@ctxlite/core")

function fakeContext(sessionID = "ses-1"): ToolContext {
  return {
    sessionID,
    messageID: "msg-1",
    agent: "build",
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

function output(result: string | { output: string }): string {
  return typeof result === "string" ? result : result.output
}

describe("getStatsTool", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-tools-home-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("reports no data for an empty current session", async () => {
    const result = await getStatsTool.execute({}, fakeContext("ses-empty"))
    expect(output(result)).toContain("No requests recorded")
  })

  it("defaults to the current session, scoped by sessionID", async () => {
    const dbPath = defaultDbPath()
    const { logOptimizationSavings } = await import("@ctxlite/core")
    logOptimizationSavings(
      { source: "precall", upstream: "bash", tokensIn: 500, tokensOut: 0, host: "opencode", sessionId: "ses-a" },
      dbPath,
    )

    const resultA = await getStatsTool.execute({}, fakeContext("ses-a"))
    expect(output(resultA)).toContain("ctxlite stats — current session")
    expect(output(resultA)).toContain("precall")

    const resultB = await getStatsTool.execute({}, fakeContext("ses-b"))
    expect(output(resultB)).toContain("No requests recorded")
  })

  it("accepts an explicit period across all sessions", async () => {
    const dbPath = defaultDbPath()
    const { logOptimizationSavings } = await import("@ctxlite/core")
    logOptimizationSavings(
      { source: "precall", upstream: "bash", tokensIn: 500, tokensOut: 0, host: "opencode", sessionId: "ses-c" },
      dbPath,
    )

    const result = await getStatsTool.execute({ period: "all" }, fakeContext("ses-irrelevant"))
    expect(output(result)).toContain("ctxlite stats — all")
  })
})

describe("trimContextTool", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-tools-home-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("reports no trimming needed when every file fits the budget and is relevant", async () => {
    const result = await trimContextTool.execute(
      {
        files: [
          { path: "login.ts", content: "export function login(user: string) { return user }" },
          { path: "login.test.ts", content: "test('login works', () => { login('a') })" },
        ],
        query: "login function",
      },
      fakeContext(),
    )
    expect(output(result)).toContain("no trimming needed")
  })

  it("excludes irrelevant files and logs the trim result for the session", async () => {
    const files = [
      { path: "auth.ts", content: "export function login(user: string) { return user }".repeat(50) },
      { path: "unrelated.ts", content: "export const totallyUnrelatedConstant = 42".repeat(50) },
    ]

    const result = await trimContextTool.execute(
      { files, query: "fix the login function bug", maxTokens: 20 },
      fakeContext("ses-trim"),
    )

    const text = output(result)
    expect(text).toContain("trim_context result")

    const store = new StatsStore(defaultDbPath())
    const summary = store.summaryForSession("opencode", "ses-trim")
    expect(summary.trimmedRequests).toBe(1)
    store.close()
  })
})
