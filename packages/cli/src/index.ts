#!/usr/bin/env node

import { StatsStore, defaultDbPath } from "@ctxlite/core"
import { formatText, formatJson } from "./format.js"

const HELP = `
ctxlite — token optimizer for OpenCode and Cursor

USAGE:
  ctxlite stats [options]

OPTIONS:
  --last <period>    Period: session, today, 7d, 30d, all (default: today)
  --export <format>  Export format: text, json (default: text)
  --db <path>        SQLite database path (default: ~/.ctxlite/stats.db)
  --help, -h         Show this help

EXAMPLES:
  ctxlite stats
  ctxlite stats --last 7d
  ctxlite stats --last 30d --export json
  ctxlite stats --last all
`.trimStart()

interface Args {
  subcommand: string | null
  last: string
  export: string
  db: string
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    subcommand: null,
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

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || args.subcommand === null) {
    process.stdout.write(HELP + "\n")
    process.exit(0)
  }

  if (args.subcommand !== "stats") {
    process.stderr.write(`Unknown subcommand "${args.subcommand}"\n`)
    process.stderr.write(`Run 'ctxlite --help' for usage.\n`)
    process.exit(1)
  }

  const validPeriods = ["session", "today", "7d", "30d", "all"]
  if (!validPeriods.includes(args.last)) {
    process.stderr.write(`Invalid period "${args.last}". Valid: ${validPeriods.join(", ")}\n`)
    process.exit(1)
  }

  const validFormats = ["text", "json"]
  if (!validFormats.includes(args.export)) {
    process.stderr.write(`Invalid export format "${args.export}". Valid: text, json\n`)
    process.exit(1)
  }

  let store: StatsStore | null = null
  try {
    store = new StatsStore(args.db)
    const since = periodToTimestamp(args.last)
    const summary = store.summary(since)

    const output = args.export === "json" ? formatJson(summary) : formatText(summary)

    process.stdout.write(output + "\n")
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  } finally {
    store?.close()
  }
}

main()
