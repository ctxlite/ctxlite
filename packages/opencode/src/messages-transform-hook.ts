import { capStaleToolOutputs, pruneMessageContext, logOptimizationSavings, type PruneMessage } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

/**
 * Prunes duplicate tool outputs, then caps large stale ones, from
 * conversation context before each LLM request.
 */
export function createMessagesTransformHook(): (
  _input: Record<string, never>,
  output: { messages: PruneMessage[] },
) => Promise<void> {
  const dbPath = getStatsDbPath()

  return async (_input, output) => {
    const pruneResult = pruneMessageContext(output.messages)
    if (pruneResult.prunedCount > 0 && pruneResult.tokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "prune",
          upstream: "opencode",
          tokensIn: pruneResult.tokensIn,
          tokensOut: pruneResult.tokensOut,
          id: `prune-${Date.now()}-${pruneResult.prunedCount}`,
        },
        dbPath,
      )
    }

    const capResult = capStaleToolOutputs(output.messages)
    if (capResult.cappedCount > 0 && capResult.tokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "compact",
          upstream: "opencode",
          tokensIn: capResult.tokensIn,
          tokensOut: capResult.tokensOut,
          id: `compact-${Date.now()}-${capResult.cappedCount}`,
        },
        dbPath,
      )
    }
  }
}
