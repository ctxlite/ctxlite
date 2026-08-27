import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import type { BenchLiveRun, BenchLiveSummary } from "./types.js"

/** SC-001 floor — measured output-token reduction must be at least this, per the spec. */
export const SC001_FLOOR_PERCENT = 70

/** Percent reduction from `before` to `after`, or null when there's no `before` to compare against. */
export function percentReduction(before: number, after: number): number | null {
  if (before <= 0) {
    return null
  }
  return ((before - after) / before) * 100
}

/**
 * Builds the summary from a flat list of runs (mixed modes/tasks). Each
 * task needs both an `enforced` and a `disabled` run to compute a
 * reduction — a task missing either mode reports `outputTokenReductionPercent: null`
 * rather than fabricating a number (mirrors FR-004's "unavailable, not invented" rule).
 */
export function buildSummary(runId: string, model: string, runs: BenchLiveRun[]): BenchLiveSummary {
  const byTask = new Map<string, { enforced?: BenchLiveRun; disabled?: BenchLiveRun }>()
  for (const run of runs) {
    const entry = byTask.get(run.taskId) ?? {}
    entry[run.mode] = run
    byTask.set(run.taskId, entry)
  }

  const tasks = Array.from(byTask.entries()).map(([taskId, { enforced, disabled }]) => {
    const reduction =
      enforced && disabled ? percentReduction(disabled.outputTokens, enforced.outputTokens) : null
    return {
      taskId,
      ...(enforced
        ? {
            enforced: {
              inputTokens: enforced.inputTokens,
              outputTokens: enforced.outputTokens,
              totalTokens: enforced.totalTokens,
            },
          }
        : {}),
      ...(disabled
        ? {
            disabled: {
              inputTokens: disabled.inputTokens,
              outputTokens: disabled.outputTokens,
              totalTokens: disabled.totalTokens,
            },
          }
        : {}),
      outputTokenReductionPercent: reduction,
    }
  })

  const comparableTasks = tasks.filter((t) => t.outputTokenReductionPercent !== null)
  const totalDisabledOutput = comparableTasks.reduce(
    (sum, t) => sum + (t.disabled?.outputTokens ?? 0),
    0,
  )
  const totalEnforcedOutput = comparableTasks.reduce(
    (sum, t) => sum + (t.enforced?.outputTokens ?? 0),
    0,
  )
  const overall = comparableTasks.length > 0 ? percentReduction(totalDisabledOutput, totalEnforcedOutput) : null

  return {
    runId,
    model,
    tasks,
    overallOutputTokenReductionPercent: overall,
    passesFloor: overall === null ? null : overall >= SC001_FLOOR_PERCENT,
  }
}

export function renderReportText(summary: BenchLiveSummary): string {
  const lines: string[] = [
    `bench-live run ${summary.runId} — model ${summary.model}`,
    "",
  ]

  for (const task of summary.tasks) {
    const pct =
      task.outputTokenReductionPercent === null ? "n/a (missing a mode)" : `${task.outputTokenReductionPercent.toFixed(1)}%`
    lines.push(`  ${task.taskId}: output-token reduction ${pct}`)
  }

  lines.push("")
  const overall =
    summary.overallOutputTokenReductionPercent === null
      ? "n/a"
      : `${summary.overallOutputTokenReductionPercent.toFixed(1)}%`
  lines.push(`Overall output-token reduction: ${overall} (floor: ${SC001_FLOOR_PERCENT}%)`)
  lines.push(
    `Live Regression Verdict: ${summary.passesFloor === null ? "INCONCLUSIVE" : summary.passesFloor ? "PASS" : "FAIL"}`,
  )

  return lines.join("\n") + "\n"
}

export function writeSummary(resultsDir: string, summary: BenchLiveSummary): { summaryPath: string; reportPath: string } {
  const runDir = join(resultsDir, summary.runId)
  mkdirSync(runDir, { recursive: true })

  const summaryPath = join(runDir, "summary.json")
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

  const reportPath = join(runDir, "report.txt")
  writeFileSync(reportPath, renderReportText(summary))

  return { summaryPath, reportPath }
}
