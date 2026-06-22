#!/usr/bin/env node

import { StatsStore, defaultDbPath } from "@ctxlite/core"
import { formatText, formatJson } from "./format.js"
import { runInstallCommand } from "./install.js"

const HELP = `
ctxlite — token optimizer for OpenCode and Cursor

USAGE:
  ctxlite stats [options]
  ctxlite install [options]

COMMANDS:
  stats     Show token savings statistics
  install   Configure ctxlite in Cursor, OpenCode, or Claude Code

GLOBAL OPTIONS:
  --help, -h         Show this help

STATS OPTIONS:
  --last <period>    Period: session, today, 7d, 30d, all (default: today)
  --export <format>  Export format: text, json (default: text)
  --db <path>        SQLite database path (default: ~/.ctxlite/stats.db)

EXAMPLES:
  ctxlite stats
  ctxlite stats --last 7d
  ctxlite install --tool cursor --scope global --yes
  ctxlite install --tool all --scope global --dry-run
`.trimStart()

interface Args {
  subcommand: string | null
  rest: string[]
  last: string
  export: string
  db: string
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    subcommand: null,
    rest: [],
    last: "today",
    export: "text",
    db: defaultDbPath(),
    help: false,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    switch (arg) {
      case "--last":
        args.last = argv[++i] ?? "today"
        break
      case "--export":
        args.export = argv[++i] ?? "text"
        break
      case "--db":
        args.db = argv[++i] ?? defaultDbPath()
        break
      case "--help":
      case "-h":
        args.help = true
        break
      default:
        if (arg && !arg.startsWith("-") && args.subcommand === null) {
          args.subcommand = arg
          args.rest = argv.slice(i + 1)
          return args
        }
    }
    i++
  }

  return args
}

function periodToTimestamp(period: string): number {
  const now = Math.floor(Date.now() / 1000)
  switch (period) {
    case "session":
      return now - 3600
    case "today": {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return Math.floor(d.getTime() / 1000)
    }
    case "7d":
      return now - 7 * 86400
    case "30d":
      return now - 30 * 86400
    case "all":
      return 0
    default: {
      process.stderr.write(`Unknown period "${period}", using "today"\n`)
      const d2 = new Date()
      d2.setHours(0, 0, 0, 0)
      return Math.floor(d2.getTime() / 1000)
    }
  }
}

function runStats(args: Args): number {
  const validPeriods = ["session", "today", "7d", "30d", "all"]
  if (!validPeriods.includes(args.last)) {
    process.stderr.write(`Invalid period "${args.last}". Valid: ${validPeriods.join(", ")}\n`)
    return 1
  }

  const validFormats = ["text", "json"]
  if (!validFormats.includes(args.export)) {
    process.stderr.write(`Invalid export format "${args.export}". Valid: text, json\n`)
    return 1
  }

  let store: StatsStore | null = null
  try {
    store = new StatsStore(args.db)
    const since = periodToTimestamp(args.last)
    const summary = store.summary(since)
    const output = args.export === "json" ? formatJson(summary) : formatText(summary)
    process.stdout.write(output + "\n")
    return 0
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  } finally {
    store?.close()
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || args.subcommand === null) {
    process.stdout.write(HELP + "\n")
    process.exit(0)
  }

  if (args.subcommand === "stats") {
    process.exit(runStats(args))
  }

  if (args.subcommand === "install") {
    process.exit(await runInstallCommand(args.rest))
  }

  process.stderr.write(`Unknown subcommand "${args.subcommand}"\n`)
  process.stderr.write(`Run 'ctxlite --help' for usage.\n`)
  process.exit(1)
}

main()
