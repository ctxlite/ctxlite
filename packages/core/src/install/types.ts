export type InstallTool = "cursor" | "opencode" | "claude-code" | "claude-desktop"

export type InstallScope = "global" | "project"

export type ConfigKind = "mcp" | "opencode" | "opencode-tui" | "claude-code-hooks" | "cursor-hooks"

export interface McpServerEntry {
  command: string
  args: string[]
  type?: string
  env?: Record<string, string>
}

export interface InstallTarget {
  tool: InstallTool
  scope: InstallScope
  configPath: string
  kind: ConfigKind
}

export type InstallAction = "create" | "update" | "skip" | "remove"

export interface InstallPlanItem {
  tool: InstallTool
  scope: InstallScope
  configPath: string
  action: InstallAction
  message: string
}

export interface InstallOptions {
  tools: InstallTool[]
  scope: InstallScope
  projectDir?: string
  homeDir?: string
  dryRun?: boolean
  remove?: boolean
}

export const MCP_SERVER_NAME = "ctxlite"
export const MCP_PACKAGE = "@ctxlite/mcp"
export const OPENCODE_PLUGIN = "@ctxlite/opencode"

export const ALL_TOOLS: InstallTool[] = [
  "cursor",
  "opencode",
  "claude-code",
  "claude-desktop",
]

export function defaultMcpEntry(): McpServerEntry {
  return {
    command: "npx",
    args: ["-y", MCP_PACKAGE],
  }
}
