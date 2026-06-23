import { isAbsolute, resolve } from "path"
import { readFile } from "fs/promises"
import { z } from "zod"
import { compressToolOutput, estimateTokens, extractSymbols, logOptimizationSavings, supportsSymbols } from "@ctxlite/core"
import { STATS_DB_PATH } from "../shared.js"

const DEFAULT_BUDGET_TOKENS = 1500

export const smartReadSchema = z.object({
  path: z
    .string()
    .describe("File path to read. Absolute paths are safest — relative paths resolve against the MCP server's working directory, which may not match your workspace root."),
  budget: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Max tokens for the fallback budgeted read when symbol extraction isn't available. Default: ${DEFAULT_BUDGET_TOKENS}`),
})

/**
 * Reads a file itself (no pre-read content required, unlike trim_context)
 * and returns declaration signatures with bodies blanked for supported
 * languages, or a budgeted head/tail read otherwise.
 */
export async function handleSmartRead(args: z.infer<typeof smartReadSchema>): Promise<string> {
  const { path, budget = DEFAULT_BUDGET_TOKENS } = args
  const absPath = isAbsolute(path) ? path : resolve(process.cwd(), path)

  const content = await readFile(absPath, "utf8")
  const tokensIn = estimateTokens(content)

  if (supportsSymbols(absPath)) {
    const symbols = await extractSymbols(content, absPath)
    if (symbols !== null) {
      const tokensOut = estimateTokens(symbols)
      if (tokensOut < tokensIn) {
        logOptimizationSavings({ source: "smart_read", upstream: "mcp", tokensIn, tokensOut }, STATS_DB_PATH)
      }
      return [`## smart_read ${path} (symbols)`, "```", symbols, "```"].join("\n")
    }
  }

  const result = compressToolOutput(content, { minTokens: 1, maxChars: budget * 4 })
  if (result.compressed) {
    logOptimizationSavings(
      { source: "smart_read", upstream: "mcp", tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      STATS_DB_PATH,
    )
  }
  return [`## smart_read ${path} (budgeted)`, "```", result.output, "```"].join("\n")
}
