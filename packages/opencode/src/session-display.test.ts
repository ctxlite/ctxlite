import { describe, it, expect } from "vitest"
import {
  buildOpenCodeSessionDisplay,
  buildOpenCodeSessionTitle,
  stripCtxliteTitleSuffix,
} from "./session-display.js"
import type { Summary } from "@ctxlite/core"

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    totalRequests: 0,
    trimmedRequests: 0,
    concisenessRequests: 0,
    compressRequests: 0,
    pruneRequests: 0,
    precallRequests: 0,
    compactRequests: 0,
    tokensSaved: 0,
    trimTokensSaved: 0,
    concisenessTokensSaved: 0,
    compressTokensSaved: 0,
    pruneTokensSaved: 0,
    precallTokensSaved: 0,
    compactTokensSaved: 0,
    smartReadRequests: 0,
    smartReadTokensSaved: 0,
    diffReadRequests: 0,
    diffReadTokensSaved: 0,
    logSummaryRequests: 0,
    logSummaryTokensSaved: 0,
    codeSearchRequests: 0,
    codeSearchTokensSaved: 0,
    realtimeTokensSaved: 0,
    sessionTokensUsed: 0,
    sessionTurnCount: 0,
    tokensBefore: 0,
    savingsPercent: 0,
    costSaved: 0,
    avgLatencyMs: 0,
    period: "current session",
    ...overrides,
  }
}

describe("buildOpenCodeSessionDisplay", () => {
  it("shows no savings yet when tokensSaved is 0", () => {
    const d = buildOpenCodeSessionDisplay(makeSummary())
    expect(d.totalLine).toBe("no savings yet")
    expect(d.costLine).toBeNull()
  })

  it("shows savings when tokensSaved > 0 even if totalRequests is 0", () => {
    const d = buildOpenCodeSessionDisplay(makeSummary({ tokensSaved: 800, realtimeTokensSaved: 800 }))
    expect(d.totalLine).not.toBe("no savings yet")
    expect(d.tokensSaved).toBe(800)
  })

  it("omits cost line until baseline is stable", () => {
    const d = buildOpenCodeSessionDisplay(
      makeSummary({
        tokensSaved: 5000,
        realtimeTokensSaved: 5000,
        sessionTurnCount: 3,
        costSaved: 0.01,
      }),
    )
    expect(d.hasBaseline).toBe(false)
    expect(d.costLine).toBeNull()
  })
})

describe("buildOpenCodeSessionTitle", () => {
  it("strips prior suffix", () => {
    expect(stripCtxliteTitleSuffix("My session · ctxlite: 1.0K saved")).toBe("My session")
  })

  it("returns base when zero savings", () => {
    expect(buildOpenCodeSessionTitle("My session", 0)).toBe("My session")
  })
})
