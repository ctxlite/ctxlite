import { buildStatsBreakdown, formatTokenCount, renderStatsBarChart, type Summary } from "@ctxlite/core"

export function formatText(summary: Summary): string {
  if (summary.totalRequests === 0) {
    return `\nctxlite stats — ${summary.period}\n\nNo data recorded yet.\n`
  }

  const chart = renderStatsBarChart(buildStatsBreakdown(summary))
    .map((line) => `  ${line}`)
    .join("\n")

  return `
ctxlite stats — ${summary.period}
─────────────────────────────────────
Tokens saved  ${formatTokenCount(summary.tokensSaved)} of ${formatTokenCount(summary.tokensBefore)} (${summary.savingsPercent.toFixed(1)}%)

${chart}

Cost saved    ~$${summary.costSaved.toFixed(4)}
Avg latency   ${summary.avgLatencyMs}ms
─────────────────────────────────────
`.trimStart()
}

export interface JsonExport {
  period: string
  generatedAt: string
  totalRequests: number
  trimmedRequests: number
  concisenessRequests: number
  compressRequests: number
  pruneRequests: number
  precallRequests: number
  tokensSaved: number
  trimTokensSaved: number
  concisenessTokensSaved: number
  compressTokensSaved: number
  pruneTokensSaved: number
  precallTokensSaved: number
  tokensBefore: number
  savingsPercent: number
  costSavedUsd: number
  avgLatencyMs: number
}

export function formatJson(summary: Summary): string {
  const out: JsonExport = {
    period: summary.period,
    generatedAt: new Date().toISOString(),
    totalRequests: summary.totalRequests,
    trimmedRequests: summary.trimmedRequests,
    concisenessRequests: summary.concisenessRequests,
    compressRequests: summary.compressRequests,
    pruneRequests: summary.pruneRequests,
    precallRequests: summary.precallRequests,
    tokensSaved: summary.tokensSaved,
    trimTokensSaved: summary.trimTokensSaved,
    concisenessTokensSaved: summary.concisenessTokensSaved,
    compressTokensSaved: summary.compressTokensSaved,
    pruneTokensSaved: summary.pruneTokensSaved,
    precallTokensSaved: summary.precallTokensSaved,
    tokensBefore: summary.tokensBefore,
    savingsPercent: summary.savingsPercent,
    costSavedUsd: summary.costSaved,
    avgLatencyMs: summary.avgLatencyMs,
  }
  return JSON.stringify(out, null, 2)
}
