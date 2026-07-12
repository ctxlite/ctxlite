import { z } from "zod"
import { summarizeLog, logOptimizationSavings } from "@ctxlite/core"
import { STATS_DB_PATH, MCP_PROCESS_SESSION_ID } from "../shared.js"

export const logSummarySchema = z.object({
  text: z.string().describe("Build/test/log text to compress"),
  budget: z.number().int().positive().optional().describe("Max summary tokens (default 2000)"),
})

export async function handleLogSummary(args: z.infer<typeof logSummarySchema>): Promise<string> {
  try {
    const options: Parameters<typeof summarizeLog>[0] = { text: args.text }
    if (args.budget !== undefined) {
      options.budget = args.budget
    }
    const result = summarizeLog(options)

    if (result.tokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "log_summary",
          upstream: "log_summary",
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          host: "mcp",
          sessionId: MCP_PROCESS_SESSION_ID,
        },
        STATS_DB_PATH,
      )
    }

    return result.output
  } catch (err) {
    return `log_summary error: ${err instanceof Error ? err.message : String(err)}`
  }
}
