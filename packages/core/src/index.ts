// Public API for @ctxlite/core

export { BM25, tokenize } from "./bm25.js"
export type { ScoredDoc } from "./bm25.js"

export { extractFiles, extractQuery, detectLanguage } from "./parser.js"

export { buildImportGraph, calculateImportBoosts } from "./imports.js"
export type { ImportGraph } from "./imports.js"

export { trimFiles } from "./trimmer.js"
export type { TrimOptions } from "./trimmer.js"

export { parseTokenUsage, estimateTokens, estimateCost, estimateConcisenessSavings, CONCISENESS_SAVINGS_RATE } from "./tokens.js"

export { optimizeToolArgs, optimizeBashCommand, optimizeReadPath } from "./tool-precall.js"
export type { PrecallResult } from "./tool-precall.js"

export { loadIgnorePatterns, isIgnored } from "./ctxliteignore.js"
export type { IgnorePattern } from "./ctxliteignore.js"

/** Low-level SQLite access — for tests that need to inspect a raw logged row (e.g. `upstream`) beyond what StatsStore's aggregate methods expose. */
export { openStatsSqlite } from "./sqlite-adapter.js"
export type { StatsSqlite } from "./sqlite-adapter.js"

export { compressToolOutput } from "./tool-output-compress.js"
export type { CompressToolOutputOptions, CompressToolOutputResult } from "./tool-output-compress.js"

export { compressGrepOutput, compressOutputForTool } from "./grep-output-compress.js"
export type { CompressGrepOutputOptions } from "./grep-output-compress.js"

export { pruneMessageContext, capStaleToolOutputs } from "./context-prune.js"
export type { PruneMessage, ContextPruneResult, ContextCapResult } from "./context-prune.js"

export { extractSymbols, supportsSymbols } from "./smart-read.js"

export {
  StatsStore,
  defaultDbPath,
  logTrimResult,
  logConcisenessSavings,
  logOptimizationSavings,
  logSessionUsage,
  closeSharedStores,
} from "./stats.js"
export type { ConcisenessLog, OptimizationLog } from "./stats.js"

export {
  buildStatsBreakdown,
  formatSavingsLine,
  formatTokenCount,
  hasStableSavingsBaseline,
  hostLabel,
  MIN_SESSION_TURNS_FOR_PERCENT,
  renderCompactSummary,
  renderSessionBreakdown,
  renderSessionBreakdownDetailed,
  renderStatsBarChart,
  SUPPORT_LINE,
} from "./report.js"
export type { StatsBreakdownRow } from "./report.js"

export type {
  CodeFile,
  TrimResult,
  TokenUsage,
  RequestLog,
  Summary,
  CacheStats,
  SessionBreakdownRow,
} from "./types.js"

export {
  ALL_TOOLS,
  MCP_PACKAGE,
  MCP_SERVER_NAME,
  OPENCODE_PLUGIN,
  applyConfigChange,
  buildTargets,
  defaultMcpEntry,
  formatJson,
  mergeClaudeCodeHooksConfig,
  mergeCursorHooksConfig,
  mergeMcpConfig,
  mergeOpenCodeConfig,
  mergeOpenCodeTuiConfig,
  removeClaudeCodeHooksConfig,
  removeCursorHooksConfig,
  removeOpenCodeTuiConfig,
  opencodePluginCacheDir,
  parseTools,
  planInstall,
  refreshOpenCodePlugin,
  resolveConfigPath,
  runInstall,
  toolLabel,
} from "./install/index.js"
export type {
  ConfigKind,
  InstallAction,
  InstallOptions,
  InstallPlanItem,
  InstallScope,
  InstallTarget,
  InstallTool,
  McpServerEntry,
  OpenCodeRefreshResult,
} from "./install/index.js"
