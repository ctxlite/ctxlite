import { z } from "zod"
import { planBudget, formatBudgetPlanOutput } from "@ctxlite/core"

export const budgetPlannerSchema = z.object({
  taskDescription: z.string().min(1).describe("What you are trying to accomplish"),
  estimatedTokensIn: z.number().int().min(0).describe("Current context size estimate"),
  model: z.string().min(1).describe("Model identifier for the plan header"),
  maxBudget: z.number().int().positive().describe("Total read-token cap for the plan"),
})

export async function handleBudgetPlanner(args: z.infer<typeof budgetPlannerSchema>): Promise<string> {
  try {
    const result = planBudget({
      taskDescription: args.taskDescription,
      estimatedTokensIn: args.estimatedTokensIn,
      model: args.model,
      maxBudget: args.maxBudget,
    })
    return formatBudgetPlanOutput(args.model, result)
  } catch (err) {
    return `budget_planner error: ${err instanceof Error ? err.message : String(err)}`
  }
}
