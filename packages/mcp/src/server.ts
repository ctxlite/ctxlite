import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getStatsSchema, handleGetStats } from "./tools/get-stats.js"
import { trimContextSchema, handleTrimContext } from "./tools/trim-context.js"
import { smartReadSchema, handleSmartRead } from "./tools/smart-read.js"

const VERSION = "0.1.0"

const SERVER_INSTRUCTIONS = `ctxlite helps reduce token usage in your coding sessions.

Available tools:
- smart_read: Read a file as signatures only (no implementation bodies) — use this instead of reading a large file in full when you need its shape, not to edit it
- trim_context: Analyze already-read files and return only the most relevant ones for your task
- get_stats: View token savings statistics

Usage tips:
- Prefer smart_read over a full read for large files when you only need structure
- Before a large refactoring task, call trim_context with all candidate files
- Call get_stats anytime to see how much you've saved`

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
Call this when the user asks about token usage, savings, costs, or ctxlite performance.
Supports periods: session (last hour), today, 7d, 30d, all.`,
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

  return server
}
