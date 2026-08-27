import * as readline from "node:readline/promises"
import {
  ALL_TOOLS,
  planInstall,
  refreshOpenCodePlugin,
  runInstall,
  parseTools,
  toolLabel,
  type InstallScope,
  type InstallTool,
} from "@ctxlite/core"

const HELP = `
ctxlite install — configure ctxlite in OpenCode

Cursor and Claude Code were previously supported here too; that support is
currently disabled while ctxlite's efficiency work focuses on OpenCode
specifically (see docs/benchmarks.md). Their install/merge code still
exists (a prior Cursor/Claude Code install keeps working), it's just no
longer offered by this command.

USAGE:
  ctxlite install [options]

OPTIONS:
  --tool <id>         opencode, all (comma-separated; "all" is currently just opencode)
  --scope <scope>     global (user) or project (default: global)
  --project-dir <dir> Project root for project scope (default: cwd)
  --yes, -y           Apply without confirmation
  --dry-run           Show planned changes only
  --remove            Remove ctxlite entries instead of adding
  --help, -h          Show this help

EXAMPLES:
  ctxlite install
  ctxlite install --tool opencode --scope global --yes
  ctxlite install --tool all --scope project --dry-run
  ctxlite install --remove --tool opencode --scope global --yes

CONFIG PATHS:
  OpenCode (global)            ~/.config/opencode/opencode.json + tui.json
  OpenCode (project)           opencode.json + tui.json
`.trimStart()

export interface InstallArgs {
  tools: InstallTool[] | null
  scope: InstallScope
  projectDir: string
  yes: boolean
  dryRun: boolean
  remove: boolean
  help: boolean
}

export function parseInstallArgs(argv: string[]): InstallArgs {
  const args: InstallArgs = {
    tools: null,
    scope: "global",
    projectDir: process.cwd(),
    yes: false,
    dryRun: false,
    remove: false,
    help: false,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    switch (arg) {
      case "--tool":
        args.tools = parseTools(argv[++i])
        break
      case "--scope":
        args.scope = parseScope(argv[++i])
        break
      case "--project-dir":
        args.projectDir = argv[++i] ?? process.cwd()
        break
      case "--yes":
      case "-y":
        args.yes = true
        break
      case "--dry-run":
        args.dryRun = true
        break
      case "--remove":
        args.remove = true
        break
      case "--help":
      case "-h":
        args.help = true
        break
      default:
        throw new Error(`Unknown option "${arg}"`)
    }
    i++
  }

  return args
}

function parseScope(value: string | undefined): InstallScope {
  if (value === "global" || value === "project") {
    return value
  }
  throw new Error(`Invalid scope "${value}". Valid: global, project`)
}

async function promptTools(): Promise<InstallTool[]> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write("Select tools (comma-separated numbers, default: all):\n")
    ALL_TOOLS.forEach((tool, index) => {
      process.stdout.write(`  ${index + 1}. ${toolLabel(tool)}\n`)
    })

    const answer = (await rl.question("> ")).trim()
    if (!answer) {
      return [...ALL_TOOLS]
    }

    const selected = answer
      .split(",")
      .map((part) => Number(part.trim()) - 1)
      .filter((index) => index >= 0 && index < ALL_TOOLS.length)
      .map((index) => ALL_TOOLS[index] as InstallTool)

    if (selected.length === 0) {
      throw new Error("No valid tools selected")
    }

    return [...new Set(selected)]
  } finally {
    rl.close()
  }
}

async function promptScope(): Promise<InstallScope> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write("Scope [1=global (user), 2=project] (default: 1): ")
    const answer = (await rl.question("")).trim()
    if (!answer || answer === "1") return "global"
    if (answer === "2") return "project"
    throw new Error(`Invalid scope selection "${answer}"`)
  } finally {
    rl.close()
  }
}

async function promptConfirm(planSummary: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write(planSummary + "\nProceed? [y/N]: ")
    const answer = (await rl.question("")).trim().toLowerCase()
    return answer === "y" || answer === "yes"
  } finally {
    rl.close()
  }
}

function formatPlan(items: Awaited<ReturnType<typeof planInstall>>): string {
  return items.map((item) => `[${item.action}] ${item.message}`).join("\n")
}

export async function runInstallCommand(argv: string[]): Promise<number> {
  let args: InstallArgs
  try {
    args = parseInstallArgs(argv)
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  if (args.help) {
    process.stdout.write(HELP + "\n")
    return 0
  }

  let tools = args.tools
  if (!tools) {
    if (!process.stdin.isTTY) {
      process.stderr.write("Error: --tool is required in non-interactive mode\n")
      return 1
    }
    tools = await promptTools()
    if (!argv.some((arg) => arg === "--scope")) {
      args.scope = await promptScope()
    }
  }

  const plan = await planInstall({
    tools,
    scope: args.scope,
    projectDir: args.projectDir,
    dryRun: true,
    remove: args.remove,
  })

  const summary = formatPlan(plan)
  process.stdout.write(summary + "\n")

  if (args.dryRun) {
    return 0
  }

  if (!args.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write("Error: use --yes in non-interactive mode\n")
      return 1
    }
    const confirmed = await promptConfirm(summary)
    if (!confirmed) {
      process.stdout.write("Cancelled.\n")
      return 0
    }
  }

  const result = await runInstall({
    tools,
    scope: args.scope,
    projectDir: args.projectDir,
    remove: args.remove,
  })

  const changed = result.filter((item) => item.action !== "skip")
  if (changed.length === 0) {
    process.stdout.write("Nothing to change.\n")
  } else {
    process.stdout.write(`Done. Updated ${changed.length} file(s).\n`)
    process.stdout.write("Restart OpenCode to load changes.\n")
  }

  if (!args.remove && tools.includes("opencode")) {
    const refresh = await refreshOpenCodePlugin(args.scope)
    if (refresh.attempted) {
      process.stdout.write(`${refresh.message}.\n`)
    }
  }

  return 0
}
