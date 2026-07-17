import type { Summary } from "@ctxlite/core"
import {
  buildStatsBreakdown,
  formatSavingsLine,
  formatTokenCount,
  hasStableSavingsBaseline,
  renderStatsBarChart,
  SUPPORT_LINE,
} from "@ctxlite/core"

export interface OpenCodeSessionDisplay {
  totalLine: string
  breakdownRows: string[]
  costLine: string | null
  hasBaseline: boolean
  supportLabel: string
  supportUrl: string
  tokensSaved: number
}

const TITLE_SUFFIX_PATTERN = / · ctxlite: .*$/

const SUPPORT_SEPARATOR_INDEX = SUPPORT_LINE.indexOf(": ")
const SUPPORT_LABEL =
  SUPPORT_SEPARATOR_INDEX === -1 ? SUPPORT_LINE : SUPPORT_LINE.slice(0, SUPPORT_SEPARATOR_INDEX)
const SUPPORT_URL =
  SUPPORT_SEPARATOR_INDEX === -1 ? "" : SUPPORT_LINE.slice(SUPPORT_SEPARATOR_INDEX + 2)

export function stripCtxliteTitleSuffix(title: string): string {
  return title.replace(TITLE_SUFFIX_PATTERN, "")
}

export function buildOpenCodeSessionTitle(baseTitle: string, tokensSaved: number): string {
  const base = stripCtxliteTitleSuffix(baseTitle)
  if (tokensSaved <= 0) return base
  return `${base} · ctxlite: ${formatTokenCount(tokensSaved)} saved`
}

export function buildOpenCodeSessionDisplay(summary: Summary): OpenCodeSessionDisplay {
  if (summary.tokensSaved <= 0) {
    return {
      totalLine: "no savings yet",
      breakdownRows: [],
      costLine: null,
      hasBaseline: false,
      supportLabel: "",
      supportUrl: "",
      tokensSaved: 0,
    }
  }

  const hasBaseline = hasStableSavingsBaseline(summary)
  return {
    totalLine: formatSavingsLine(summary),
    breakdownRows: renderStatsBarChart(buildStatsBreakdown(summary)),
    costLine: hasBaseline ? `~$${summary.costSaved.toFixed(4)} saved` : null,
    hasBaseline,
    supportLabel: SUPPORT_LABEL,
    supportUrl: SUPPORT_URL,
    tokensSaved: summary.tokensSaved,
  }
}
