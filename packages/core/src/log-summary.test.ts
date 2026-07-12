import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { summarizeLog } from "./log-summary.js"
import { estimateTokens } from "./tokens.js"

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/mcp-efficiency")

describe("summarizeLog", () => {
  it("SC-004: output ≥80% smaller and mentions each failure id", async () => {
    const text = await readFile(join(FIXTURE_DIR, "noisy.log"), "utf8")
    const tokensIn = estimateTokens(text)
    const result = summarizeLog({ text })

    expect(result.tokensSaved / tokensIn).toBeGreaterThanOrEqual(0.8)
    expect(result.output).toMatch(/FAIL|Error|✘/)
    expect(result.errorsFound).toBeGreaterThanOrEqual(3)
    expect(result.output).toContain("charge")
    expect(result.output).toContain("refund")
    expect(result.output).toContain("token")
  })

  it("returns compact message when no errors", () => {
    const result = summarizeLog({ text: "[INFO] all tests passed\n[INFO] done\n" })
    expect(result.output).toContain("No failures detected")
    expect(result.errorsFound).toBe(0)
  })

  it("rejects oversized input", () => {
    expect(() => summarizeLog({ text: "x".repeat(1_048_577) })).toThrow(/exceeds max/)
  })
})
