import {
  MCP_SERVER_NAME,
  OPENCODE_PLUGIN,
  defaultMcpEntry,
  type ConfigKind,
  type McpServerEntry,
} from "./types.js"

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  return (
    a.command === b.command &&
    a.type === b.type &&
    JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? []) &&
    JSON.stringify(a.env ?? {}) === JSON.stringify(b.env ?? {})
  )
}

export function mergeMcpConfig(existing: unknown, entry: McpServerEntry): { next: JsonObject; changed: boolean } {
  const base = isObject(existing) ? { ...existing } : {}
  const servers = isObject(base.mcpServers) ? { ...base.mcpServers } : {}
  const current = servers[MCP_SERVER_NAME]

  if (isObject(current) && entriesEqual(current as unknown as McpServerEntry, entry)) {
    return { next: { ...base, mcpServers: servers }, changed: false }
  }

  servers[MCP_SERVER_NAME] = entry
  return { next: { ...base, mcpServers: servers }, changed: true }
}

export function removeMcpConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  if (!isObject(existing) || !isObject(existing.mcpServers)) {
    return { next: isObject(existing) ? { ...existing } : {}, changed: false }
  }

  if (!(MCP_SERVER_NAME in existing.mcpServers)) {
    return { next: { ...existing }, changed: false }
  }

  const servers = { ...existing.mcpServers }
  delete servers[MCP_SERVER_NAME]
  const next = { ...existing, mcpServers: servers }
  return { next, changed: true }
}

export function mergeOpenCodeConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  const base = isObject(existing) ? { ...existing } : {}
  const plugins: string[] = Array.isArray(base.plugin)
    ? base.plugin.filter((item): item is string => typeof item === "string")
    : []

  if (plugins.includes(OPENCODE_PLUGIN)) {
    const next = { ...base }
    if (!next.$schema) {
      next.$schema = "https://opencode.ai/config.json"
      return { next, changed: true }
    }
    return { next, changed: false }
  }

  plugins.push(OPENCODE_PLUGIN)
  return {
    next: {
      ...base,
      $schema: base.$schema ?? "https://opencode.ai/config.json",
      plugin: plugins,
    },
    changed: true,
  }
}

export function removeOpenCodeConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  if (!isObject(existing) || !Array.isArray(existing.plugin)) {
    return { next: isObject(existing) ? { ...existing } : {}, changed: false }
  }

  const plugins = existing.plugin.filter((item): item is string => typeof item === "string")
  const nextPlugins = plugins.filter((item) => item !== OPENCODE_PLUGIN)
  if (nextPlugins.length === plugins.length) {
    return { next: { ...existing }, changed: false }
  }

  return { next: { ...existing, plugin: nextPlugins }, changed: true }
}

/**
 * OpenCode reads TUI-side plugins (sidebar widgets, etc.) from a separate
 * tui.json, distinct from the server-side plugin list in opencode.json.
 * No $schema is injected here — unlike opencode.json's, the right URL for
 * tui.json isn't confirmed.
 */
export function mergeOpenCodeTuiConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  const base = isObject(existing) ? { ...existing } : {}
  const plugins: string[] = Array.isArray(base.plugin)
    ? base.plugin.filter((item): item is string => typeof item === "string")
    : []

  if (plugins.includes(OPENCODE_PLUGIN)) {
    return { next: base, changed: false }
  }

  plugins.push(OPENCODE_PLUGIN)
  return { next: { ...base, plugin: plugins }, changed: true }
}

export function removeOpenCodeTuiConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  if (!isObject(existing) || !Array.isArray(existing.plugin)) {
    return { next: isObject(existing) ? { ...existing } : {}, changed: false }
  }

  const plugins = existing.plugin.filter((item): item is string => typeof item === "string")
  const nextPlugins = plugins.filter((item) => item !== OPENCODE_PLUGIN)
  if (nextPlugins.length === plugins.length) {
    return { next: { ...existing }, changed: false }
  }

  return { next: { ...existing, plugin: nextPlugins }, changed: true }
}

const CTXLITE_HOOK_COMMAND_MARKER = "@ctxlite/cli hook"
const PRE_TOOL_USE_HOOK_COMMAND = "npx -y @ctxlite/cli hook pre-tool-use"
const POST_TOOL_USE_HOOK_COMMAND = "npx -y @ctxlite/cli hook post-tool-use"

function isCtxliteHookGroup(group: unknown): boolean {
  return (
    isObject(group) &&
    Array.isArray(group.hooks) &&
    group.hooks.some(
      (h) => isObject(h) && typeof h.command === "string" && h.command.includes(CTXLITE_HOOK_COMMAND_MARKER),
    )
  )
}

function addCtxliteHookGroup(entries: unknown, command: string): { entries: unknown[]; changed: boolean } {
  const list = Array.isArray(entries) ? [...(entries as unknown[])] : []
  if (list.some(isCtxliteHookGroup)) {
    return { entries: list, changed: false }
  }
  list.push({ matcher: "*", hooks: [{ type: "command", command }] })
  return { entries: list, changed: true }
}

function removeCtxliteHookGroup(entries: unknown): { entries: unknown[]; changed: boolean } {
  if (!Array.isArray(entries)) {
    return { entries: [], changed: false }
  }
  const filtered = entries.filter((group) => !isCtxliteHookGroup(group))
  return { entries: filtered, changed: filtered.length !== entries.length }
}

/**
 * Claude Code reads PreToolUse/PostToolUse hooks from settings.json — a
 * different file from the MCP server config (.claude.json/.mcp.json).
 * Appends a matcher group rather than overwriting, so other tools'
 * unrelated hooks on the same event are preserved.
 */
export function mergeClaudeCodeHooksConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  const base = isObject(existing) ? { ...existing } : {}
  const hooks = isObject(base.hooks) ? { ...base.hooks } : {}

  const pre = addCtxliteHookGroup(hooks.PreToolUse, PRE_TOOL_USE_HOOK_COMMAND)
  const post = addCtxliteHookGroup(hooks.PostToolUse, POST_TOOL_USE_HOOK_COMMAND)

  if (!pre.changed && !post.changed) {
    return { next: base, changed: false }
  }

  return {
    next: { ...base, hooks: { ...hooks, PreToolUse: pre.entries, PostToolUse: post.entries } },
    changed: true,
  }
}

export function removeClaudeCodeHooksConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  if (!isObject(existing) || !isObject(existing.hooks)) {
    return { next: isObject(existing) ? { ...existing } : {}, changed: false }
  }

  const pre = removeCtxliteHookGroup(existing.hooks.PreToolUse)
  const post = removeCtxliteHookGroup(existing.hooks.PostToolUse)

  if (!pre.changed && !post.changed) {
    return { next: { ...existing }, changed: false }
  }

  return {
    next: { ...existing, hooks: { ...existing.hooks, PreToolUse: pre.entries, PostToolUse: post.entries } },
    changed: true,
  }
}

const CURSOR_HOOK_COMMAND_MARKER = "@ctxlite/cli hook"
const CURSOR_PRE_TOOL_USE_COMMAND = "npx -y @ctxlite/cli hook cursor-pre-tool-use"

function isCtxliteCursorHookEntry(entry: unknown): boolean {
  return isObject(entry) && typeof entry.command === "string" && entry.command.includes(CURSOR_HOOK_COMMAND_MARKER)
}

/**
 * Cursor reads hooks from hooks.json — a different file from the MCP
 * server config (mcp.json), and a flatter shape than Claude Code's
 * (hooks.preToolUse is an array of {command, ...} entries directly, no
 * matcher-group nesting). Only preToolUse is portable here — Cursor's
 * postToolUse can only replace output for MCP tools, not built-in ones,
 * so there's no equivalent of the "compress" hook on this platform.
 */
export function mergeCursorHooksConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  const base = isObject(existing) ? { ...existing } : {}
  const hooks = isObject(base.hooks) ? { ...base.hooks } : {}
  const preToolUse = Array.isArray(hooks.preToolUse) ? [...(hooks.preToolUse as unknown[])] : []

  if (preToolUse.some(isCtxliteCursorHookEntry)) {
    return { next: base, changed: false }
  }

  preToolUse.push({ command: CURSOR_PRE_TOOL_USE_COMMAND })
  return {
    next: { version: base.version ?? 1, ...base, hooks: { ...hooks, preToolUse } },
    changed: true,
  }
}

export function removeCursorHooksConfig(existing: unknown): { next: JsonObject; changed: boolean } {
  if (!isObject(existing) || !isObject(existing.hooks) || !Array.isArray(existing.hooks.preToolUse)) {
    return { next: isObject(existing) ? { ...existing } : {}, changed: false }
  }

  const filtered = existing.hooks.preToolUse.filter((entry) => !isCtxliteCursorHookEntry(entry))
  if (filtered.length === existing.hooks.preToolUse.length) {
    return { next: { ...existing }, changed: false }
  }

  return { next: { ...existing, hooks: { ...existing.hooks, preToolUse: filtered } }, changed: true }
}

export function applyConfigChange(
  kind: ConfigKind,
  existing: unknown,
  remove: boolean,
): { next: JsonObject; changed: boolean } {
  if (kind === "opencode") {
    return remove ? removeOpenCodeConfig(existing) : mergeOpenCodeConfig(existing)
  }

  if (kind === "opencode-tui") {
    return remove ? removeOpenCodeTuiConfig(existing) : mergeOpenCodeTuiConfig(existing)
  }

  if (kind === "cursor-hooks") {
    return remove ? removeCursorHooksConfig(existing) : mergeCursorHooksConfig(existing)
  }

  if (kind === "claude-code-hooks") {
    return remove ? removeClaudeCodeHooksConfig(existing) : mergeClaudeCodeHooksConfig(existing)
  }

  return remove ? removeMcpConfig(existing) : mergeMcpConfig(existing, defaultMcpEntry())
}

export function formatJson(data: JsonObject): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
