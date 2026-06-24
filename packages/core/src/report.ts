// Shared stats-report rendering — used by CLI, OpenCode, and MCP `get_stats`
// so all three surfaces show the same breakdown bar chart.

import type { SessionBreakdownRow, Summary } from "./types.js"

/**
 * Support-link line shown after every stats report (CLI, OpenCode
 * get_stats, MCP get_stats). Required by LICENSE's Support Link Retention
 * Condition — keep this exact URL if you ever edit the wording.
 */
export const SUPPORT_LINE = "If ctxlite is saving you tokens: https://ko-fi.com/techdebeci"

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
      label: "smart_read",
      tokensSaved: summary.smartReadTokensSaved,
      count: summary.smartReadRequests,
      countLabel: "file reads",
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
 * a misleading 100%, since tokensBefore would degrade to just
 * realtimeTokensSaved. Uses realtimeTokensSaved (excludes trim_context), not
 * tokensSaved, to match what tokensBefore/savingsPercent are actually based
 * on — trim_context's number is still visible on its own in the breakdown.
 */
export function formatSavingsLine(summary: Summary): string {
  if (summary.sessionTokensUsed === 0) {
    return `${formatTokenCount(summary.tokensSaved)} saved (no session baseline yet)`
  }
  return `${formatTokenCount(summary.realtimeTokensSaved)} of ${formatTokenCount(summary.tokensBefore)} (${summary.savingsPercent.toFixed(1)}%)`
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

const HOST_LABELS: Record<string, string> = {
  opencode: "OpenCode",
  "claude-code": "Claude Code",
  cursor: "Cursor",
  mcp: "MCP",
}

export function hostLabel(host: string): string {
  return HOST_LABELS[host] ?? host
}

/**
 * Groups session rows by host (assumes input is already sorted by host,
 * then most-recent-first — see StatsStore.sessionBreakdown), rendering one
 * line per session: id, tokens saved, request count, and when it was last
 * active.
 */
export function renderSessionBreakdown(rows: SessionBreakdownRow[]): string[] {
  if (rows.length === 0) {
    return ["No sessions recorded yet."]
  }

  const idWidth = Math.max(...rows.map((r) => (r.sessionId ?? "").length))
  const tokenWidth = Math.max(...rows.map((r) => formatTokenCount(r.tokensSaved).length))

  const lines: string[] = []
  let currentHost: string | null = null

  for (const row of rows) {
    if (row.host !== currentHost) {
      if (currentHost !== null) {
        lines.push("")
      }
      lines.push(hostLabel(row.host))
      currentHost = row.host
    }

    const id = (row.sessionId ?? "").padEnd(idWidth)
    const tokens = formatTokenCount(row.tokensSaved).padStart(tokenWidth)
    const lastActive = new Date(row.lastTs * 1000).toLocaleString()
    lines.push(`  ${id}  ${tokens} saved  (${row.totalRequests} requests)  last active ${lastActive}`)
  }

  return lines
}

/** Same "ctxlite · X of Y (Z%)" + bar chart + cost line shown by get_stats, without the boxed header — for embedding under a session listing. */
export function renderCompactSummary(summary: Summary): string[] {
  if (summary.totalRequests === 0) {
    return ["No data recorded yet."]
  }

  return [
    `ctxlite · ${formatSavingsLine(summary)}`,
    ...renderStatsBarChart(buildStatsBreakdown(summary)),
    `~$${summary.costSaved.toFixed(4)} saved`,
    SUPPORT_LINE,
  ]
}

/**
 * Same grouping as renderSessionBreakdown, but with the full per-source bar
 * chart indented underneath each session instead of just a token total.
 */
export function renderSessionBreakdownDetailed(
  entries: Array<{ row: SessionBreakdownRow; summary: Summary }>,
): string[] {
  if (entries.length === 0) {
    return ["No sessions recorded yet."]
  }

  const lines: string[] = []
  let currentHost: string | null = null

  for (const { row, summary } of entries) {
    if (row.host !== currentHost) {
      if (currentHost !== null) {
        lines.push("")
      }
      lines.push(hostLabel(row.host))
      currentHost = row.host
    }

    const lastActive = new Date(row.lastTs * 1000).toLocaleString()
    lines.push(`  ${row.sessionId ?? ""}  (${row.totalRequests} requests)  last active ${lastActive}`)
    for (const line of renderCompactSummary(summary)) {
      lines.push(`    ${line}`)
    }
    lines.push("")
  }

  if (lines.at(-1) === "") {
    lines.pop()
  }

  return lines
}
