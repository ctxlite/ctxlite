export type SavingsSource =
  | "precall"
  | "compress"
  | "prune"
  | "compact"
  | "smart_read"
  | "trim"
  | "concise"

export const MEASURED_SOURCES: ReadonlySet<SavingsSource> = new Set([
  "compress",
  "prune",
  "compact",
  "smart_read",
  "trim",
])

export type AdapterId =
  | "baseline"
  | "precall"
  | "compress"
  | "prune"
  | "compact"
  | "smart_read"
  | "trim"
  | "concise"
  | "ctxlite-all"
  | "claude-code"
  | "cursor"

export type TaskId =
  | "compact-stale-tool-output"
  | "compress-large-output"
  | "concise-10000-tokens"
  | "precall-npm-test"
  | "prune-duplicate-tool-call"
  | "smart-read-typescript"
  | "trim-file-list"

export interface LoggingAccuracyRow {
  source: SavingsSource
  logged: number
  independent: number
  deltaPercent: number
}

export interface RunResult {
  runId: string
  adapterId: AdapterId
  taskId: TaskId
  mode: "deterministic"
  status: "passed" | "failed" | "timed_out"
  tokensIn: number
  tokensOut: number
  tokensCache: number
  tokensSaved: number
  costSaved: number
  durationMs: number
  overheadMs: number
  mechanismAttribution: Partial<Record<SavingsSource, number>>
  loggingAccuracy?: LoggingAccuracyRow[]
  skipReason?: string
}

/** Metrics from a single bench run (current or published snapshot). */
export interface BaselineComparison {
  totalTokensSaved: number
  totalCostSavedUsd: number
  savingsPercent: number
  measuredSavingsPercent: number
  byMechanism: Partial<Record<SavingsSource, number>>
}

/**
 * Shape of `bench/baseline/summary.json` → `baselineComparison`.
 * Separates regression gate floor from published docs metrics.
 */
export interface PinnedBaselineComparison {
  /** Pre-improvement measured rate — regression gate uses this × 1.15 */
  gateFloorMeasuredSavingsPercent: number
  /** June 2026 archive all-mechanisms rate (historical reference) */
  archivedSavingsPercent: number
  /** Latest passing run — source of truth for docs metrics tables */
  published: BaselineComparison
}

export interface RegressionVerdict {
  verdict: "pass" | "fail"
  failures: string[]
  checkedAt: string
}

export interface BenchSummary {
  timestamp: string
  mode: "deterministic"
  aggregations: Array<{
    adapterId: AdapterId
    taskId: TaskId
    n: number
    statusCounts: { passed: number; failed: number; timed_out: number }
    tokensSaved: { median: number; p25: number; p75: number }
    tokensIn: { median: number; p25: number; p75: number }
    durationMs: { median: number; p25: number; p75: number }
    passRate: number
    varianceFlag: boolean
  }>
  baselineComparison: BaselineComparison
  regressionVerdict: RegressionVerdict
  correctnessPenalty: number
  successfulTokensSaved: number
  totalTokensSaved: number
}
