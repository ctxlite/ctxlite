import { pruneMessageContext, logOptimizationSavings, type PruneMessage } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

/**
 * Prunes duplicate tool outputs from conversation context before each LLM request.
 */
export function createMessagesTransformHook(): (
  _input: Record<string, never>,
  output: { messages: PruneMessage[] },
) => Promise<void> {
  const dbPath = getStatsDbPath()

  return async (_input, output) => {
    const result = pruneMessageContext(output.messages)
    if (result.prunedCount === 0 || result.tokensSaved <= 0) {
      return
    }

    logOptimizationSavings(
      {
        source: "prune",
        upstream: "opencode",
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        id: `prune-${Date.now()}-${result.prunedCount}`,
      },
      dbPath,
    )
  }
}
