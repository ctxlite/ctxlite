// Shared stats-report rendering — used by CLI, OpenCode, and MCP `get_stats`
// so all three surfaces show the same breakdown bar chart.

import type { Summary } from "./types.js"

export interface StatsBreakdownRow {
  label: string
  tokensSaved: number
  count: number
  countLabel: string
}

export function buildStatsBreakdown(summary: Summary): StatsBreakdownRow[] {
  return [
    {
      label: "precall",
      tokensSaved: summary.precallTokensSaved,
      count: summary.precallRequests,
      countLabel: "rewrites/blocks",
    },
    {
      label: "compress",
      tokensSaved: summary.compressTokensSaved,
      count: summary.compressRequests,
      countLabel: "tool outputs",
    },
    {
      label: "prune",
      tokensSaved: summary.pruneTokensSaved,
      count: summary.pruneRequests,
      countLabel: "context passes",
    },
    {
      label: "compact",
      tokensSaved: summary.compactTokensSaved,
      count: summary.compactRequests,
      countLabel: "stale outputs",
    },
    {
      label: "trim",
      tokensSaved: summary.trimTokensSaved,
      count: summary.trimmedRequests,
      countLabel: "calls",
    },
    {
      label: "concise",
      tokensSaved: summary.concisenessTokensSaved,
      count: summary.concisenessRequests,
      countLabel: "responses",
    },
  ]
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

/**
 * "X of Y (Z%)", or a baseline notice when no session traffic has been
 * tracked yet (sessionTokensUsed === 0) — otherwise savingsPercent reads as
 * a misleading 100%, since tokensBefore degrades to just tokensSaved.
 */
export function formatSavingsLine(summary: Summary): string {
  if (summary.sessionTokensUsed === 0) {
    return `${formatTokenCount(summary.tokensSaved)} saved (no session baseline yet)`
  }
  return `${formatTokenCount(summary.tokensSaved)} of ${formatTokenCount(summary.tokensBefore)} (${summary.savingsPercent.toFixed(1)}%)`
}

const BAR_WIDTH = 20
const BAR_FILLED = "█"
const BAR_EMPTY = "░"

/** Renders a fixed-width ASCII bar chart, one line per breakdown row. */
export function renderStatsBarChart(rows: StatsBreakdownRow[]): string[] {
  const max = Math.max(1, ...rows.map((r) => r.tokensSaved))
  const labelWidth = Math.max(...rows.map((r) => r.label.length))
  const tokenWidth = Math.max(...rows.map((r) => formatTokenCount(r.tokensSaved).length))

  return rows.map((r) => {
    const filled = Math.round((r.tokensSaved / max) * BAR_WIDTH)
    const bar = BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled)
    const label = r.label.padEnd(labelWidth)
    const tokens = formatTokenCount(r.tokensSaved).padStart(tokenWidth)
    return `${label}  ${bar}  ${tokens}  (${r.count} ${r.countLabel})`
  })
}
