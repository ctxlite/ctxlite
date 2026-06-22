import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { buildTargets, toPathContext } from "./paths.js"
import { applyConfigChange, formatJson } from "./merge.js"
import { toolLabel } from "./paths.js"
import type { InstallOptions, InstallPlanItem, InstallTool } from "./types.js"
import { ALL_TOOLS } from "./types.js"

async function readJsonFile(path: string): Promise<{ exists: boolean; data: unknown }> {
  try {
    const raw = await readFile(path, "utf8")
    return { exists: true, data: JSON.parse(raw) as unknown }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, data: {} }
    }
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${err.message}`)
    }
    throw err
  }
}

function actionFor(existed: boolean, changed: boolean, remove: boolean): InstallPlanItem["action"] {
  if (!changed) return "skip"
  if (remove) return "remove"
  return existed ? "update" : "create"
}

export function parseTools(input: string | undefined): InstallTool[] {
  if (!input || input === "all") {
    return [...ALL_TOOLS]
  }

  const values = input.split(",").map((part) => part.trim()).filter(Boolean)
  const allowed = new Set(ALL_TOOLS)
  const tools: InstallTool[] = []

  for (const value of values) {
    if (!allowed.has(value as InstallTool)) {
      throw new Error(`Unknown tool "${value}". Valid: ${ALL_TOOLS.join(", ")}, all`)
    }
    tools.push(value as InstallTool)
  }

  return [...new Set(tools)]
}

export async function planInstall(options: InstallOptions): Promise<InstallPlanItem[]> {
  const ctx = toPathContext(options)
  const targets = buildTargets(options.tools, options.scope, ctx)
  const remove = options.remove ?? false
  const items: InstallPlanItem[] = []

  for (const target of targets) {
    const { exists, data } = await readJsonFile(target.configPath)
    const { changed } = applyConfigChange(target.kind, data, remove)
    const action = actionFor(exists, changed, remove)
    const verb = remove ? "Remove" : "Add"
    const message =
      action === "skip"
        ? `${toolLabel(target.tool)} (${target.scope}): already configured — ${target.configPath}`
        : `${verb} ${toolLabel(target.tool)} (${target.scope}) → ${target.configPath}`

    items.push({
      tool: target.tool,
      scope: target.scope,
      configPath: target.configPath,
      action,
      message,
    })
  }

  return items
}

export async function runInstall(options: InstallOptions): Promise<InstallPlanItem[]> {
  const plan = await planInstall(options)
  if (options.dryRun) {
    return plan
  }

  const ctx = toPathContext(options)
  const targets = buildTargets(options.tools, options.scope, ctx)
  const remove = options.remove ?? false

  for (const target of targets) {
    const planItem = plan.find(
      (item) => item.tool === target.tool && item.configPath === target.configPath,
    )
    if (!planItem || planItem.action === "skip") {
      continue
    }

    const { data } = await readJsonFile(target.configPath)
    const { next } = applyConfigChange(target.kind, data, remove)
    await mkdir(dirname(target.configPath), { recursive: true })
    await writeFile(target.configPath, formatJson(next), "utf8")
  }

  return plan
}
