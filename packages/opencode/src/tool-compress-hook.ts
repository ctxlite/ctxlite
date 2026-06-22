import { compressToolOutput, logOptimizationSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

const SKIP_TOOLS = new Set(["get_stats", "trim_context"])

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

    const result = compressToolOutput(output.output)
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
      },
      dbPath,
    )
  }
}
