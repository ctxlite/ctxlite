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

export function applyConfigChange(
  kind: ConfigKind,
  existing: unknown,
  remove: boolean,
): { next: JsonObject; changed: boolean } {
  if (kind === "opencode") {
    return remove ? removeOpenCodeConfig(existing) : mergeOpenCodeConfig(existing)
  }

  return remove ? removeMcpConfig(existing) : mergeMcpConfig(existing, defaultMcpEntry())
}

export function formatJson(data: JsonObject): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
