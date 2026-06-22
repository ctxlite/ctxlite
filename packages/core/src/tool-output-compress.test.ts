import { describe, it, expect } from "vitest"
import { compressToolOutput } from "./tool-output-compress.js"

describe("compressToolOutput", () => {
  it("strips ANSI codes", () => {
    const text = `\u001b[31m${"error ".repeat(200)}\u001b[0m`
    const result = compressToolOutput(text, { minTokens: 50 })
    expect(result.output).not.toContain("\u001b[")
    expect(result.compressed).toBe(true)
    expect(result.tokensSaved).toBeGreaterThan(0)
  })

  it("truncates very long line-based output", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i}: ${"x".repeat(40)}`)
    const result = compressToolOutput(lines.join("\n"), { minTokens: 50, headLines: 10, tailLines: 5 })
    expect(result.compressed).toBe(true)
    expect(result.output).toContain("lines omitted")
    expect(result.tokensSaved).toBeGreaterThan(100)
  })

  it("skips short output", () => {
    const result = compressToolOutput("ok")
    expect(result.compressed).toBe(false)
    expect(result.output).toBe("ok")
  })
})
