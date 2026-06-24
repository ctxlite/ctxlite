#!/usr/bin/env node

import { parseArgs, runStats } from "./stats-command.js"
import { runInstallCommand } from "./install.js"
import { runPreToolUseHook, runPostToolUseHook } from "./hook.js"
import { runCursorPreToolUseHook } from "./cursor-hook.js"

const HELP = `
ctxlite — token optimizer for OpenCode and Cursor

USAGE:
  ctxlite stats [<host>] [options]
  ctxlite install [options]
  ctxlite hook <pre-tool-use|post-tool-use|cursor-pre-tool-use>

COMMANDS:
  stats     Show token savings statistics
  install   Configure ctxlite in Cursor, OpenCode, or Claude Code
  hook      Claude Code / Cursor hook bridge (reads JSON from stdin) — not for manual use

GLOBAL OPTIONS:
  --help, -h         Show this help

STATS OPTIONS:
  <host>              Filter to one host: opencode, claude-code, cursor, mcp (default: all hosts combined)
  --last <period>     Period: session, today, 7d, 30d, all (default: all)
  --export <format>   Export format: text, json (default: text)
  --db <path>         SQLite database path (default: ~/.ctxlite/stats.db)
  --by-session        Break the total down by host (OpenCode/Claude Code/Cursor/MCP) then session,
                       instead of one combined total

EXAMPLES:
  ctxlite stats
  ctxlite stats opencode
  ctxlite stats --last 7d
  ctxlite stats --by-session
  ctxlite stats --by-session cursor
  ctxlite install --tool cursor --scope global --yes
  ctxlite install --tool all --scope global --dry-run

SUPPORT:
  If ctxlite is saving you tokens: https://ko-fi.com/techdebeci
`.trimStart()

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

  if (args.subcommand === "hook") {
    const event = args.rest[0]
    if (event === "pre-tool-use") {
      process.exit(await runPreToolUseHook())
    }
    if (event === "post-tool-use") {
      process.exit(await runPostToolUseHook())
    }
    if (event === "cursor-pre-tool-use") {
      process.exit(await runCursorPreToolUseHook())
    }
    // Unknown hook event — never block the user's tool call.
    process.exit(0)
  }

  process.stderr.write(`Unknown subcommand "${args.subcommand}"\n`)
  process.stderr.write(`Run 'ctxlite --help' for usage.\n`)
  process.exit(1)
}

main()
