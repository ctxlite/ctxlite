import { isAbsolute, join } from "node:path"
import { readFile } from "node:fs/promises"
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { compressToolOutput, estimateTokens, extractSymbols, logOptimizationSavings, supportsSymbols } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

const DEFAULT_BUDGET_TOKENS = 1500

/**
 * Tool `smart_read` — reads a file itself (the agent never has to read it
 * raw first) and returns declaration signatures with bodies omitted for
 * supported languages, or a budgeted head/tail read otherwise.
 */
export const smartReadTool: ToolDefinition = tool({
  description: `Reads a source file and returns its shape — function, method, and class signatures with implementation bodies omitted — instead of the full content. Falls back to a budgeted head/tail read for languages without symbol support. Prefer this over the regular read tool when you need to understand a file's structure or API, not modify it line by line; use the regular read tool when you need exact existing content to edit.`,

  args: {
    path: tool.schema.string().describe("File path, relative to the project directory or absolute."),
    budget: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe(`Max tokens for the fallback budgeted read when symbol extraction isn't available. Default: ${DEFAULT_BUDGET_TOKENS}`),
  },

  async execute({ path, budget = DEFAULT_BUDGET_TOKENS }, context) {
    const absPath = isAbsolute(path) ? path : join(context.directory, path)
    const content = await readFile(absPath, "utf8")
    const tokensIn = estimateTokens(content)
    const dbPath = getStatsDbPath()

    if (supportsSymbols(absPath)) {
      const symbols = await extractSymbols(content, absPath)
      if (symbols !== null) {
        const tokensOut = estimateTokens(symbols)
        if (tokensOut < tokensIn) {
          logOptimizationSavings({ source: "smart_read", upstream: "opencode", tokensIn, tokensOut }, dbPath)
        }
        return { title: `smart_read ${path} (symbols)`, output: symbols }
      }
    }

    const result = compressToolOutput(content, { minTokens: 1, maxChars: budget * 4 })
    if (result.compressed) {
      logOptimizationSavings(
        { source: "smart_read", upstream: "opencode", tokensIn: result.tokensIn, tokensOut: result.tokensOut },
        dbPath,
      )
    }
    return { title: `smart_read ${path} (budgeted)`, output: result.output }
  },
})
