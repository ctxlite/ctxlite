import type {
  BenchSummary,
  BaselineComparison,
  PinnedBaselineComparison,
  RegressionVerdict,
  RunResult,
  SavingsSource,
} from "./types.js"
import { MEASURED_SOURCES } from "./types.js"
import type { AdapterId, TaskId } from "./types.js"

const ESTIMATE_SOURCES: ReadonlySet<SavingsSource> = new Set(["precall", "concise"])

export function sumBaselineTokensIn(runs: RunResult[]): number {
  return runs.filter((r) => r.adapterId === "baseline").reduce((sum, r) => sum + r.tokensIn, 0)
}

export function sumCtxliteAllTokensSaved(runs: RunResult[]): number {
  return runs.filter((r) => r.adapterId === "ctxlite-all").reduce((sum, r) => sum + r.tokensSaved, 0)
}

export function measuredTokensSaved(runs: RunResult[]): number {
  let total = 0
  for (const run of runs) {
    if (run.adapterId !== "ctxlite-all") continue
    for (const [source, value] of Object.entries(run.mechanismAttribution) as Array<[SavingsSource, number]>) {
      if (MEASURED_SOURCES.has(source)) {
        total += value
      }
    }
  }
  return total
}

export function computeBaselineComparison(runs: RunResult[]): BaselineComparison {
  const baselineIn = sumBaselineTokensIn(runs)
  const totalTokensSaved = sumCtxliteAllTokensSaved(runs)
  const measuredSaved = measuredTokensSaved(runs)
  const savingsPercent = baselineIn > 0 ? (totalTokensSaved / baselineIn) * 100 : 0
  const measuredSavingsPercent = baselineIn > 0 ? (measuredSaved / baselineIn) * 100 : 0

  const byMechanism: Partial<Record<SavingsSource, number>> = {}
  for (const run of runs) {
    if (run.adapterId !== "ctxlite-all") continue
    for (const [source, value] of Object.entries(run.mechanismAttribution) as Array<[SavingsSource, number]>) {
      byMechanism[source] = (byMechanism[source] ?? 0) + value
    }
  }

  const totalCostSavedUsd = runs
    .filter((r) => r.adapterId === "ctxlite-all")
    .reduce((sum, r) => sum + r.costSaved, 0)

  return {
    totalTokensSaved,
    totalCostSavedUsd,
    savingsPercent,
    measuredSavingsPercent,
    byMechanism,
  }
}

export function correctnessPenalty(runs: RunResult[]): number {
  const baselineFails = runs.filter((r) => r.adapterId === "baseline" && r.status !== "passed").length
  const allFails = runs.filter((r) => r.adapterId === "ctxlite-all" && r.status !== "passed").length
  const total = runs.filter((r) => r.adapterId === "ctxlite-all").length
  if (total === 0) return 0
  return allFails / total - baselineFails / total
}

export function resolveGateFloorMeasuredPercent(
  pinned: BaselineComparison | PinnedBaselineComparison,
): number {
  if ("gateFloorMeasuredSavingsPercent" in pinned) {
    return pinned.gateFloorMeasuredSavingsPercent
  }
  return pinned.measuredSavingsPercent
}

export function evaluateRegression(
  runs: RunResult[],
  pinned: BaselineComparison | PinnedBaselineComparison,
  improvementFactor = 1.15,
): RegressionVerdict {
  const failures: string[] = []
  const current = computeBaselineComparison(runs)
  const gateFloor = resolveGateFloorMeasuredPercent(pinned)

  if (correctnessPenalty(runs) > 0) {
    failures.push(`correctness penalty ${correctnessPenalty(runs).toFixed(3)} > 0`)
  }

  for (const run of runs) {
    if (run.adapterId !== "ctxlite-all") continue
    for (const row of run.loggingAccuracy ?? []) {
      if (MEASURED_SOURCES.has(row.source) && row.deltaPercent > 10) {
        failures.push(`${run.runId}: ${row.source} logging delta ${row.deltaPercent.toFixed(1)}% > 10%`)
      }
    }
  }

  const requiredMeasured = gateFloor * improvementFactor
  if (current.measuredSavingsPercent < requiredMeasured) {
    failures.push(
      `measuredSavingsPercent ${current.measuredSavingsPercent.toFixed(2)}% < ${requiredMeasured.toFixed(2)}% (gate floor ${gateFloor.toFixed(2)}% × ${improvementFactor})`,
    )
  }

  for (const run of runs) {
    if (run.adapterId === "ctxlite-all" && run.status !== "passed" && !run.skipReason) {
      failures.push(`${run.runId} failed`)
    }
  }

  return {
    verdict: failures.length === 0 ? "pass" : "fail",
    failures,
    checkedAt: new Date().toISOString(),
  }
}

function median(values: number[]): { median: number; p25: number; p75: number } {
  if (values.length === 0) return { median: 0, p25: 0, p75: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
  return { median: mid, p25: sorted[0] ?? 0, p75: sorted[sorted.length - 1] ?? 0 }
}

export function buildSummary(
  runs: RunResult[],
  pinned: BaselineComparison | PinnedBaselineComparison,
): BenchSummary {
  const groups = new Map<string, RunResult[]>()
  for (const run of runs) {
    const key = `${run.adapterId}::${run.taskId}`
    const list = groups.get(key) ?? []
    list.push(run)
    groups.set(key, list)
  }

  const aggregations = [...groups.entries()].map(([key, group]) => {
    const [adapterId, taskId] = key.split("::") as [AdapterId, TaskId]
    const passed = group.filter((r) => r.status === "passed").length
    const failed = group.filter((r) => r.status === "failed").length
    return {
      adapterId,
      taskId,
      n: group.length,
      statusCounts: { passed, failed, timed_out: 0 },
      tokensSaved: median(group.map((r) => r.tokensSaved)),
      tokensIn: median(group.map((r) => r.tokensIn)),
      durationMs: median(group.map((r) => r.durationMs)),
      passRate: group.length > 0 ? passed / group.length : 0,
      varianceFlag: false,
    }
  })

  const baselineComparison = computeBaselineComparison(runs)
  const regressionVerdict = evaluateRegression(runs, pinned)

  return {
    timestamp: new Date().toISOString(),
    mode: "deterministic",
    aggregations,
    baselineComparison,
    regressionVerdict,
    correctnessPenalty: correctnessPenalty(runs),
    successfulTokensSaved: runs.reduce((sum, r) => sum + (r.status === "passed" ? r.tokensSaved : 0), 0),
    totalTokensSaved: runs.reduce((sum, r) => sum + r.tokensSaved, 0),
  }
}

export function formatReportText(summary: BenchSummary): string {
  const lines: string[] = [
    "============================================================",
    "ctxlite Benchmark Report",
    `Timestamp: ${summary.timestamp}`,
    `Mode: ${summary.mode}`,
    "============================================================",
    "",
    `Regression Verdict: ${summary.regressionVerdict.verdict.toUpperCase()}`,
    "",
    "Baseline Comparison:",
    `  Tokens saved: ${summary.baselineComparison.totalTokensSaved}`,
    `  Cost saved: $${summary.baselineComparison.totalCostSavedUsd.toFixed(2)}`,
    `  Savings: ${summary.baselineComparison.savingsPercent.toFixed(1)}%`,
    `  Measured savings: ${summary.baselineComparison.measuredSavingsPercent.toFixed(1)}%`,
    "",
    "  Per mechanism:",
  ]

  for (const [mech, val] of Object.entries(summary.baselineComparison.byMechanism)) {
    const kind = ESTIMATE_SOURCES.has(mech as SavingsSource) ? " (est.)" : ""
    lines.push(`    ${mech}${kind}: ${val} tokens saved`)
  }

  lines.push(
    "",
    `  Correctness penalty: ${(summary.correctnessPenalty * 100).toFixed(1)}%`,
    "    (failed ctxlite tasks / total) - (failed baseline tasks / total)",
    "",
  )

  if (summary.regressionVerdict.failures.length > 0) {
    lines.push("Failures:")
    for (const f of summary.regressionVerdict.failures) {
      lines.push(`  - ${f}`)
    }
    lines.push("")
  }

  lines.push("Aggregations:")
  for (const agg of summary.aggregations) {
    lines.push(
      `  ${agg.adapterId}/${agg.taskId}: ${agg.n} runs, pass rate ${(agg.passRate * 100).toFixed(0)}%, tokens saved median=${agg.tokensSaved.median}`,
    )
  }

  return lines.join("\n")
}
