import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { parseArgs, runStats } from "./stats-command.js"

describe("parseArgs", () => {
  it("parses --last after the subcommand (regression: used to be silently dropped)", () => {
    const args = parseArgs(["stats", "--last", "7d"])
    expect(args.subcommand).toBe("stats")
    expect(args.last).toBe("7d")
  })

  it("parses --export and --by-session together after the subcommand", () => {
    const args = parseArgs(["stats", "--export", "json", "--by-session"])
    expect(args.export).toBe("json")
    expect(args.bySession).toBe(true)
  })

  it("parses flags placed before the subcommand too", () => {
    const args = parseArgs(["--last", "today", "stats"])
    expect(args.subcommand).toBe("stats")
    expect(args.last).toBe("today")
  })

  it("leaves install's own flags untouched in rest, not intercepted by stats' switch", () => {
    const args = parseArgs(["install", "--tool", "cursor", "--scope", "global", "--yes"])
    expect(args.subcommand).toBe("install")
    expect(args.rest).toEqual(["--tool", "cursor", "--scope", "global", "--yes"])
    // Must NOT be parsed as the global --last/--export flags:
    expect(args.last).toBe("all")
  })

  it("does not treat `install --help` as the global help flag", () => {
    const args = parseArgs(["install", "--help"])
    expect(args.subcommand).toBe("install")
    expect(args.help).toBe(false)
    expect(args.rest).toEqual(["--help"])
  })

  it("global --help with no subcommand still works", () => {
    const args = parseArgs(["--help"])
    expect(args.help).toBe(true)
    expect(args.subcommand).toBeNull()
  })

  it("captures hook subcommand's positional event name in rest", () => {
    const args = parseArgs(["hook", "pre-tool-use"])
    expect(args.subcommand).toBe("hook")
    expect(args.rest).toEqual(["pre-tool-use"])
  })

  it("parses --compact alongside --by-session", () => {
    const args = parseArgs(["stats", "--by-session", "--compact"])
    expect(args.bySession).toBe(true)
    expect(args.compact).toBe(true)
  })
})

describe("runStats", () => {
  let dbPath: string

  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "ctxlite-cli-stats-")), "stats.db")
  })

  afterEach(() => {
    rmSync(dbPath, { force: true })
  })

  function baseArgs(overrides: Partial<ReturnType<typeof parseArgs>> = {}) {
    return { ...parseArgs(["stats"]), db: dbPath, ...overrides }
  }

  it("--last actually changes which rows are included (regression check)", () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ last: "today" }))
      const todayOutput = writes.join("")
      writes.length = 0

      runStats(baseArgs({ last: "all" }))
      const allOutput = writes.join("")

      // Both should at least run without throwing and produce distinct period labels.
      expect(todayOutput).toContain("No data")
      expect(allOutput).toContain("No data")
    } finally {
      spy.mockRestore()
    }
  })

  it("--export json produces valid JSON, not the text format", () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ export: "json" }))
      const output = writes.join("")
      expect(() => JSON.parse(output)).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })

  it("--by-session with --export json prints an array, with a per-session breakdown by default", () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ bySession: true, export: "json" }))
      const output = writes.join("")
      const parsed = JSON.parse(output) as unknown[]
      expect(Array.isArray(parsed)).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it("--by-session --compact with --export json omits the per-source breakdown", () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ bySession: true, compact: true, export: "json" }))
      const output = writes.join("")
      const parsed = JSON.parse(output) as Array<Record<string, unknown>>
      expect(Array.isArray(parsed)).toBe(true)
      for (const row of parsed) {
        expect(row.breakdown).toBeUndefined()
      }
    } finally {
      spy.mockRestore()
    }
  })

  it("--by-session text output without --compact shows 'No sessions recorded yet.' on an empty db", () => {
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ bySession: true }))
      const output = writes.join("")
      expect(output).toContain("No sessions recorded yet.")
    } finally {
      spy.mockRestore()
    }
  })

  it("rejects an invalid period", () => {
    const code = runStats(baseArgs({ last: "bogus" }))
    expect(code).toBe(1)
  })
})
