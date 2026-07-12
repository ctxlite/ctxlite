import { describe, it, expect, afterAll, vi } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// shared.ts computes STATS_DB_PATH from homedir() once, at import time — the
// fake homedir must exist before that import happens, or this test suite
// reads/writes the user's actual ~/.ctxlite/stats.db on every run.
const tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-mcp-server-home-"))
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createServer } = await import("./server.js")
const { closeSharedStores } = await import("@ctxlite/core")

afterAll(() => {
  closeSharedStores()
  rmSync(tmpHome, { recursive: true, force: true })
})

/** McpServer's tool registry is `private` at the type level only — the handler is reachable at runtime. */
function registeredHandler(server: ReturnType<typeof createServer>, name: string) {
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })
    ._registeredTools
  const tool = tools[name]
  if (!tool) throw new Error(`tool ${name} not registered`)
  return tool.handler
}

describe("createServer", () => {
  it("creates server without throwing", () => {
    expect(() => createServer()).not.toThrow()
  })

  it("returns McpServer instance", () => {
    const server = createServer()
    expect(server).toBeDefined()
    expect(typeof server.connect).toBe("function")
  })

  it("registers all seven efficiency tools", () => {
    const server = createServer()
    const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    for (const name of [
      "get_stats",
      "smart_read",
      "trim_context",
      "diff_read",
      "log_summary",
      "code_search",
      "budget_planner",
    ]) {
      expect(tools[name]).toBeDefined()
    }
  })

  it("get_stats tool wraps handleGetStats' text in MCP content format", async () => {
    const server = createServer()
    const result = (await registeredHandler(server, "get_stats")({})) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.type).toBe("text")
    expect(result.content[0]?.text).toContain("ctxlite stats")
  })

  it("smart_read tool wraps handleSmartRead's text in MCP content format", async () => {
    const { writeFileSync } = await import("fs")
    const filePath = join(tmpHome, "sample.ts")
    writeFileSync(filePath, "export const a = 1\n")

    const server = createServer()
    const result = (await registeredHandler(server, "smart_read")({ path: filePath })) as {
      content: Array<{ type: string; text: string }>
    }
    expect(result.content[0]?.type).toBe("text")
    expect(result.content[0]?.text).toContain("export const a")
  })

  it("trim_context tool wraps handleTrimContext's text in MCP content format", async () => {
    const server = createServer()
    const result = (await registeredHandler(server, "trim_context")({
      files: [{ path: "a.ts", content: "export const a = 1" }],
      query: "a",
    })) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.type).toBe("text")
    expect(typeof result.content[0]?.text).toBe("string")
  })

  it("diff_read tool returns hunk output", async () => {
    const { writeFileSync } = await import("fs")
    const filePath = join(tmpHome, "diff.ts")
    writeFileSync(filePath, "a\nb\nc\n")
    const diff = "--- a\n+++ b\n@@ -2,1 +2,1 @@\n-b\n+b2\n"
    const server = createServer()
    const result = (await registeredHandler(server, "diff_read")({ path: filePath, diff })) as {
      content: Array<{ type: string; text: string }>
    }
    expect(result.content[0]?.text).toContain("diff_read")
  })

  it("log_summary tool compresses log text", async () => {
    const server = createServer()
    const result = (await registeredHandler(server, "log_summary")({
      text: "[FAIL] test\nError: boom\n",
    })) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.text).toContain("log_summary")
  })

  it("code_search tool returns hits", async () => {
    const { mkdirSync, writeFileSync } = await import("fs")
    const root = join(tmpHome, "search-root")
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src", "auth.ts"), "export function auth() {}\n")
    const server = createServer()
    const result = (await registeredHandler(server, "code_search")({
      query: "auth function",
      root,
    })) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0]?.text).toContain("code_search")
  })

  it("budget_planner tool returns JSON plan", async () => {
    const server = createServer()
    const result = (await registeredHandler(server, "budget_planner")({
      taskDescription: "Refactor auth across monorepo",
      estimatedTokensIn: 5000,
      model: "test",
      maxBudget: 3000,
    })) as { content: Array<{ type: string; text: string }> }
    const parsed = JSON.parse(result.content[0]?.text ?? "{}") as { steps: unknown[] }
    expect(parsed.steps.length).toBeGreaterThan(0)
  })
})
