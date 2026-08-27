export type InstallTool = "cursor" | "opencode" | "claude-code" | "claude-desktop"

export type InstallScope = "global" | "project"

export type ConfigKind =
  | "mcp"
  | "opencode"
  | "opencode-tui"
  | "claude-code-hooks"
  | "cursor-hooks"
  | "claude-code-skill"
  | "cursor-skill"
  | "opencode-skill"
  | "claude-code-conciseness-rule"
  | "cursor-conciseness-rule"

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

/**
 * Installable tools, offered by the CLI installer's default/interactive/
 * `--tool all` paths. ctxlite now targets OpenCode only — Cursor and Claude
 * Code support still exists in `paths.ts`/`merge.ts` (a prior install on
 * either host keeps working, and the code isn't deleted), but the installer
 * no longer offers to create, update, or refresh a Cursor/Claude Code/Claude
 * Desktop config. See docs/benchmarks.md for why: this project's efficiency
 * work is now scoped to OpenCode specifically.
 */
export const ALL_TOOLS: InstallTool[] = ["opencode"]

export function defaultMcpEntry(): McpServerEntry {
  return {
    command: "npx",
    args: ["-y", MCP_PACKAGE],
  }
}
