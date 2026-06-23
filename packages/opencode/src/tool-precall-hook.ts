import { optimizeToolArgs, logOptimizationSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"
import { markPrecallPending } from "./precall-state.js"

const SKIP_TOOLS = new Set(["get_stats", "trim_context", "smart_read"])

type BeforeOutput = {
  args: Record<string, unknown>
  result?: string
  error?: string
}

/**
 * Rewrites tool args before execution (quiet flags, blocked reads).
 */
export function createToolPrecallHook(): (
  input: { tool: string; sessionID: string; callID: string },
  output: BeforeOutput,
) => Promise<void> {
  const dbPath = getStatsDbPath()

  return async (input, output) => {
    if (SKIP_TOOLS.has(input.tool)) {
      return
    }

    const args = output.args ?? {}
    const result = optimizeToolArgs(input.tool, args)

    if (result.blocked) {
      output.result = `[ctxlite] ${result.blockReason ?? "Blocked by ctxlite pre-call filter."}`
      logOptimizationSavings(
        {
          source: "precall",
          upstream: input.tool,
          tokensIn: result.estimatedTokensSaved,
          tokensOut: 0,
          id: `precall-block-${input.callID}`,
        },
        dbPath,
      )
      return
    }

    if (!result.modified) {
      return
    }

    Object.assign(output.args, result.args)
    markPrecallPending(input.sessionID, input.callID, {
      estimatedTokensSaved: result.estimatedTokensSaved,
      ...(result.label !== undefined ? { label: result.label } : {}),
    })
  }
}
