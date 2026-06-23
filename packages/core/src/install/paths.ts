import { homedir as nodeHomedir, platform } from "node:os"
import { join } from "node:path"
import type { InstallOptions, InstallScope, InstallTarget, InstallTool } from "./types.js"

export interface PathContext {
  homeDir?: string
  projectDir?: string
}

function home(ctx: PathContext = {}): string {
  return ctx.homeDir ?? nodeHomedir()
}

function project(ctx: PathContext = {}): string {
  return ctx.projectDir ?? process.cwd()
}

function claudeDesktopConfigPath(ctx: PathContext = {}): string {
  const homeDir = home(ctx)
  switch (platform()) {
    case "win32":
      return join(process.env.APPDATA ?? join(homeDir, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
    case "darwin":
      return join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    default:
      return join(homeDir, ".config", "claude-desktop", "claude_desktop_config.json")
  }
}

export function resolveConfigPath(
  tool: InstallTool,
  scope: InstallScope,
  ctx: PathContext = {},
): string {
  const homeDir = home(ctx)
  const projectDir = project(ctx)

  switch (tool) {
    case "cursor":
      return scope === "global"
        ? join(homeDir, ".cursor", "mcp.json")
        : join(projectDir, ".cursor", "mcp.json")
    case "opencode":
      return scope === "global"
        ? join(homeDir, ".config", "opencode", "opencode.json")
        : join(projectDir, "opencode.json")
    case "claude-code":
      return scope === "global" ? join(homeDir, ".claude.json") : join(projectDir, ".mcp.json")
    case "claude-desktop":
      if (scope === "project") {
        throw new Error("Claude Desktop only supports global (user) scope")
      }
      return claudeDesktopConfigPath(ctx)
  }
}

/** ctxlite must be registered separately for OpenCode's TUI — see opencode-refresh.ts for why. */
function resolveOpenCodeTuiConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".config", "opencode", "tui.json")
    : join(project(ctx), "tui.json")
}

/** Claude Code hooks live in settings.json — a different file from the MCP server config (.claude.json/.mcp.json). */
function resolveClaudeCodeHooksConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".claude", "settings.json")
    : join(project(ctx), ".claude", "settings.json")
}

/** Cursor hooks live in hooks.json — a different file from the MCP server config (mcp.json). */
function resolveCursorHooksConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".cursor", "hooks.json")
    : join(project(ctx), ".cursor", "hooks.json")
}

export function toPathContext(options: Pick<InstallOptions, "homeDir" | "projectDir">): PathContext {
  const ctx: PathContext = {}
  if (options.homeDir !== undefined) {
    ctx.homeDir = options.homeDir
  }
  if (options.projectDir !== undefined) {
    ctx.projectDir = options.projectDir
  }
  return ctx
}

export function buildTargets(
  tools: InstallTool[],
  scope: InstallScope,
  ctx: PathContext = {},
): InstallTarget[] {
  return tools.flatMap((tool): InstallTarget[] => {
    if (tool === "claude-desktop" && scope === "project") {
      throw new Error("Claude Desktop only supports global scope")
    }

    if (tool === "opencode") {
      return [
        { tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "opencode" },
        { tool, scope, configPath: resolveOpenCodeTuiConfigPath(scope, ctx), kind: "opencode-tui" },
      ]
    }

    if (tool === "claude-code") {
      return [
        { tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "mcp" },
        { tool, scope, configPath: resolveClaudeCodeHooksConfigPath(scope, ctx), kind: "claude-code-hooks" },
      ]
    }

    if (tool === "cursor") {
      return [
        { tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "mcp" },
        { tool, scope, configPath: resolveCursorHooksConfigPath(scope, ctx), kind: "cursor-hooks" },
      ]
    }

    return [{ tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "mcp" }]
  })
}

export function toolLabel(tool: InstallTool): string {
  switch (tool) {
    case "cursor":
      return "Cursor"
    case "opencode":
      return "OpenCode"
    case "claude-code":
      return "Claude Code"
    case "claude-desktop":
      return "Claude Desktop"
  }
}
