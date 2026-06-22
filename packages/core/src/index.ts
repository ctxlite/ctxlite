// Public API for @ctxlite/core

export { BM25, tokenize } from "./bm25.js"
export type { ScoredDoc } from "./bm25.js"

export { extractFiles, extractQuery, detectLanguage } from "./parser.js"

export { buildImportGraph, calculateImportBoosts } from "./imports.js"
export type { ImportGraph } from "./imports.js"

export { trimFiles } from "./trimmer.js"
export type { TrimOptions } from "./trimmer.js"

export { parseTokenUsage, estimateTokens, estimateCost, estimateConcisenessSavings, CONCISENESS_SAVINGS_RATE } from "./tokens.js"

export { StatsStore, defaultDbPath, logTrimResult, logConcisenessSavings } from "./stats.js"
export type { ConcisenessLog } from "./stats.js"

export type {
  CodeFile,
  TrimResult,
  TokenUsage,
  RequestLog,
  Summary,
  CacheStats,
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
  mergeMcpConfig,
  mergeOpenCodeConfig,
  parseTools,
  planInstall,
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
} from "./install/index.js"
