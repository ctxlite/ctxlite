import { StatsStore, defaultDbPath, renderSessionBreakdown, renderSessionBreakdownDetailed } from "@ctxlite/core"
import { formatText, formatJson } from "./format.js"

/** The real, currently-logged host values (see specs/020-stats-filter-by-host/spec.md Investigation Findings). */
export const KNOWN_STATS_HOSTS = ["opencode", "claude-code", "cursor", "mcp"]

export interface Args {
  subcommand: string | null
  rest: string[]
  last: string
  export: string
  db: string
  bySession: boolean
  compact: boolean
  help: boolean
  /** Undefined = no filter. A KNOWN_STATS_HOSTS value = valid filter. Any other string = an unrecognized token runStats must report, not silently ignore. */
  host?: string
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    subcommand: null,
    rest: [],
    last: "all",
    export: "text",
    db: defaultDbPath(),
    bySession: false,
    compact: false,
    help: false,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]

    // First non-flag token is the subcommand. Capture it and its remaining
    // args as `rest` (for install/hook, which parse their own flags), then
    // keep looping — earlier versions returned here immediately, which
    // silently dropped every stats flag placed after the subcommand (the
    // conventional `ctxlite stats --last 7d` order).
    if (args.subcommand === null && arg && !arg.startsWith("-")) {
      args.subcommand = arg
      args.rest = argv.slice(i + 1)
      i++
      continue
    }

    // install/hook own their own flag syntax — don't let stats' switch
    // below misinterpret e.g. `ctxlite install --help` as the global help.
    if (args.subcommand !== null && args.subcommand !== "stats") {
      i++
      continue
    }

    // A positional, non-flag token after `stats` is a host filter — capture
    // it (normalized if recognized, raw if not, never silently dropped).
    if (args.subcommand === "stats" && arg && !arg.startsWith("-")) {
      const lower = arg.toLowerCase()
      args.host = KNOWN_STATS_HOSTS.includes(lower) ? lower : arg
      i++
      continue
    }

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
      case "--by-session":
        args.bySession = true
        break
      case "--compact":
        args.compact = true
        break
      case "--help":
      case "-h":
        args.help = true
        break
    }
    i++
  }

  return args
}

export function periodToTimestamp(period: string): number {
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

export function runStats(args: Args): number {
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

  if (args.host !== undefined && !KNOWN_STATS_HOSTS.includes(args.host)) {
    process.stderr.write(`Unrecognized host "${args.host}". Valid: ${KNOWN_STATS_HOSTS.join(", ")}\n`)
    return 1
  }

  let store: StatsStore | null = null
  try {
    store = new StatsStore(args.db)
    const since = periodToTimestamp(args.last)

    if (args.bySession) {
      const rows = store.sessionBreakdown(since, args.host)

      if (args.compact) {
        if (args.export === "json") {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n")
        } else {
          process.stdout.write(renderSessionBreakdown(rows).join("\n") + "\n")
        }
        return 0
      }

      const entries = rows.map((row) => ({
        row,
        summary: store!.summaryForSession(row.host, row.sessionId ?? ""),
      }))

      if (args.export === "json") {
        const detailed = entries.map(({ row, summary }) => ({ ...row, breakdown: summary }))
        process.stdout.write(JSON.stringify(detailed, null, 2) + "\n")
      } else {
        process.stdout.write(renderSessionBreakdownDetailed(entries).join("\n") + "\n")
      }
      return 0
    }

    const summary = store.summary(since, args.host)
    const hostFilter = args.host
    const textOpts = hostFilter === undefined ? undefined : { host: hostFilter }
    const output = args.export === "json" ? formatJson(summary) : formatText(summary, textOpts)
    process.stdout.write(output + "\n")
    return 0
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  } finally {
    store?.close()
  }
}
