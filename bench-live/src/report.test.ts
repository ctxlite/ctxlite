import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { percentReduction, buildSummary, renderReportText, writeSummary, SC001_FLOOR_PERCENT } from "./report.js"
import type { BenchLiveRun } from "./types.js"

function run(overrides: Partial<BenchLiveRun>): BenchLiveRun {
  return {
    runId: "r1",
    mode: "enforced",
    model: "opencode/big-pickle",
    taskId: "t1",
    inputTokens: 1000,
    outputTokens: 100,
    totalTokens: 1100,
    costUsd: 0,
    timestampStart: "2026-01-01T00:00:00.000Z",
    timestampEnd: "2026-01-01T00:00:05.000Z",
    logPath: "/tmp/log.json",
    ...overrides,
  }
}

describe("percentReduction", () => {
  it("computes a straightforward reduction", () => {
    expect(percentReduction(100, 30)).toBe(70)
  })

  it("returns null when before is zero or negative (no fabricated number)", () => {
    expect(percentReduction(0, 0)).toBeNull()
    expect(percentReduction(-5, 0)).toBeNull()
  })

  it("returns a negative number when after is larger than before (regression, not clamped)", () => {
    expect(percentReduction(100, 150)).toBe(-50)
  })
})

describe("buildSummary", () => {
  it("computes per-task and overall reduction from matched enforced/disabled runs", () => {
    const runs = [
      run({ taskId: "t1", mode: "disabled", outputTokens: 100 }),
      run({ taskId: "t1", mode: "enforced", outputTokens: 25 }),
      run({ taskId: "t2", mode: "disabled", outputTokens: 200 }),
      run({ taskId: "t2", mode: "enforced", outputTokens: 60 }),
    ]

    const summary = buildSummary("run-1", "opencode/big-pickle", runs)

    expect(summary.tasks).toHaveLength(2)
    expect(summary.tasks.find((t) => t.taskId === "t1")?.outputTokenReductionPercent).toBe(75)
    expect(summary.tasks.find((t) => t.taskId === "t2")?.outputTokenReductionPercent).toBe(70)
    // overall = (300-85)/300*100
    expect(summary.overallOutputTokenReductionPercent).toBeCloseTo(71.67, 1)
    expect(summary.passesFloor).toBe(true)
  })

  it("reports null (not fabricated) for a task missing one mode", () => {
    const runs = [run({ taskId: "t1", mode: "enforced", outputTokens: 25 })]
    const summary = buildSummary("run-2", "opencode/big-pickle", runs)

    expect(summary.tasks[0]?.outputTokenReductionPercent).toBeNull()
    expect(summary.overallOutputTokenReductionPercent).toBeNull()
    expect(summary.passesFloor).toBeNull()
  })

  it("fails the floor when overall reduction is below SC001_FLOOR_PERCENT", () => {
    const runs = [
      run({ taskId: "t1", mode: "disabled", outputTokens: 100 }),
      run({ taskId: "t1", mode: "enforced", outputTokens: 90 }),
    ]
    const summary = buildSummary("run-3", "opencode/big-pickle", runs)

    expect(summary.overallOutputTokenReductionPercent).toBe(10)
    expect(summary.passesFloor).toBe(false)
    expect(SC001_FLOOR_PERCENT).toBe(70)
  })
})

describe("renderReportText", () => {
  it("includes the verdict and per-task lines", () => {
    const runs = [
      run({ taskId: "t1", mode: "disabled", outputTokens: 100 }),
      run({ taskId: "t1", mode: "enforced", outputTokens: 20 }),
    ]
    const text = renderReportText(buildSummary("run-4", "opencode/big-pickle", runs))
    expect(text).toContain("t1: output-token reduction 80.0%")
    expect(text).toContain("Live Regression Verdict: PASS")
  })

  it("reports INCONCLUSIVE when no task has both modes", () => {
    const runs = [run({ taskId: "t1", mode: "enforced" })]
    const text = renderReportText(buildSummary("run-5", "opencode/big-pickle", runs))
    expect(text).toContain("Live Regression Verdict: INCONCLUSIVE")
  })
})

describe("writeSummary", () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes summary.json and report.txt under resultsDir/runId", () => {
    dir = mkdtempSync(join(tmpdir(), "ctxlite-bench-live-"))
    const runs = [
      run({ taskId: "t1", mode: "disabled", outputTokens: 100 }),
      run({ taskId: "t1", mode: "enforced", outputTokens: 20 }),
    ]
    const summary = buildSummary("run-6", "opencode/big-pickle", runs)

    const { summaryPath, reportPath } = writeSummary(dir, summary)

    expect(JSON.parse(readFileSync(summaryPath, "utf8")).runId).toBe("run-6")
    expect(readFileSync(reportPath, "utf8")).toContain("PASS")
  })
})
