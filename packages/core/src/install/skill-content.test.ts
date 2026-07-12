import { describe, it, expect } from "vitest"
import { CTXLITE_SKILL_CONTENT } from "./skill-content.js"

const REQUIRED_TOOLS = [
  "smart_read",
  "trim_context",
  "get_stats",
  "diff_read",
  "log_summary",
  "code_search",
  "budget_planner",
]

const REQUIRED_SECTIONS = [
  "Available tools",
  "Reading code efficiently",
  "Multi-file tasks",
  "Diff-aware reading",
  "Logs and grep",
  "Token stats",
  "Caching / reuse",
  "Budget planning",
  "Response conciseness",
]

describe("CTXLITE_SKILL_CONTENT", () => {
  it("lists all seven MCP tools in frontmatter and body", () => {
    for (const tool of REQUIRED_TOOLS) {
      expect(CTXLITE_SKILL_CONTENT).toContain(tool)
    }
  })

  it("includes required guidance sections", () => {
    for (const section of REQUIRED_SECTIONS) {
      expect(CTXLITE_SKILL_CONTENT).toContain(section)
    }
  })
})
