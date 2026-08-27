import { describe, it, expect } from "vitest"
import * as ctxliteCore from "./index.js"

/**
 * The barrel itself has no branching logic — its only failure mode is a
 * forgotten or broken re-export. Importing every named export through this
 * file (rather than each submodule directly) exercises every re-export
 * statement and would catch that class of regression.
 */
describe("@ctxlite/core barrel exports", () => {
  it("exposes every documented value export", () => {
    const expectedFunctions = [
      "BM25",
      "tokenize",
      "extractFiles",
      "extractQuery",
      "detectLanguage",
      "buildImportGraph",
      "calculateImportBoosts",
      "trimFiles",
      "parseTokenUsage",
      "estimateTokens",
      "estimateCost",
      "estimateConcisenessSavings",
      "optimizeToolArgs",
      "optimizeBashCommand",
      "optimizeReadPath",
      "compressToolOutput",
      "compressGrepOutput",
      "compressOutputForTool",
      "pruneMessageContext",
      "capStaleToolOutputs",
      "extractSymbols",
      "supportsSymbols",
      "diffRead",
      "parseUnifiedDiffHunks",
      "summarizeLog",
      "searchCodebase",
      "formatCodeSearchOutput",
      "planBudget",
      "formatBudgetPlanOutput",
      "StatsStore",
      "defaultDbPath",
      "logTrimResult",
      "logConcisenessSavings",
      "logOptimizationSavings",
      "logSessionUsage",
      "closeSharedStores",
      "buildStatsBreakdown",
      "formatSavingsLine",
      "formatTokenCount",
      "hasStableSavingsBaseline",
      "hostLabel",
      "MIN_SESSION_TURNS_FOR_PERCENT",
      "renderCompactSummary",
      "renderSessionBreakdown",
      "renderSessionBreakdownDetailed",
      "renderStatsBarChart",
      "applyConfigChange",
      "buildTargets",
      "defaultMcpEntry",
      "formatJson",
      "mergeClaudeCodeHooksConfig",
      "mergeCursorHooksConfig",
      "mergeMcpConfig",
      "mergeOpenCodeConfig",
      "mergeOpenCodeTuiConfig",
      "removeClaudeCodeHooksConfig",
      "removeCursorHooksConfig",
      "removeOpenCodeTuiConfig",
      "opencodePluginCacheDir",
      "parseTools",
      "planInstall",
      "refreshOpenCodePlugin",
      "resolveConfigPath",
      "runInstall",
      "toolLabel",
    ] as const

    for (const name of expectedFunctions) {
      expect(ctxliteCore[name], `expected ${name} to be exported`).toBeDefined()
    }
  })

  it("exposes the constant exports with their documented values", () => {
    expect(ctxliteCore.CONCISENESS_SAVINGS_RATE).toBeTypeOf("number")
    // Cursor/Claude Code/Claude Desktop are no longer installable — see docs/benchmarks.md.
    expect(ctxliteCore.ALL_TOOLS).toEqual(["opencode"])
    expect(ctxliteCore.MCP_PACKAGE).toBe("@ctxlite/mcp")
    expect(ctxliteCore.MCP_SERVER_NAME).toBe("ctxlite")
    expect(ctxliteCore.OPENCODE_PLUGIN).toBe("@ctxlite/opencode")
  })
})
