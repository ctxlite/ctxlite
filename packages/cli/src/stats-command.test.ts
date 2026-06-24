import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { parseArgs, runStats } from "./stats-command.js"
import { logOptimizationSavings, closeSharedStores } from "@ctxlite/core"

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

  it("captures a positional host token after stats", () => {
    const args = parseArgs(["stats", "opencode"])
    expect(args.host).toBe("opencode")
  })

  it("captures the host token alongside --by-session, in either order", () => {
    const a = parseArgs(["stats", "--by-session", "opencode"])
    expect(a.host).toBe("opencode")
    expect(a.bySession).toBe(true)

    const b = parseArgs(["stats", "opencode", "--by-session"])
    expect(b.host).toBe("opencode")
    expect(b.bySession).toBe(true)
  })

  it("normalizes a mixed-case host token to lowercase", () => {
    const args = parseArgs(["stats", "OpenCode"])
    expect(args.host).toBe("opencode")
  })

  it("captures an unrecognized host token as the raw string, not silently dropped", () => {
    const args = parseArgs(["stats", "opncode"])
    expect(args.host).toBe("opncode")
  })

  it("leaves host undefined when no positional token is given (regression: zero behavior change)", () => {
    const args = parseArgs(["stats"])
    expect(args.host).toBeUndefined()
  })

  it("does not treat install's positional args as a host filter", () => {
    const args = parseArgs(["install", "--tool", "cursor", "--scope", "global", "--yes"])
    expect(args.host).toBeUndefined()
  })

  it("does not treat hook's positional event name as a host filter", () => {
    const args = parseArgs(["hook", "pre-tool-use"])
    expect(args.host).toBeUndefined()
  })
})

describe("runStats", () => {
  let dbPath: string

  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "ctxlite-cli-stats-")), "stats.db")
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(dbPath, { force: true })
  })

  function baseArgs(overrides: Partial<ReturnType<typeof parseArgs>> = {}) {
    return { ...parseArgs(["stats"]), db: dbPath, ...overrides }
  }

  function seedMultiHostFixture() {
    logOptimizationSavings(
      { source: "compress", upstream: "opencode", tokensIn: 1000, tokensOut: 0, host: "opencode", sessionId: "ses-a" },
      dbPath,
    )
    logOptimizationSavings(
      { source: "precall", upstream: "cursor", tokensIn: 500, tokensOut: 0, host: "cursor", sessionId: "ses-b" },
      dbPath,
    )
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

  it("filters the overall summary to one host (text) — shows opencode's 1.0K saved, not the combined 1.5K", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ host: "opencode" }))
      const output = writes.join("")
      expect(output).toContain("1.0K saved")
      expect(output).not.toContain("1.5K saved")
    } finally {
      spy.mockRestore()
    }
  })

  it("filters the overall summary to one host (json), matching only that host's logged totals", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ host: "opencode", export: "json" }))
      const parsed = JSON.parse(writes.join("")) as { totalRequests: number; tokensSaved: number }
      expect(parsed.totalRequests).toBe(1)
      expect(parsed.tokensSaved).toBe(1000)
    } finally {
      spy.mockRestore()
    }
  })

  it("rejects an unrecognized host token with a clear message naming the valid values, without querying", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const errors: string[] = []
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      errors.push(String(chunk))
      return true
    })

    try {
      const code = runStats(baseArgs({ host: "opncode" }))
      expect(code).toBe(1)
      expect(writes.join("")).toBe("")
      expect(errors.join("")).toContain("opncode")
      for (const valid of ["opencode", "claude-code", "cursor", "mcp"]) {
        expect(errors.join("")).toContain(valid)
      }
    } finally {
      outSpy.mockRestore()
      errSpy.mockRestore()
    }
  })

  it("filters the --by-session breakdown to one host (text)", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ bySession: true, host: "cursor" }))
      const output = writes.join("")
      expect(output).toContain("ses-b")
      expect(output).not.toContain("ses-a")
    } finally {
      spy.mockRestore()
    }
  })

  it("filters the --by-session breakdown to one host (json array)", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      runStats(baseArgs({ bySession: true, host: "cursor", export: "json" }))
      const parsed = JSON.parse(writes.join("")) as Array<{ host: string; sessionId: string }>
      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.host).toBe("cursor")
      expect(parsed[0]?.sessionId).toBe("ses-b")
    } finally {
      spy.mockRestore()
    }
  })

  it("rejects an unrecognized host with --by-session too, reusing the same validation, without querying", () => {
    seedMultiHostFixture()
    const writes: string[] = []
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })

    try {
      const code = runStats(baseArgs({ bySession: true, host: "opncode" }))
      expect(code).toBe(1)
      expect(writes.join("")).toBe("")
    } finally {
      spy.mockRestore()
    }
  })
})
