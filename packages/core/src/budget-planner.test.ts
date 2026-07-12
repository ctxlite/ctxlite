import { describe, it, expect } from "vitest"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { planBudget } from "./budget-planner.js"

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../test-fixtures/mcp-efficiency")

describe("planBudget", () => {
  it("SC-006: returns ≥3 steps with sum ≤ maxBudget", async () => {
    const taskDescription = await readFile(join(FIXTURE_DIR, "large-task-prompt.txt"), "utf8")
    const maxBudget = 6000
    const result = planBudget({
      taskDescription,
      estimatedTokensIn: 12000,
      model: "test-model",
      maxBudget,
    })

    expect(result.steps.length).toBeGreaterThanOrEqual(3)
    expect(result.totalBudget).toBeLessThanOrEqual(maxBudget)
    expect(result.steps.some((s) => s.tool === "code_search")).toBe(true)
    expect(result.steps.some((s) => s.tool === "get_stats")).toBe(true)
    const toolNames = result.steps.map((s) => s.tool)
    expect(new Set(toolNames).size).toBe(toolNames.length)
  })

  it("warns when estimated context exceeds budget", () => {
    const result = planBudget({
      taskDescription: "small fix",
      estimatedTokensIn: 9000,
      model: "m",
      maxBudget: 1000,
    })
    expect(result.warnings.some((w) => w.includes("exceeds"))).toBe(true)
  })
})
