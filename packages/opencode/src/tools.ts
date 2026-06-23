import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import {
  StatsStore,
  buildStatsBreakdown,
  detectLanguage,
  estimateTokens,
  formatSavingsLine,
  logTrimResult,
  renderStatsBarChart,
  trimFiles,
} from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

/**
 * Tool `get_stats` — session token savings report.
 */
export const getStatsTool: ToolDefinition = tool({
  description: `Returns ctxlite token savings statistics for the current session, or a specified time period across all sessions.
Call this when the user asks about token usage, savings, costs, or ctxlite performance.
Returns a formatted report with: total requests, tokens saved, estimated cost saved.`,

  args: {
    period: tool.schema
      .enum(["session", "today", "7d", "30d", "all"])
      .optional()
      .describe("Time period for stats, across all sessions. Default: current session only."),
  },

  async execute({ period }, context) {
    let store: StatsStore | null = null

    try {
      store = new StatsStore(getStatsDbPath())

      const label = period ?? "current session"
      const summary = period ? store.summary(periodToTimestamp(period)) : store.summaryForSession("opencode", context.sessionID)

      if (summary.totalRequests === 0) {
        return `## ctxlite stats — ${label}\n\nNo requests recorded yet for this period.`
      }

      const chart = renderStatsBarChart(buildStatsBreakdown(summary)).join("\n")

      const lines = [
        `## ctxlite stats — ${label}`,
        ``,
        `**Tokens saved:** ${formatSavingsLine(summary)}`,
        "```",
        chart,
        "```",
        `**Estimated cost saved:** $${summary.costSaved.toFixed(4)}`,
      ]

      if (summary.avgLatencyMs > 0) {
        lines.push(`**Avg trim latency:** ${summary.avgLatencyMs}ms`)
      }

      return lines.join("\n")
    } catch (err) {
      return `ctxlite stats unavailable: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      store?.close()
    }
  },
})

/**
 * Tool `trim_context` — explicit file trimming before large tasks.
 */
export const trimContextTool: ToolDefinition = tool({
  description: `Analyzes a list of files and returns only the most relevant ones for the current task.
Use this before a large refactoring or analysis task to reduce token usage.
Provide the files you're considering including and your current task description.`,

  args: {
    files: tool.schema
      .array(
        tool.schema.object({
          path: tool.schema.string().describe("Relative file path"),
          content: tool.schema.string().describe("File content"),
        }),
      )
      .describe("Files to analyze"),
    query: tool.schema.string().describe("Description of the current task"),
    maxTokens: tool.schema
      .number()
      .optional()
      .describe("Maximum tokens budget for selected files. Default: 4096"),
  },

  async execute({ files, query, maxTokens = 4096 }, context) {
    const codeFiles = files.map((f) => ({
      path: f.path,
      content: f.content,
      language: detectLanguage(f.path),
      tokens: estimateTokens(f.content),
    }))

    const result = trimFiles(codeFiles, query, { maxTokens })
    logTrimResult(result, "opencode", getStatsDbPath(), context.sessionID)

    if (result.tokensSaved === 0) {
      return `All ${files.length} files are relevant — no trimming needed.`
    }

    const selectedPaths = result.files.map((f) => `- \`${f.path}\``).join("\n")
    const excludedPaths = codeFiles
      .filter((f) => !result.files.find((s) => s.path === f.path))
      .map((f) => `- \`${f.path}\``)
      .join("\n")

    return [
      `## trim_context result`,
      ``,
      `**Selected** (${result.filesOut}/${result.filesIn} files, ${result.tokensOut} tokens):`,
      selectedPaths,
      ``,
      `**Excluded** (saved ${result.tokensSaved} tokens, -${Math.round(result.trimRatio * 100)}%):`,
      excludedPaths,
    ].join("\n")
  },
})

function periodToTimestamp(period: string): number {
  const now = Math.floor(Date.now() / 1000)
  switch (period) {
    case "session":
      return now - 3600
    case "today": {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return Math.floor(d.getTime() / 1000)
    }
    case "7d":
      return now - 7 * 86400
    case "30d":
      return now - 30 * 86400
    case "all":
      return 0
    default:
      return now - 86400
  }
}
