export {
  ALL_TOOLS,
  MCP_PACKAGE,
  MCP_SERVER_NAME,
  OPENCODE_PLUGIN,
  defaultMcpEntry,
} from "./types.js"
export type {
  ConfigKind,
  InstallAction,
  InstallOptions,
  InstallPlanItem,
  InstallScope,
  InstallTarget,
  InstallTool,
  McpServerEntry,
} from "./types.js"

export { buildTargets, resolveConfigPath, toolLabel } from "./paths.js"
export {
  applyConfigChange,
  formatJson,
  mergeClaudeCodeHooksConfig,
  mergeCursorHooksConfig,
  mergeMcpConfig,
  mergeOpenCodeConfig,
  mergeOpenCodeTuiConfig,
  removeClaudeCodeHooksConfig,
  removeCursorHooksConfig,
  removeOpenCodeTuiConfig,
} from "./merge.js"
export { parseTools, planInstall, runInstall } from "./run.js"
export { opencodePluginCacheDir, refreshOpenCodePlugin } from "./opencode-refresh.js"
export type { OpenCodeRefreshResult } from "./opencode-refresh.js"
