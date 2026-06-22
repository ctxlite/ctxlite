import type { Summary } from "@ctxlite/core"

export function formatText(summary: Summary): string {
  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return `${n}`
  }

  if (summary.totalRequests === 0) {
    return `\nctxlite stats — ${summary.period}\n\nNo data recorded yet.\n`
  }

  return `
ctxlite stats — ${summary.period}
─────────────────────────────────────
Tokens saved  ${formatTokens(summary.tokensSaved)} total
  precall     ${formatTokens(summary.precallTokensSaved)} (${summary.precallRequests} rewrites/blocks)
  compress    ${formatTokens(summary.compressTokensSaved)} (${summary.compressRequests} tool outputs)
  prune       ${formatTokens(summary.pruneTokensSaved)} (${summary.pruneRequests} context passes)
  trim        ${formatTokens(summary.trimTokensSaved)} (${summary.trimmedRequests} calls)
  concise     ${formatTokens(summary.concisenessTokensSaved)} (${summary.concisenessRequests} responses)
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
    costSavedUsd: summary.costSaved,
    avgLatencyMs: summary.avgLatencyMs,
  }
  return JSON.stringify(out, null, 2)
}
