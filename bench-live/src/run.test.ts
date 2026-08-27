import { describe, it, expect, afterEach, vi } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { EventEmitter } from "node:events"
import { TASKS } from "../scenarios/index.js"
import type { OpencodeInvoker } from "./run.js"

const spawnMock = vi.fn()
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }))

const { parseArgs, parseOpencodeTokenUsage, runBenchLive, realOpencodeInvoker } = await import("./run.js")

describe("parseArgs", () => {
  it("defaults to mode both", () => {
    expect(parseArgs([]).mode).toBe("both")
  })

  it("parses --task, --mode, --rerun, --model", () => {
    const opts = parseArgs(["--task", "t1", "--mode", "enforced", "--rerun", "run-abc", "--model", "opencode/foo"])
    expect(opts.task).toBe("t1")
    expect(opts.mode).toBe("enforced")
    expect(opts.rerun).toBe("run-abc")
    expect(opts.model).toBe("opencode/foo")
  })

  it("rejects an invalid --mode value", () => {
    expect(() => parseArgs(["--mode", "bogus"])).toThrow(/Invalid --mode/)
  })
})

describe("parseOpencodeTokenUsage", () => {
  it("sums input/output tokens across multiple step_finish events", () => {
    const raw = [
      JSON.stringify({ type: "step_start" }),
      JSON.stringify({ type: "step_finish", part: { tokens: { input: 100, output: 10 } } }),
      JSON.stringify({ type: "tool_use" }),
      JSON.stringify({ type: "step_finish", part: { tokens: { input: 50, output: 20 } } }),
    ].join("\n")

    expect(parseOpencodeTokenUsage(raw)).toEqual({ inputTokens: 150, outputTokens: 30 })
  })

  it("ignores non-JSON and unrelated lines", () => {
    const raw = "not json\n" + JSON.stringify({ type: "step_finish", part: { tokens: { input: 5, output: 1 } } })
    expect(parseOpencodeTokenUsage(raw)).toEqual({ inputTokens: 5, outputTokens: 1 })
  })

  it("returns zeros for empty output", () => {
    expect(parseOpencodeTokenUsage("")).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

describe("realOpencodeInvoker", () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it("rejects with a clear, specific error when the local opencode CLI is missing", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)

    const promise = realOpencodeInvoker({
      prompt: "hi",
      model: "opencode/big-pickle",
      pure: false,
      cwd: "/nonexistent-cwd-xyz",
    })
    child.emit("error", new Error("ENOENT"))

    await expect(promise).rejects.toThrow(/could not run the local "opencode" CLI/)
  })

  it("spawns with stdin ignored (regression: an open, unwritten stdin pipe made opencode run hang indefinitely)", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)

    const promise = realOpencodeInvoker({ prompt: "hi", model: "opencode/big-pickle", pure: false, cwd: "/tmp" })
    child.emit("close", 0)
    await promise

    const options = spawnMock.mock.calls[0]?.[2] as { stdio?: unknown[] }
    expect(options.stdio?.[0]).toBe("ignore")
  })

  it("passes --pure only when pure is true", async () => {
    const child1 = fakeChild()
    spawnMock.mockReturnValue(child1)
    const p1 = realOpencodeInvoker({ prompt: "hi", model: "opencode/big-pickle", pure: true, cwd: "/tmp" })
    child1.emit("close", 0)
    await p1
    expect(spawnMock.mock.calls[0]?.[1]).toContain("--pure")

    spawnMock.mockReset()
    const child2 = fakeChild()
    spawnMock.mockReturnValue(child2)
    const p2 = realOpencodeInvoker({ prompt: "hi", model: "opencode/big-pickle", pure: false, cwd: "/tmp" })
    child2.emit("close", 0)
    await p2
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain("--pure")
  })

  it("rejects with stderr context on a non-zero exit code", async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)

    const promise = realOpencodeInvoker({ prompt: "hi", model: "opencode/big-pickle", pure: false, cwd: "/tmp" })
    child.stderr.emit("data", Buffer.from("boom"))
    child.emit("close", 1)

    await expect(promise).rejects.toThrow(/exited 1/)
  })
})

describe("runBenchLive", () => {
  let resultsDir: string

  afterEach(() => {
    rmSync(resultsDir, { recursive: true, force: true })
  })

  it("runs a single task in both modes with a fake invoker and writes a summary showing the measured reduction", async () => {
    resultsDir = mkdtempSync(join(tmpdir(), "ctxlite-bench-live-run-"))

    const fakeInvoke: OpencodeInvoker = async ({ pure }) => {
      const usage = pure ? { input: 200, output: 100 } : { input: 80, output: 20 }
      return JSON.stringify({ type: "step_finish", part: { tokens: usage } })
    }

    const task = TASKS[0]
    if (!task) throw new Error("expected at least one task in the fixture set")

    const { exitCode } = await runBenchLive(
      { task: task.taskId, mode: "both", model: "opencode/big-pickle", repoRoot: process.cwd(), resultsDir },
      fakeInvoke,
    )

    expect(exitCode).toBe(0)

    const runDirs = readdirSync(resultsDir)
    expect(runDirs).toHaveLength(1)
    const summaryPath = join(resultsDir, runDirs[0] as string, "summary.json")
    expect(existsSync(summaryPath)).toBe(true)

    const summary = JSON.parse(readFileSync(summaryPath, "utf8"))
    expect(summary.overallOutputTokenReductionPercent).toBe(80)
    expect(summary.passesFloor).toBe(true)
  })

  it("rejects an unknown --task", async () => {
    resultsDir = mkdtempSync(join(tmpdir(), "ctxlite-bench-live-run-"))
    const fakeInvoke: OpencodeInvoker = async () => JSON.stringify({ type: "step_finish", part: { tokens: {} } })

    await expect(
      runBenchLive(
        { task: "does-not-exist", mode: "both", repoRoot: process.cwd(), resultsDir },
        fakeInvoke,
      ),
    ).rejects.toThrow(/Unknown task/)
  })

  it("--rerun reuses the given runId instead of generating a fresh timestamp", async () => {
    resultsDir = mkdtempSync(join(tmpdir(), "ctxlite-bench-live-run-"))
    const fakeInvoke: OpencodeInvoker = async () =>
      JSON.stringify({ type: "step_finish", part: { tokens: { input: 10, output: 5 } } })

    const task = TASKS[0]
    if (!task) throw new Error("expected at least one task in the fixture set")

    await runBenchLive(
      { task: task.taskId, mode: "enforced", rerun: "run-fixed-id", repoRoot: process.cwd(), resultsDir },
      fakeInvoke,
    )

    expect(existsSync(join(resultsDir, "run-fixed-id", "summary.json"))).toBe(true)
  })
})
