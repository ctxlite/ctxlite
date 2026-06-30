import { describe, it, expect } from "vitest"
import {
  formatSavingsLine,
  hostLabel,
  renderCompactSummary,
  renderSessionBreakdown,
  renderSessionBreakdownDetailed,
  SUPPORT_LINE,
} from "./report.js"
import type { SessionBreakdownRow, Summary } from "./types.js"

describe("SUPPORT_LINE", () => {
  it("points at the LICENSE-mandated Ko-fi URL", () => {
    expect(SUPPORT_LINE).toContain("https://ko-fi.com/techdebeci")
  })
})

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
    sessionTurnCount: 0,
    tokensBefore: 800,
    savingsPercent: 0,
    costSaved: 0.0024,
    avgLatencyMs: 0,
    period: "current session",
    ...overrides,
  }
}

describe("formatSavingsLine", () => {
  it("shows a no-baseline notice when sessionTokensUsed is 0", () => {
    expect(formatSavingsLine(makeSummary({ sessionTokensUsed: 0, tokensSaved: 800 }))).toBe(
      "800 saved (no session baseline yet)",
    )
  })

  it("hides the percent until enough assistant turns are logged", () => {
    expect(
      formatSavingsLine(
        makeSummary({
          sessionTokensUsed: 5000,
          sessionTurnCount: 3,
          realtimeTokensSaved: 4200000,
          tokensBefore: 4300000,
          savingsPercent: 97.7,
        }),
      ),
    ).toBe("4.2M saved (3/10 turns — % after baseline)")
  })

  it("shows the X of Y (Z% context avoided) form once the baseline is stable", () => {
    const line = formatSavingsLine(
      makeSummary({
        sessionTokensUsed: 1000,
        sessionTurnCount: 10,
        realtimeTokensSaved: 400,
        tokensBefore: 1000,
        savingsPercent: 40,
      }),
    )
    expect(line).toBe("400 of 1.0K (40.0% context avoided)")
  })
})

describe("hostLabel", () => {
  it("maps known hosts to display names", () => {
    expect(hostLabel("opencode")).toBe("OpenCode")
    expect(hostLabel("claude-code")).toBe("Claude Code")
    expect(hostLabel("cursor")).toBe("Cursor")
    expect(hostLabel("mcp")).toBe("MCP")
  })

  it("falls back to the raw host string when unknown", () => {
    expect(hostLabel("some-future-host")).toBe("some-future-host")
  })
})

describe("renderSessionBreakdown", () => {
  function row(overrides: Partial<SessionBreakdownRow> = {}): SessionBreakdownRow {
    return { host: "opencode", sessionId: "ses_1", totalRequests: 5, tokensSaved: 800, firstTs: 1000, lastTs: 2000, ...overrides }
  }

  it("returns a placeholder when there are no sessions", () => {
    expect(renderSessionBreakdown([])).toEqual(["No sessions recorded yet."])
  })

  it("groups consecutive rows under one host heading, with a blank line between hosts", () => {
    const lines = renderSessionBreakdown([
      row({ host: "opencode", sessionId: "a" }),
      row({ host: "opencode", sessionId: "b" }),
      row({ host: "cursor", sessionId: "c" }),
    ])

    expect(lines[0]).toBe("OpenCode")
    expect(lines.some((l) => l.includes("a") && l.includes("saved"))).toBe(true)
    expect(lines.some((l) => l.includes("b"))).toBe(true)
    expect(lines).toContain("")
    expect(lines).toContain("Cursor")
  })

  it("falls back to an empty session id when sessionId is null", () => {
    const lines = renderSessionBreakdown([row({ sessionId: null })])
    expect(lines[1]).toMatch(/^\s+\d+ saved/)
  })
})

describe("renderCompactSummary", () => {
  it("shows the savings line, the bar chart, a cost line, and the support line", () => {
    const lines = renderCompactSummary(makeSummary({ sessionTurnCount: 10, sessionTokensUsed: 1000 }))
    expect(lines[0]).toContain("ctxlite ·")
    expect(lines.some((l) => l.startsWith("precall"))).toBe(true)
    expect(lines.some((l) => l.startsWith("concise (est.)"))).toBe(true)
    expect(lines.some((l) => l.includes("saved") && l.startsWith("~$"))).toBe(true)
    expect(lines.at(-1)).toBe(SUPPORT_LINE)
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
