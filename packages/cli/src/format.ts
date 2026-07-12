import {
  buildStatsBreakdown,
  formatSavingsLine,
  formatTokenCount,
  hasStableSavingsBaseline,
  renderStatsBarChart,
  renderStatsHelpLines,
  SUPPORT_LINE,
  type Summary,
} from "@ctxlite/core"

export interface FormatTextOptions {
  host?: string
}

export function formatText(summary: Summary, options?: FormatTextOptions): string {
  if (summary.totalRequests === 0) {
    return `\nctxlite stats — ${summary.period}\n\nNo data recorded yet.\n`
  }

  const chart = renderStatsBarChart(buildStatsBreakdown(summary))
    .map((line) => `  ${line}`)
    .join("\n")

  const helpLines = renderStatsHelpLines(summary, options?.host)
  const helpBlock =
    helpLines.length > 0 ? `${helpLines.map((line) => `  ${line}`).join("\n")}\n\n` : ""

  return `
ctxlite stats — ${summary.period}
─────────────────────────────────────
Tokens saved  ${formatSavingsLine(summary)}

${chart}

${helpBlock}Cost saved    ~$${summary.costSaved.toFixed(4)}
Avg latency   ${summary.avgLatencyMs}ms
─────────────────────────────────────
${SUPPORT_LINE}
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
  compactRequests: number
  compactTokensSaved: number
  smartReadRequests: number
  smartReadTokensSaved: number
  realtimeTokensSaved: number
  sessionTurnCount: number
  tokensBefore: number
  savingsPercent: number
  savingsPercentStable: boolean
  costSavedUsd: number
  avgLatencyMs: number
  breakdown: Array<{
    label: string
    tokensSaved: number
    count: number
    measurementKind: "measured" | "estimate"
  }>
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
    compactRequests: summary.compactRequests,
    compactTokensSaved: summary.compactTokensSaved,
    smartReadRequests: summary.smartReadRequests,
    smartReadTokensSaved: summary.smartReadTokensSaved,
    realtimeTokensSaved: summary.realtimeTokensSaved,
    sessionTurnCount: summary.sessionTurnCount,
    tokensBefore: summary.tokensBefore,
    savingsPercent: summary.savingsPercent,
    savingsPercentStable: hasStableSavingsBaseline(summary),
    costSavedUsd: summary.costSaved,
    avgLatencyMs: summary.avgLatencyMs,
    breakdown: buildStatsBreakdown(summary).map((row) => ({
      label: row.label,
      tokensSaved: row.tokensSaved,
      count: row.count,
      measurementKind: row.measurementKind,
    })),
  }
  return JSON.stringify(out, null, 2)
}
