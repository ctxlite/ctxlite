import { describe, it, expect } from "vitest"
import { computeBaselineComparison, evaluateRegression, measuredTokensSaved } from "./report.js"
import type { BaselineComparison, RunResult } from "./types.js"

function ctxliteRun(taskId: RunResult["taskId"], tokensIn: number, saved: number, source: RunResult["mechanismAttribution"]): RunResult {
  return {
    runId: `ctxlite-all::${taskId}`,
    adapterId: "ctxlite-all",
    taskId,
    mode: "deterministic",
    status: "passed",
    tokensIn,
    tokensOut: tokensIn - saved,
    tokensCache: 0,
    tokensSaved: saved,
    costSaved: 0,
    durationMs: 0,
    overheadMs: 0,
    mechanismAttribution: source,
  }
}

function baselineRun(taskId: RunResult["taskId"], tokensIn: number): RunResult {
  return {
    runId: `baseline::${taskId}`,
    adapterId: "baseline",
    taskId,
    mode: "deterministic",
    status: "passed",
    tokensIn,
    tokensOut: tokensIn,
    tokensCache: 0,
    tokensSaved: 0,
    costSaved: 0,
    durationMs: 0,
    overheadMs: 0,
    mechanismAttribution: {},
  }
}

describe("measuredSavingsPercent", () => {
  it("excludes precall and concise from measured numerator", () => {
    const runs: RunResult[] = [
      baselineRun("compress-large-output", 10_000),
      ctxliteRun("compress-large-output", 10_000, 5000, { compress: 5000 }),
      ctxliteRun("precall-npm-test", 10, 800, { precall: 800 }),
      ctxliteRun("concise-10000-tokens", 10_000, 1500, { concise: 1500 }),
    ]
    expect(measuredTokensSaved(runs)).toBe(5000)
    const cmp = computeBaselineComparison(runs)
    expect(cmp.measuredSavingsPercent).toBeCloseTo(50, 0)
    expect(cmp.savingsPercent).toBeCloseTo(73, 0)
  })
})

describe("evaluateRegression", () => {
  const pinned = {
    gateFloorMeasuredSavingsPercent: 8,
    archivedSavingsPercent: 10,
    published: {
      totalTokensSaved: 1000,
      totalCostSavedUsd: 0.1,
      savingsPercent: 10,
      measuredSavingsPercent: 50,
      byMechanism: { compress: 800, precall: 200 },
    },
  }

  it("fails when measured rate is below gate floor × 1.15", () => {
    const runs: RunResult[] = [
      baselineRun("compress-large-output", 10_000),
      ctxliteRun("compress-large-output", 10_000, 800, { compress: 800 }),
    ]
    const verdict = evaluateRegression(runs, pinned)
    expect(verdict.verdict).toBe("fail")
    expect(verdict.failures.some((f) => f.includes("measuredSavingsPercent"))).toBe(true)
  })

  it("passes when measured rate meets the improvement gate", () => {
    const runs: RunResult[] = [
      baselineRun("compress-large-output", 10_000),
      ctxliteRun("compress-large-output", 10_000, 1000, { compress: 1000 }),
    ]
    const verdict = evaluateRegression(runs, pinned)
    expect(verdict.verdict).toBe("pass")
  })

  it("fails on logging accuracy above 10%", () => {
    const run = ctxliteRun("compress-large-output", 10_000, 1000, { compress: 1000 })
    run.loggingAccuracy = [{ source: "compress", logged: 1000, independent: 500, deltaPercent: 100 }]
    const runs: RunResult[] = [baselineRun("compress-large-output", 10_000), run]
    const verdict = evaluateRegression(runs, pinned)
    expect(verdict.verdict).toBe("fail")
    expect(verdict.failures.some((f) => f.includes("logging delta"))).toBe(true)
  })
})
