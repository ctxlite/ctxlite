import { describe, it, expect } from "vitest"
import { formatText, formatJson, type JsonExport } from "./format.js"
import type { Summary } from "@ctxlite/core"

const emptySummary: Summary = {
  totalRequests: 0,
  trimmedRequests: 0,
  tokensSaved: 0,
  costSaved: 0,
  avgLatencyMs: 0,
  period: "today",
}

const fullSummary: Summary = {
  totalRequests: 87,
  trimmedRequests: 23,
  tokensSaved: 341200,
  costSaved: 1.0236,
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
    expect(out).toContain("341.2K")
  })

  it("includes all key metrics", () => {
    const out = formatText(fullSummary)
    expect(out).toContain("87")
    expect(out).toContain("23")
    expect(out).toContain("$1.0236")
    expect(out).toContain("12ms")
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
    expect(parsed).toHaveProperty("tokensSaved", 341200)
    expect(parsed).toHaveProperty("costSavedUsd")
    expect(parsed).toHaveProperty("generatedAt")
    expect(parsed).toHaveProperty("period")
  })

  it("generatedAt is valid ISO date", () => {
    const parsed = JSON.parse(formatJson(fullSummary)) as JsonExport
    expect(() => new Date(parsed.generatedAt)).not.toThrow()
  })
})
