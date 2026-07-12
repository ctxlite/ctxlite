import { z } from "zod"
import { diffRead, logOptimizationSavings } from "@ctxlite/core"
import { STATS_DB_PATH, MCP_PROCESS_SESSION_ID } from "../shared.js"

export const diffReadSchema = z.object({
  path: z.string().describe("File path (absolute or relative to MCP server cwd)"),
  diff: z.string().describe("Unified diff text with at least one hunk"),
  contextLines: z.number().int().min(0).max(20).optional().describe("Surrounding context lines per hunk (default 3)"),
  budget: z.number().int().positive().optional().describe("Max output tokens (default 1500)"),
})

export async function handleDiffRead(args: z.infer<typeof diffReadSchema>): Promise<string> {
  try {
    const options: Parameters<typeof diffRead>[0] = {
      path: args.path,
      diff: args.diff,
      cwd: process.cwd(),
    }
    if (args.contextLines !== undefined) {
      options.contextLines = args.contextLines
    }
    if (args.budget !== undefined) {
      options.budget = args.budget
    }
    const result = await diffRead(options)

    if (result.tokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "diff_read",
          upstream: args.path,
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
    return `diff_read error: ${err instanceof Error ? err.message : String(err)}`
  }
}
