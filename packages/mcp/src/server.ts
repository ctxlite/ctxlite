import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getStatsSchema, handleGetStats } from "./tools/get-stats.js"
import { trimContextSchema, handleTrimContext } from "./tools/trim-context.js"
import { smartReadSchema, handleSmartRead } from "./tools/smart-read.js"
import { diffReadSchema, handleDiffRead } from "./tools/diff-read.js"
import { logSummarySchema, handleLogSummary } from "./tools/log-summary.js"
import { codeSearchSchema, handleCodeSearch } from "./tools/code-search.js"
import { budgetPlannerSchema, handleBudgetPlanner } from "./tools/budget-planner.js"

const VERSION = "0.1.0"

const SERVER_INSTRUCTIONS = `ctxlite helps reduce token usage in your coding sessions.

Available tools:
- smart_read: Signatures-only file reads — prefer over full read for files above ~2–3k tokens when you need structure/API, not edits
- trim_context: Narrow multi-file candidate sets with BM25 before loading everything into context
- get_stats: Token savings statistics — ALWAYS call this for savings questions; never invent numbers
- diff_read: Read only diff-affected hunks plus context for review/fix tasks
- log_summary: Compress noisy build/test logs to failures, stack traces, and warnings
- code_search: Rank workspace files and return bounded snippets before bulk reads
- budget_planner: Ordered tool-step plan under a token budget for large investigations (does not execute tools)

Usage tips:
- Prefer smart_read over a full read for large files when you only need structure
- Use code_search before reading many files at random
- Chain code_search → trim_context → smart_read or diff_read as needed
- Call trim_context with candidate files before large cross-file tasks
- Use diff_read when you have a unified diff; use log_summary for CI/debug logs
- Call budget_planner at the start of wide refactors or long sessions
- Call get_stats with period session/today/7d/30d/all when asked about savings`

/**
 * Create and configure McpServer with ctxlite tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "ctxlite", version: VERSION }, { instructions: SERVER_INSTRUCTIONS })

  server.registerTool(
    "get_stats",
    {
      title: "Get token savings stats",
      description: `Returns ctxlite token savings statistics.
Call this when the user asks about token usage, savings, costs, or ctxlite performance — never estimate savings manually.
Supports periods: session (last hour), today, 7d, 30d, all.
Distinguishes measured mechanisms from estimate-labeled rows (precall, concise).`,
      inputSchema: getStatsSchema,
    },
    async (args) => {
      const text = await handleGetStats(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "smart_read",
    {
      title: "Read a file as signatures only",
      description: `Reads a source file and returns its shape — function, method, and class signatures with implementation bodies omitted — instead of the full content.
Falls back to a budgeted head/tail read for languages without symbol support.
Use this instead of a full read when you need to understand a file's structure or API, not edit it.`,
      inputSchema: smartReadSchema,
    },
    async (args) => {
      const text = await handleSmartRead(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "trim_context",
    {
      title: "Trim files to relevant ones",
      description: `Analyzes a list of files and returns only the most relevant ones for your current task.
Uses BM25 scoring and import graph analysis.
Use this before large prompts to reduce token usage significantly.
Provide the files you're considering and a description of what you're trying to do.`,
      inputSchema: trimContextSchema,
    },
    async (args) => {
      const text = await handleTrimContext(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "diff_read",
    {
      title: "Read diff-affected regions only",
      description: `Given a file path and unified diff text, returns only changed hunks plus surrounding context within a token budget.
Use for code review or incremental fixes instead of reloading the entire file.`,
      inputSchema: diffReadSchema,
    },
    async (args) => {
      const text = await handleDiffRead(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "log_summary",
    {
      title: "Summarize logs to failures",
      description: `Compresses large build/test/log output into an error-centric summary within a token budget.
Use when diagnosing CI failures instead of pasting the full log.`,
      inputSchema: logSummarySchema,
    },
    async (args) => {
      const text = await handleLogSummary(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "code_search",
    {
      title: "Search codebase with bounded snippets",
      description: `Lexical workspace search returning ranked file paths and token-bounded snippets.
Use before reading many files when you do not know which paths matter.`,
      inputSchema: codeSearchSchema,
    },
    async (args) => {
      const text = await handleCodeSearch(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  server.registerTool(
    "budget_planner",
    {
      title: "Plan tool usage under a token budget",
      description: `Returns an ordered plan of ctxlite tool steps with per-step token budgets for large tasks.
Does not execute tools — the agent follows the plan.`,
      inputSchema: budgetPlannerSchema,
    },
    async (args) => {
      const text = await handleBudgetPlanner(args)
      return { content: [{ type: "text" as const, text }] }
    },
  )

  return server
}
