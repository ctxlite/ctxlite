import { z } from "zod"
import { StatsStore, buildStatsBreakdown, formatSavingsLine, renderStatsBarChart } from "@ctxlite/core"
import { STATS_DB_PATH } from "../shared.js"

export const getStatsSchema = z.object({
  period: z
    .enum(["session", "today", "7d", "30d", "all"])
    .optional()
    .describe("Time period. Default: all"),
})

export async function handleGetStats(args: z.infer<typeof getStatsSchema>): Promise<string> {
  const period = args.period ?? "all"
  let store: StatsStore | null = null

  try {
    store = new StatsStore(STATS_DB_PATH)
    const since = periodToTimestamp(period)
    const summary = store.summary(since)

    if (summary.totalRequests === 0) {
      return `## ctxlite stats — ${period}\n\nNo requests recorded yet.`
    }

    const chart = renderStatsBarChart(buildStatsBreakdown(summary)).join("\n")

    return [
      `## ctxlite stats — ${period}`,
      ``,
      `**Tokens saved:** ${formatSavingsLine(summary)}`,
      "```",
      chart,
      "```",
      `**Est. cost saved:** $${summary.costSaved.toFixed(4)}`,
    ].join("\n")
  } catch (err) {
    return `ctxlite stats unavailable: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    store?.close()
  }
}

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
