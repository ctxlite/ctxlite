import { z } from "zod"
import { searchCodebase, formatCodeSearchOutput, logOptimizationSavings, estimateTokens } from "@ctxlite/core"
import { STATS_DB_PATH, MCP_PROCESS_SESSION_ID } from "../shared.js"

export const codeSearchSchema = z.object({
  query: z.string().min(1).describe("Natural-language or symbol search query"),
  maxResults: z.number().int().min(1).max(20).optional().describe("Max hits (default 5)"),
  snippetBudget: z.number().int().positive().optional().describe("Tokens per snippet (default 400)"),
  root: z.string().optional().describe("Workspace root (default MCP server cwd)"),
})

export async function handleCodeSearch(args: z.infer<typeof codeSearchSchema>): Promise<string> {
  try {
    const options: Parameters<typeof searchCodebase>[0] = {
      query: args.query,
      root: args.root ?? process.cwd(),
    }
    if (args.maxResults !== undefined) {
      options.maxResults = args.maxResults
    }
    if (args.snippetBudget !== undefined) {
      options.snippetBudget = args.snippetBudget
    }
    const result = await searchCodebase(options)

    const output = formatCodeSearchOutput(args.query, result.hits)
    const tokensOut = estimateTokens(output)

    if (result.tokensSaved > 0) {
      logOptimizationSavings(
        {
          source: "code_search",
          upstream: args.query,
          tokensIn: tokensOut + result.tokensSaved,
          tokensOut,
          host: "mcp",
          sessionId: MCP_PROCESS_SESSION_ID,
        },
        STATS_DB_PATH,
      )
    }

    return output
  } catch (err) {
    return `code_search error: ${err instanceof Error ? err.message : String(err)}`
  }
}
