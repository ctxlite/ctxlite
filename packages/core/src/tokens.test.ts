import { describe, it, expect } from "vitest"
import { parseTokenUsage, estimateTokens, estimateConcisenessSavings } from "./tokens.js"

describe("parseTokenUsage", () => {
  it("parses Anthropic format", () => {
    const body = JSON.stringify({
      usage: { input_tokens: 1250, output_tokens: 340 },
    })
    const usage = parseTokenUsage(body)
    expect(usage.inputTokens).toBe(1250)
    expect(usage.outputTokens).toBe(340)
    expect(usage.totalTokens).toBe(1590)
  })

  it("parses OpenAI format", () => {
    const body = JSON.stringify({
      usage: { prompt_tokens: 890, completion_tokens: 210, total_tokens: 1100 },
    })
    const usage = parseTokenUsage(body)
    expect(usage.inputTokens).toBe(890)
    expect(usage.outputTokens).toBe(210)
  })

  it("returns zero for invalid body — no throw", () => {
    const usage = parseTokenUsage("not json { broken")
    expect(usage.totalTokens).toBe(0)
    expect(usage.inputTokens).toBe(0)
  })
})

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    const text = "a".repeat(400)
    expect(estimateTokens(text)).toBe(100)
  })
})

describe("estimateConcisenessSavings", () => {
  it("returns 15% of output and reasoning tokens", () => {
    expect(estimateConcisenessSavings(1000, 200)).toBe(180)
  })

  it("returns zero for empty output", () => {
    expect(estimateConcisenessSavings(0, 0)).toBe(0)
  })
})
