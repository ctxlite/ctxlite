import {
  capStaleToolOutputs,
  compressOutputForTool,
  estimateConcisenessSavings,
  estimateCost,
  estimateTokens,
  extractSymbols,
  optimizeBashCommand,
  pruneMessageContext,
  trimFiles,
  type PruneMessage,
} from "@ctxlite/core"
import { largeToolOutput, TRIM_CANDIDATES, TYPESCRIPT_FIXTURE } from "../scenarios/index.js"
import type { AdapterId, LoggingAccuracyRow, RunResult, SavingsSource, TaskId } from "./types.js"
import { MEASURED_SOURCES } from "./types.js"

const ADAPTER_MECHANISMS: Record<
  AdapterId,
  ReadonlySet<SavingsSource> | "all" | "host-precall-compress" | "host-precall-only"
> = {
  baseline: new Set(),
  precall: new Set(["precall"]),
  compress: new Set(["compress"]),
  prune: new Set(["prune"]),
  compact: new Set(["compact"]),
  smart_read: new Set(["smart_read"]),
  trim: new Set(["trim"]),
  concise: new Set(["concise"]),
  "ctxlite-all": "all",
  "claude-code": "host-precall-compress",
  cursor: "host-precall-only",
}

function enabled(adapterId: AdapterId, source: SavingsSource): boolean {
  const cfg = ADAPTER_MECHANISMS[adapterId]
  if (cfg === "all") return true
  if (cfg === "host-precall-compress") return source === "precall" || source === "compress"
  if (cfg === "host-precall-only") return source === "precall"
  return cfg.has(source)
}

function pushAccuracy(rows: LoggingAccuracyRow[], source: SavingsSource, logged: number, before: string, after: string): void {
  const independent = Math.max(0, estimateTokens(before) - estimateTokens(after))
  const deltaPercent =
    independent === 0 ? (logged === 0 ? 0 : 100) : (Math.abs(logged - independent) / independent) * 100
  rows.push({ source, logged, independent, deltaPercent })
}

interface ScenarioRun {
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  attribution: Partial<Record<SavingsSource, number>>
  loggingAccuracy: LoggingAccuracyRow[]
  passed: boolean
  skipReason?: string
}

function runCompactStale(): ScenarioRun {
  const stale = largeToolOutput()
  const messages: PruneMessage[] = [
    { parts: [{ type: "tool", callID: "c1", tool: "read", state: { status: "completed", output: stale } }] },
    { parts: [{ type: "text" }] },
  ]
  const tokensIn = estimateTokens(stale)
  const cap = capStaleToolOutputs(messages)
  const after = messages[0]?.parts[0]?.state?.output ?? stale
  const tokensOut = estimateTokens(after)
  const rows: LoggingAccuracyRow[] = []
  if (cap.tokensSaved > 0) {
    pushAccuracy(rows, "compact", cap.tokensSaved, stale, after)
  }
  return {
    tokensIn,
    tokensOut,
    tokensSaved: cap.tokensSaved,
    attribution: cap.tokensSaved > 0 ? { compact: cap.tokensSaved } : {},
    loggingAccuracy: rows,
    passed: cap.cappedCount > 0 && cap.tokensSaved > 0,
  }
}

function runCompressLarge(): ScenarioRun {
  const before = largeToolOutput()
  const result = compressOutputForTool("bash", before)
  const rows: LoggingAccuracyRow[] = []
  if (result.compressed) {
    pushAccuracy(rows, "compress", result.tokensSaved, before, result.output)
  }
  return {
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    tokensSaved: result.tokensSaved,
    attribution: result.compressed ? { compress: result.tokensSaved } : {},
    loggingAccuracy: rows,
    passed: result.compressed && result.tokensSaved > 0,
  }
}

function runConcise(): ScenarioRun {
  const outputTokens = 10_000
  const saved = estimateConcisenessSavings(outputTokens, 0)
  return {
    tokensIn: outputTokens,
    tokensOut: outputTokens - saved,
    tokensSaved: saved,
    attribution: saved > 0 ? { concise: saved } : {},
    loggingAccuracy: [],
    passed: saved > 0,
  }
}

function runPrecall(): ScenarioRun {
  const result = optimizeBashCommand("npm test")
  const saved = result.estimatedTokensSaved
  const cmd = String(result.args.command ?? "")
  const tokensIn = estimateTokens(cmd)
  return {
    tokensIn,
    tokensOut: Math.max(0, tokensIn - saved),
    tokensSaved: saved,
    attribution: saved > 0 ? { precall: saved } : {},
    loggingAccuracy: [],
    passed: result.modified && saved > 0,
  }
}

function runPruneDuplicate(): ScenarioRun {
  const args = { path: "src/a.ts" }
  const dup = "a".repeat(1600)
  const messages: PruneMessage[] = [
    { parts: [{ type: "tool", callID: "c1", tool: "read", state: { status: "completed", input: args, output: dup } }] },
    { parts: [{ type: "tool", callID: "c2", tool: "read", state: { status: "completed", input: args, output: dup } }] },
  ]
  const tokensIn = estimateTokens(dup) * 2
  const prune = pruneMessageContext(messages)
  const after = messages.map((m) => m.parts.map((p) => p.state?.output ?? "").join("")).join("")
  const tokensOut = estimateTokens(after)
  const rows: LoggingAccuracyRow[] = []
  if (prune.tokensSaved > 0) {
    pushAccuracy(rows, "prune", prune.tokensSaved, dup + dup, after)
  }
  return {
    tokensIn,
    tokensOut,
    tokensSaved: prune.tokensSaved,
    attribution: prune.tokensSaved > 0 ? { prune: prune.tokensSaved } : {},
    loggingAccuracy: rows,
    passed: prune.prunedCount > 0,
  }
}

async function runSmartRead(): Promise<ScenarioRun> {
  const tokensIn = estimateTokens(TYPESCRIPT_FIXTURE)
  const symbols = await extractSymbols(TYPESCRIPT_FIXTURE, "math.ts")
  const output = symbols ?? TYPESCRIPT_FIXTURE
  const tokensOut = estimateTokens(output)
  const saved = Math.max(0, tokensIn - tokensOut)
  const rows: LoggingAccuracyRow[] = []
  if (saved > 0) {
    pushAccuracy(rows, "smart_read", saved, TYPESCRIPT_FIXTURE, output)
  }
  return {
    tokensIn,
    tokensOut,
    tokensSaved: saved,
    attribution: saved > 0 ? { smart_read: saved } : {},
    loggingAccuracy: rows,
    passed: saved > 0,
  }
}

function runTrimFileList(): ScenarioRun {
  const files = TRIM_CANDIDATES.map((f) => ({
    path: f.path,
    content: f.content,
    language: "typescript",
    tokens: estimateTokens(f.content),
  }))
  const tokensIn = files.reduce((sum, f) => sum + f.tokens, 0)
  const result = trimFiles(files, "implement user login authentication flow", { maxTokens: 4096 })
  const kept = result.files.map((f) => f.content).join("\n")
  const tokensOut = estimateTokens(kept)
  const saved = result.tokensSaved
  const rows: LoggingAccuracyRow[] = []
  if (saved > 0) {
    pushAccuracy(rows, "trim", saved, files.map((f) => f.content).join("\n"), kept)
  }
  return {
    tokensIn,
    tokensOut,
    tokensSaved: saved,
    attribution: saved > 0 ? { trim: saved } : {},
    loggingAccuracy: rows,
    passed: saved > 0 && result.filesOut < result.filesIn,
  }
}

async function runScenarioRaw(taskId: TaskId): Promise<ScenarioRun> {
  switch (taskId) {
    case "compact-stale-tool-output":
      return runCompactStale()
    case "compress-large-output":
      return runCompressLarge()
    case "concise-10000-tokens":
      return runConcise()
    case "precall-npm-test":
      return runPrecall()
    case "prune-duplicate-tool-call":
      return runPruneDuplicate()
    case "smart-read-typescript":
      return runSmartRead()
    case "trim-file-list":
      return runTrimFileList()
  }
}

function filterAttribution(adapterId: AdapterId, taskId: TaskId, raw: ScenarioRun): ScenarioRun {
  if (adapterId === "cursor" && taskId === "compress-large-output") {
    return {
      ...raw,
      tokensSaved: 0,
      tokensOut: raw.tokensIn,
      attribution: {},
      loggingAccuracy: [],
      passed: true,
      skipReason: "compress unavailable on Cursor built-in tools",
    }
  }

  if (adapterId === "baseline") {
    return {
      tokensIn: raw.tokensIn,
      tokensOut: raw.tokensIn,
      tokensSaved: 0,
      attribution: {},
      loggingAccuracy: [],
      passed: true,
    }
  }

  const attribution: Partial<Record<SavingsSource, number>> = {}
  let tokensSaved = 0
  for (const [source, value] of Object.entries(raw.attribution) as Array<[SavingsSource, number]>) {
    if (enabled(adapterId, source)) {
      attribution[source] = value
      tokensSaved += value
    }
  }

  const loggingAccuracy = raw.loggingAccuracy.filter((row) => enabled(adapterId, row.source))
  const tokensOut = Math.max(0, raw.tokensIn - tokensSaved)
  const passed = raw.skipReason ? true : tokensSaved > 0

  return {
    ...raw,
    tokensOut,
    tokensSaved,
    attribution,
    loggingAccuracy,
    passed,
    skipReason: raw.skipReason,
  }
}

export async function runAdapterTask(adapterId: AdapterId, taskId: TaskId): Promise<RunResult> {
  const raw = await runScenarioRaw(taskId)
  const filtered = filterAttribution(adapterId, taskId, raw)
  const costSaved = Object.values(filtered.attribution).reduce((sum, tok) => sum + estimateCost(tok ?? 0, "default"), 0)

  const accuracyFails = filtered.loggingAccuracy.filter(
    (row) => MEASURED_SOURCES.has(row.source) && row.deltaPercent > 10,
  )

  return {
    runId: `${adapterId}::${taskId}`,
    adapterId,
    taskId,
    mode: "deterministic",
    status: filtered.passed && accuracyFails.length === 0 ? "passed" : "failed",
    tokensIn: filtered.tokensIn,
    tokensOut: filtered.tokensOut,
    tokensCache: 0,
    tokensSaved: filtered.tokensSaved,
    costSaved,
    durationMs: 0,
    overheadMs: 0,
    mechanismAttribution: filtered.attribution,
    loggingAccuracy: filtered.loggingAccuracy,
    skipReason: filtered.skipReason,
  }
}

export const BENCH_ADAPTERS: AdapterId[] = [
  "baseline",
  "precall",
  "compress",
  "prune",
  "compact",
  "smart_read",
  "trim",
  "concise",
  "ctxlite-all",
  "claude-code",
  "cursor",
]
