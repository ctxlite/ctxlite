export type BenchLiveMode = "enforced" | "disabled"

export interface BenchLiveTask {
  taskId: string
  prompt: string
  /** Path to the fixture the task's prompt refers to, relative to the repo root. */
  fixturePath: string
  /** Whether this task is expected to require an edit (used to sanity-check that ctxlite's edit-intent allowance isn't accidentally blocking legitimate edit flows too). */
  expectedEditIntent: boolean
  /** Human-readable description of how correctness is judged for this task — scoring itself is a manual/quickstart step, not automated here. */
  correctnessCheck: string
}

export interface BenchLiveRun {
  runId: string
  mode: BenchLiveMode
  model: string
  taskId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number | null
  timestampStart: string
  timestampEnd: string
  logPath: string
}

export interface BenchLiveSummary {
  runId: string
  model: string
  tasks: Array<{
    taskId: string
    enforced?: { inputTokens: number; outputTokens: number; totalTokens: number }
    disabled?: { inputTokens: number; outputTokens: number; totalTokens: number }
    outputTokenReductionPercent: number | null
  }>
  overallOutputTokenReductionPercent: number | null
  passesFloor: boolean | null
}
