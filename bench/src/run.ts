#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { CANONICAL_TASK_IDS } from "../scenarios/index.js"
import { BENCH_ADAPTERS, runAdapterTask } from "./engine.js"
import { buildSummary, formatReportText } from "./report.js"
import type { AdapterId, PinnedBaselineComparison } from "./types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const benchRoot = join(__dirname, "..")
const baselinePath = join(benchRoot, "baseline", "summary.json")

function parseArgs(argv: string[]): { adapters: AdapterId[] } {
  const adapters = [...BENCH_ADAPTERS]
  const onlyIdx = argv.indexOf("--adapter")
  if (onlyIdx >= 0 && argv[onlyIdx + 1]) {
    return { adapters: [argv[onlyIdx + 1] as AdapterId] }
  }
  return { adapters }
}

function loadPinnedBaseline(): PinnedBaselineComparison {
  const raw = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    baselineComparison: PinnedBaselineComparison
  }
  return raw.baselineComparison
}

async function main(): Promise<void> {
  const { adapters } = parseArgs(process.argv.slice(2))
  const pinned = loadPinnedBaseline()
  const runs = []

  for (const adapterId of adapters) {
    for (const taskId of CANONICAL_TASK_IDS) {
      runs.push(await runAdapterTask(adapterId, taskId))
    }
  }

  const summary = buildSummary(runs, pinned)
  const stamp = summary.timestamp.replace(/[:.]/g, "-")
  const outDir = join(benchRoot, "results", stamp)
  mkdirSync(join(outDir, "runs"), { recursive: true })

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2))
  writeFileSync(join(outDir, "report.txt"), formatReportText(summary))

  for (const run of runs) {
    writeFileSync(join(outDir, "runs", `${run.runId}.json`), JSON.stringify(run, null, 2))
  }

  console.log(formatReportText(summary))

  if (summary.regressionVerdict.verdict !== "pass") {
    process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
