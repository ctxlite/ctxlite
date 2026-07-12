import { BENCH_ADAPTERS, runAdapterTask } from "../src/engine.js"
import { CANONICAL_TASK_IDS } from "../scenarios/index.js"
import { computeBaselineComparison } from "../src/report.js"

async function main(): Promise<void> {
  const runs = []
  for (const adapterId of BENCH_ADAPTERS) {
    for (const taskId of CANONICAL_TASK_IDS) {
      runs.push(await runAdapterTask(adapterId, taskId))
    }
  }
  console.log(JSON.stringify(computeBaselineComparison(runs), null, 2))
}

main().catch(console.error)
