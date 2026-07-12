import { describe, it, expect } from "vitest"
import { formatText, formatJson, type JsonExport } from "./format.js"
import type { Summary } from "@ctxlite/core"

const emptySummary: Summary = {
  totalRequests: 0,
  trimmedRequests: 0,
  concisenessRequests: 0,
  compressRequests: 0,
  pruneRequests: 0,
  precallRequests: 0,
  tokensSaved: 0,
  trimTokensSaved: 0,
  concisenessTokensSaved: 0,
  compressTokensSaved: 0,
  pruneTokensSaved: 0,
  precallTokensSaved: 0,
  compactRequests: 0,
  compactTokensSaved: 0,
  smartReadRequests: 0,
  smartReadTokensSaved: 0,
  realtimeTokensSaved: 0,
  sessionTokensUsed: 0,
  sessionTurnCount: 0,
  tokensBefore: 0,
  savingsPercent: 0,
  costSaved: 0,
  avgLatencyMs: 0,
  period: "today",
}

const fullSummary: Summary = {
  totalRequests: 87,
  trimmedRequests: 23,
  concisenessRequests: 64,
  compressRequests: 120,
  pruneRequests: 45,
  precallRequests: 30,
  tokensSaved: 541200,
  trimTokensSaved: 41200,
  concisenessTokensSaved: 300000,
  compressTokensSaved: 150000,
  pruneTokensSaved: 50000,
  precallTokensSaved: 25000,
  compactRequests: 12,
  compactTokensSaved: 18000,
  smartReadRequests: 8,
  smartReadTokensSaved: 22000,
  realtimeTokensSaved: 500000,
  sessionTokensUsed: 700000,
  sessionTurnCount: 10,
  tokensBefore: 1200000,
  savingsPercent: 41.7,
  costSaved: 1.6236,
  avgLatencyMs: 12,
  period: "last 7 days",
}

describe("formatText", () => {
  it("shows no-data message for empty summary", () => {
    const out = formatText(emptySummary)
    expect(out).toContain("No data")
    expect(out).toContain("today")
  })

  it("formats tokens in K for large numbers", () => {
    const out = formatText(fullSummary)
    expect(out).toContain("500.0K")
  })

  it("includes all key metrics", () => {
    const out = formatText(fullSummary)
    expect(out).toContain("500.0K")
    expect(out).toContain("150.0K")
    expect(out).toContain("50.0K")
    expect(out).toContain("120 tool outputs")
    expect(out).toContain("45 context passes")
    expect(out).toContain("$1.6236")
  })

  it("includes the support link (LICENSE's Support Link Retention Condition)", () => {
    const out = formatText(fullSummary)
    expect(out).toContain("https://ko-fi.com/techdebeci")
  })
})

describe("formatJson", () => {
  it("produces valid JSON", () => {
    const out = formatJson(fullSummary)
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it("includes all fields", () => {
    const parsed = JSON.parse(formatJson(fullSummary)) as JsonExport
    expect(parsed).toHaveProperty("totalRequests", 87)
    expect(parsed).toHaveProperty("trimmedRequests", 23)
    expect(parsed).toHaveProperty("tokensSaved", 541200)
    expect(parsed).toHaveProperty("costSavedUsd")
    expect(parsed).toHaveProperty("generatedAt")
    expect(parsed).toHaveProperty("period")
  })

  it("includes breakdown with measurementKind", () => {
    const parsed = JSON.parse(formatJson(fullSummary)) as JsonExport
    expect(parsed.breakdown.length).toBeGreaterThan(0)
    const precall = parsed.breakdown.find((row) => row.label.includes("precall"))
    expect(precall?.measurementKind).toBe("estimate")
    const compress = parsed.breakdown.find((row) => row.label === "compress")
    expect(compress?.measurementKind).toBe("measured")
  })

  it("includes host-specific help for cursor filter", () => {
    const out = formatText(fullSummary, { host: "cursor" })
    expect(out).toContain("(est.)")
    expect(out).toContain("zeros here are expected")
  })

  it("generatedAt is valid ISO date", () => {
    const parsed = JSON.parse(formatJson(fullSummary)) as JsonExport
    expect(() => new Date(parsed.generatedAt)).not.toThrow()
  })
})
