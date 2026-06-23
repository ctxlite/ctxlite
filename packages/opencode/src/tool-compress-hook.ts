import { compressOutputForTool, logOptimizationSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"
import { takePrecallPending } from "./precall-state.js"

const SKIP_TOOLS = new Set(["get_stats", "trim_context", "smart_read"])

/**
 * Compresses tool output after execution and logs savings to stats.db.
 */
export function createToolCompressHook(): (
  input: { tool: string; sessionID: string; callID: string },
  output: { title: string; output: string; metadata: unknown },
) => Promise<void> {
  const dbPath = getStatsDbPath()

  return async (input, output) => {
    if (SKIP_TOOLS.has(input.tool) || !output.output) {
      return
    }

    const precall = takePrecallPending(input.sessionID, input.callID)
    if (precall && precall.estimatedTokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "precall",
          upstream: input.tool,
          tokensIn: precall.estimatedTokensSaved,
          tokensOut: 0,
          id: `precall-${input.callID}`,
          host: "opencode",
          sessionId: input.sessionID,
        },
        dbPath,
      )
    }

    const result = compressOutputForTool(input.tool, output.output)
    if (!result.compressed) {
      return
    }

    output.output = result.output
    logOptimizationSavings(
      {
        source: "compress",
        upstream: "opencode",
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        id: `compress-${input.callID}`,
        host: "opencode",
        sessionId: input.sessionID,
      },
      dbPath,
    )
  }
}
