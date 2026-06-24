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

/** Claude Code discovers skills under `.claude/skills/<name>/SKILL.md` (project) or `~/.claude/skills/<name>/SKILL.md` (global). */
function resolveClaudeCodeSkillConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".claude", "skills", "ctxlite", "SKILL.md")
    : join(project(ctx), ".claude", "skills", "ctxlite", "SKILL.md")
}

/**
 * Cursor discovers user-installed skills under `.cursor/skills/<name>/SKILL.md`
 * — NOT `skills-cursor/`, which is reserved for Cursor's own bundled meta-skills
 * (create-hook, create-rule, etc.).
 */
function resolveCursorSkillConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".cursor", "skills", "ctxlite", "SKILL.md")
    : join(project(ctx), ".cursor", "skills", "ctxlite", "SKILL.md")
}

/**
 * OpenCode's project-level default skill path is `.opencode/skills/<name>/SKILL.md`
 * (confirmed from its own config schema). The global equivalent isn't
 * documented as explicitly — this mirrors its other global config files,
 * all of which live under `~/.config/opencode/`.
 */
function resolveOpenCodeSkillConfigPath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".config", "opencode", "skills", "ctxlite", "SKILL.md")
    : join(project(ctx), ".opencode", "skills", "ctxlite", "SKILL.md")
}

/** Claude Code loads every file under `.claude/rules/` unconditionally (no `paths` frontmatter) — same priority as `CLAUDE.md`. */
function resolveClaudeCodeConcisenessRulePath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".claude", "rules", "ctxlite-conciseness.md")
    : join(project(ctx), ".claude", "rules", "ctxlite-conciseness.md")
}

/** Cursor loads `.cursor/rules/*.mdc` files with `alwaysApply: true` unconditionally — matching this project's own `.cursor/rules/security.mdc`. */
function resolveCursorConcisenessRulePath(scope: InstallScope, ctx: PathContext = {}): string {
  return scope === "global"
    ? join(home(ctx), ".cursor", "rules", "ctxlite-conciseness.mdc")
    : join(project(ctx), ".cursor", "rules", "ctxlite-conciseness.mdc")
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
        { tool, scope, configPath: resolveOpenCodeSkillConfigPath(scope, ctx), kind: "opencode-skill" },
      ]
    }

    if (tool === "claude-code") {
      return [
        { tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "mcp" },
        { tool, scope, configPath: resolveClaudeCodeHooksConfigPath(scope, ctx), kind: "claude-code-hooks" },
        { tool, scope, configPath: resolveClaudeCodeSkillConfigPath(scope, ctx), kind: "claude-code-skill" },
        {
          tool,
          scope,
          configPath: resolveClaudeCodeConcisenessRulePath(scope, ctx),
          kind: "claude-code-conciseness-rule",
        },
      ]
    }

    if (tool === "cursor") {
      return [
        { tool, scope, configPath: resolveConfigPath(tool, scope, ctx), kind: "mcp" },
        { tool, scope, configPath: resolveCursorHooksConfigPath(scope, ctx), kind: "cursor-hooks" },
        { tool, scope, configPath: resolveCursorSkillConfigPath(scope, ctx), kind: "cursor-skill" },
        { tool, scope, configPath: resolveCursorConcisenessRulePath(scope, ctx), kind: "cursor-conciseness-rule" },
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
