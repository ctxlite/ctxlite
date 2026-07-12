import { describe, it, expect } from "vitest"
import { handleBudgetPlanner } from "./budget-planner.js"

describe("handleBudgetPlanner", () => {
  it("returns JSON plan with steps", async () => {
    const result = await handleBudgetPlanner({
      taskDescription: "Refactor authentication across monorepo",
      estimatedTokensIn: 8000,
      model: "test",
      maxBudget: 4000,
    })
    const parsed = JSON.parse(result) as { steps: unknown[]; totalBudget: number }
    expect(parsed.steps.length).toBeGreaterThanOrEqual(3)
    expect(parsed.totalBudget).toBeLessThanOrEqual(4000)
  })

  it("returns plan for minimal task", async () => {
    const result = await handleBudgetPlanner({
      taskDescription: "fix typo",
      estimatedTokensIn: 100,
      model: "m",
      maxBudget: 500,
    })
    expect(result).toContain("steps")
  })
})
