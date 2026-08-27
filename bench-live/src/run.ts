import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { TASKS } from "../scenarios/index.js"
import { resolveModel } from "./models.js"
import { buildSummary, writeSummary } from "./report.js"
import type { BenchLiveMode, BenchLiveRun, BenchLiveTask } from "./types.js"

export interface RunOptions {
  task?: string
  mode: "enforced" | "disabled" | "both"
  rerun?: string
  model?: string
  repoRoot: string
  resultsDir: string
}

export interface OpencodeInvoker {
  (args: { prompt: string; model: string; pure: boolean; cwd: string }): Promise<string>
}

/** Parses `bench:live` CLI flags. Exported for testing. */
export function parseArgs(argv: string[]): RunOptions {
  const opts: RunOptions = {
    mode: "both",
    repoRoot: process.cwd(),
    resultsDir: join(process.cwd(), "bench-live", "results"),
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    if (arg === "--task") opts.task = next()
    else if (arg === "--mode") {
      const m = next()
      if (m === "enforced" || m === "disabled" || m === "both") opts.mode = m
      else throw new Error(`Invalid --mode "${m}". Valid: enforced, disabled, both`)
    } else if (arg === "--rerun") opts.rerun = next()
    else if (arg === "--model") opts.model = next()
  }
  return opts
}

function tasksToRun(opts: RunOptions): BenchLiveTask[] {
  if (!opts.task) return TASKS
  const task = TASKS.find((t) => t.taskId === opts.task)
  if (!task) {
    throw new Error(`Unknown task "${opts.task}". Known tasks: ${TASKS.map((t) => t.taskId).join(", ")}`)
  }
  return [task]
}

function modesToRun(opts: RunOptions): BenchLiveMode[] {
  return opts.mode === "both" ? ["disabled", "enforced"] : [opts.mode]
}

/**
 * Real invoker — shells out to a locally installed `opencode` CLI. `pure`
 * (disabled mode) passes `--pure`, which runs without external plugins,
 * i.e. without ctxlite's OpenCode enforcement — this repo's opencode.json
 * configures @ctxlite/opencode as a plugin, so the default (non-pure) run
 * is the "enforced" baseline (research.md §5).
 */
export const realOpencodeInvoker: OpencodeInvoker = ({ prompt, model, pure, cwd }) => {
  return new Promise((resolve, reject) => {
    const args = ["run", "--format", "json", "-m", model, ...(pure ? ["--pure"] : []), prompt]
    // stdin MUST be "ignore" — an open, unwritten stdin pipe (spawn's
    // default) makes `opencode run` hang indefinitely waiting on it instead
    // of running non-interactively (found live while validating this
    // harness for spec 026 User Story 3: the process sat at ~0% CPU for
    // 10+ minutes with no output).
    const child = spawn("opencode", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on("error", (err) => {
      reject(
        new Error(
          `bench-live: could not run the local "opencode" CLI (${err.message}). Install it and authenticate a free-tier model first — see bench-live/README.md.`,
        ),
      )
    })
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`bench-live: "opencode run" exited ${code}: ${stderr.slice(-2000)}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** Sums input/output tokens across every step_finish event in an `opencode run --format json` transcript. */
export function parseOpencodeTokenUsage(rawOutput: string): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0
  let outputTokens = 0
  for (const line of rawOutput.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.startsWith("{")) continue
    let event: unknown
    try {
      event = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: unknown }).type === "step_finish"
    ) {
      const part = (event as { part?: { tokens?: { input?: number; output?: number } } }).part
      inputTokens += part?.tokens?.input ?? 0
      outputTokens += part?.tokens?.output ?? 0
    }
  }
  return { inputTokens, outputTokens }
}

async function runTaskInMode(
  task: BenchLiveTask,
  mode: BenchLiveMode,
  model: string,
  opts: RunOptions,
  runId: string,
  invoke: OpencodeInvoker,
): Promise<BenchLiveRun> {
  const timestampStart = new Date().toISOString()
  const rawOutput = await invoke({ prompt: task.prompt, model, pure: mode === "disabled", cwd: opts.repoRoot })
  const timestampEnd = new Date().toISOString()
  const { inputTokens, outputTokens } = parseOpencodeTokenUsage(rawOutput)

  const logDir = join(opts.resultsDir, runId, "logs")
  mkdirSync(logDir, { recursive: true })
  const logPath = join(logDir, `${task.taskId}-${mode}.jsonl`)
  writeFileSync(logPath, rawOutput)

  return {
    runId,
    mode,
    model,
    taskId: task.taskId,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: null,
    timestampStart,
    timestampEnd,
    logPath,
  }
}

export async function runBenchLive(
  opts: RunOptions,
  invoke: OpencodeInvoker = realOpencodeInvoker,
): Promise<{ exitCode: number }> {
  const runId = opts.rerun ?? new Date().toISOString().replace(/[:.]/g, "-")
  const model = resolveModel(opts.model)
  const tasks = tasksToRun(opts)
  const modes = modesToRun(opts)

  const runs: BenchLiveRun[] = []
  for (const task of tasks) {
    for (const mode of modes) {
      runs.push(await runTaskInMode(task, mode, model, opts, runId, invoke))
    }
  }

  const summary = buildSummary(runId, model, runs)
  const { reportPath } = writeSummary(opts.resultsDir, summary)
  // eslint-disable-next-line no-console
  console.log(`bench-live: wrote ${reportPath}`)

  return { exitCode: summary.passesFloor === false ? 1 : 0 }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const { exitCode } = await runBenchLive(opts)
  process.exitCode = exitCode
}

// Only run when invoked directly (`node run.js` / `tsx run.ts`), not when imported by tests.
if (process.argv[1]?.endsWith("run.ts") || process.argv[1]?.endsWith("run.js")) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
