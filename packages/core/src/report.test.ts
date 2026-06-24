import { describe, it, expect } from "vitest"
import { renderCompactSummary, renderSessionBreakdownDetailed } from "./report.js"
import type { SessionBreakdownRow, Summary } from "./types.js"

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    totalRequests: 10,
    trimmedRequests: 0,
    concisenessRequests: 0,
    compressRequests: 0,
    pruneRequests: 0,
    precallRequests: 1,
    compactRequests: 0,
    tokensSaved: 800,
    trimTokensSaved: 0,
    concisenessTokensSaved: 0,
    compressTokensSaved: 0,
    pruneTokensSaved: 0,
    precallTokensSaved: 800,
    compactTokensSaved: 0,
    smartReadRequests: 0,
    smartReadTokensSaved: 0,
    realtimeTokensSaved: 800,
    sessionTokensUsed: 0,
    tokensBefore: 800,
    savingsPercent: 0,
    costSaved: 0.0024,
    avgLatencyMs: 0,
    period: "current session",
    ...overrides,
  }
}

describe("renderCompactSummary", () => {
  it("shows the savings line, the bar chart, and a cost line", () => {
    const lines = renderCompactSummary(makeSummary())
    expect(lines[0]).toContain("ctxlite ·")
    expect(lines.some((l) => l.startsWith("precall"))).toBe(true)
    expect(lines.at(-1)).toContain("saved")
  })

  it("reports no data for an empty summary", () => {
    const lines = renderCompactSummary(makeSummary({ totalRequests: 0 }))
    expect(lines).toEqual(["No data recorded yet."])
  })
})

describe("renderSessionBreakdownDetailed", () => {
  function row(overrides: Partial<SessionBreakdownRow> = {}): SessionBreakdownRow {
    return {
      host: "opencode",
      sessionId: "ses_1",
      totalRequests: 5,
      tokensSaved: 800,
      firstTs: 1000,
      lastTs: 2000,
      ...overrides,
    }
  }

  it("groups by host and indents the bar chart under each session", () => {
    const lines = renderSessionBreakdownDetailed([
      { row: row({ host: "opencode", sessionId: "ses_1" }), summary: makeSummary() },
      { row: row({ host: "cursor", sessionId: "conv_1" }), summary: makeSummary() },
    ])

    const openCodeIdx = lines.indexOf("OpenCode")
    const cursorIdx = lines.indexOf("Cursor")
    expect(openCodeIdx).toBeGreaterThanOrEqual(0)
    expect(cursorIdx).toBeGreaterThan(openCodeIdx)
    expect(lines.some((l) => l.includes("ses_1") && l.includes("5 requests"))).toBe(true)
    expect(lines.some((l) => l.trim().startsWith("ctxlite ·"))).toBe(true)
  })

  it("returns a placeholder for no sessions", () => {
    expect(renderSessionBreakdownDetailed([])).toEqual(["No sessions recorded yet."])
  })
})
