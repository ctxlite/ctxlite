// Rule-based token budget planner — ordered tool steps without executing them.

export interface BudgetPlanStep {
  order: number
  tool: string
  purpose: string
  budgetTokens: number
}

export interface BudgetPlannerOptions {
  taskDescription: string
  estimatedTokensIn: number
  model: string
  maxBudget: number
}

export interface BudgetPlanResult {
  steps: BudgetPlanStep[]
  totalBudget: number
  warnings: string[]
}

const SEARCH_KEYWORDS = /\b(where|find|search|locate|which file|grep)\b/i
const DIFF_KEYWORDS = /\b(review|diff|changed|hunk|fix regression)\b/i
const LOG_KEYWORDS = /\b(log|fail|error|test output|ci|build output)\b/i
const MULTI_FILE_KEYWORDS = /\b(refactor|across|monorepo|multi[- ]file|every handler)\b/i
const LARGE_READ_KEYWORDS = /\b(api|interface|exports|structure|signature)\b/i

function allocateStepBudgets(maxBudget: number, stepCount: number): number[] {
  const base = Math.floor(maxBudget / stepCount)
  const remainder = maxBudget - base * stepCount
  return Array.from({ length: stepCount }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Produce an ordered tool plan whose per-step budgets sum to ≤ maxBudget.
 */
export function planBudget(options: BudgetPlannerOptions): BudgetPlanResult {
  const { taskDescription, estimatedTokensIn, model, maxBudget } = options
  const warnings: string[] = []
  const planned: Array<{ tool: string; purpose: string }> = []

  if (estimatedTokensIn > maxBudget) {
    warnings.push(`estimated context (${estimatedTokensIn}) exceeds maxBudget (${maxBudget}) — narrow scope or raise budget`)
  }

  if (SEARCH_KEYWORDS.test(taskDescription) || MULTI_FILE_KEYWORDS.test(taskDescription)) {
    planned.push({ tool: "code_search", purpose: "Locate relevant files before reading" })
  }

  if (MULTI_FILE_KEYWORDS.test(taskDescription)) {
    planned.push({ tool: "trim_context", purpose: "Narrow candidate files to task-relevant subset" })
  }

  if (DIFF_KEYWORDS.test(taskDescription)) {
    planned.push({ tool: "diff_read", purpose: "Read only changed hunks plus context" })
  } else if (LARGE_READ_KEYWORDS.test(taskDescription)) {
    planned.push({ tool: "smart_read", purpose: "Read signatures instead of full implementations" })
  }

  if (LOG_KEYWORDS.test(taskDescription)) {
    planned.push({ tool: "log_summary", purpose: "Compress logs to failures and stack traces" })
  }

  planned.push({ tool: "get_stats", purpose: "Report measured savings — never estimate manually" })

  if (planned.length < 3) {
    planned.unshift(
      { tool: "budget_planner", purpose: "Re-run planner after scope is clearer" },
      { tool: "smart_read", purpose: "Inspect key files with signature-only reads" },
    )
  }

  const unique = planned.filter((step, index) => planned.findIndex((s) => s.tool === step.tool) === index)
  const budgets = allocateStepBudgets(maxBudget, unique.length)

  const steps: BudgetPlanStep[] = unique.map((step, i) => ({
    order: i + 1,
    tool: step.tool,
    purpose: step.purpose,
    budgetTokens: budgets[i] ?? 0,
  }))

  const totalBudget = steps.reduce((sum, s) => sum + s.budgetTokens, 0)
  if (totalBudget > maxBudget) {
    warnings.push(`internal planner error: totalBudget ${totalBudget} > maxBudget ${maxBudget}`)
  }

  if (steps.length === 0) {
    warnings.push(`no steps generated for model ${model}`)
  }

  return { steps, totalBudget, warnings }
}

/**
 * Format a budget plan as JSON string for MCP output.
 */
export function formatBudgetPlanOutput(model: string, result: BudgetPlanResult): string {
  return JSON.stringify(
    {
      model,
      steps: result.steps,
      totalBudget: result.totalBudget,
      warnings: result.warnings,
    },
    null,
    2,
  )
}
