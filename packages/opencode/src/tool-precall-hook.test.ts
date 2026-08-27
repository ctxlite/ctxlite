import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createToolPrecallHook } = await import("./tool-precall-hook.js")
const { takePrecallPending, hasPathEngagement } = await import("./precall-state.js")
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

  it("blocks a read matched by the project's .ctxliteignore (cwd threaded through to optimizeReadPath)", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
    try {
      writeFileSync(join(tmpHome, ".ctxliteignore"), "vendor/\n")
      const hook = createToolPrecallHook()
      const output = baseOutput({ filePath: "vendor/some-lib/file.go" })

      await hook({ tool: "read", sessionID: "ses-6", callID: "call-6" }, output)

      expect(output.result).toContain("Blocked")
    } finally {
      cwdSpy.mockRestore()
    }
  })

  describe("large-file block-and-redirect (spec 026, User Story 2)", () => {
    const bigContent = () => "x".repeat(2000 * 4 + 100)

    it("blocks a large full read with no prior engagement, naming smart_read, and logs the block", async () => {
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
      try {
        const filePath = join(tmpHome, "large.ts")
        writeFileSync(filePath, bigContent())

        const hook = createToolPrecallHook()
        const output = baseOutput({ path: filePath })
        await hook({ tool: "read", sessionID: "ses-large-1", callID: "call-large-1" }, output)

        expect(output.result).toContain("[ctxlite]")
        expect(output.result).toContain("smart_read")

        const store = new StatsStore(defaultDbPath())
        const summary = store.summaryForSession("opencode", "ses-large-1")
        expect(summary.precallRequests).toBe(1)
        store.close()
      } finally {
        cwdSpy.mockRestore()
      }
    })

    it("marks path engagement on a smart_read call despite smart_read being in SKIP_TOOLS", async () => {
      const hook = createToolPrecallHook()
      const output = baseOutput({ path: "src/large.ts" })

      await hook({ tool: "smart_read", sessionID: "ses-large-2", callID: "call-large-2" }, output)

      expect(hasPathEngagement("ses-large-2", "src/large.ts")).toBe(true)
    })

    it("marks path engagement on an edit call", async () => {
      const hook = createToolPrecallHook()
      const output = baseOutput({ filePath: "src/large.ts" })

      await hook({ tool: "edit", sessionID: "ses-large-3", callID: "call-large-3" }, output)

      expect(hasPathEngagement("ses-large-3", "src/large.ts")).toBe(true)
    })

    it("allows a large full read after the same path was already engaged via smart_read in this session", async () => {
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
      try {
        const filePath = join(tmpHome, "large.ts")
        writeFileSync(filePath, bigContent())

        const hook = createToolPrecallHook()

        await hook(
          { tool: "smart_read", sessionID: "ses-large-4", callID: "call-large-4a" },
          baseOutput({ path: filePath }),
        )

        const output = baseOutput({ path: filePath })
        await hook({ tool: "read", sessionID: "ses-large-4", callID: "call-large-4b" }, output)

        expect(output.result).toBeUndefined()
      } finally {
        cwdSpy.mockRestore()
      }
    })

    it("does not let a repeated identical blocked read bypass enforcement (engagement is not set by a block itself)", async () => {
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpHome)
      try {
        const filePath = join(tmpHome, "large.ts")
        writeFileSync(filePath, bigContent())

        const hook = createToolPrecallHook()

        await hook(
          { tool: "read", sessionID: "ses-large-5", callID: "call-large-5a" },
          baseOutput({ path: filePath }),
        )
        const secondAttempt = baseOutput({ path: filePath })
        await hook({ tool: "read", sessionID: "ses-large-5", callID: "call-large-5b" }, secondAttempt)

        expect(secondAttempt.result).toContain("[ctxlite]")
      } finally {
        cwdSpy.mockRestore()
      }
    })
  })
})
