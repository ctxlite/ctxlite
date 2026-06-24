import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

// Black-box tests against the built CLI binary — index.ts calls main()/process.exit()
// at module load, so it can't be imported directly under a test runner without
// killing the process. Spawning the actual dist/index.js is the non-invasive way
// to exercise it without touching source.
const DIST_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js")

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [DIST_ENTRY, ...args], { encoding: "utf8" })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

describe("cli entrypoint (dist/index.js)", () => {
  let dbPath: string

  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "ctxlite-cli-entry-")), "stats.db")
  })

  afterEach(() => {
    rmSync(dirname(dbPath), { recursive: true, force: true })
  })

  it("prints help and exits 0 with no subcommand", () => {
    const { stdout, status } = runCli([])
    expect(status).toBe(0)
    expect(stdout).toContain("ctxlite — token optimizer")
  })

  it("prints help and exits 0 with --help", () => {
    const { stdout, status } = runCli(["--help"])
    expect(status).toBe(0)
    expect(stdout).toContain("USAGE:")
  })

  it("runs the stats subcommand against an isolated db", () => {
    const { stdout, status } = runCli(["stats", "--db", dbPath])
    expect(status).toBe(0)
    expect(stdout).toContain("No data recorded yet")
  })

  it("exits 1 and prints an error for an unknown subcommand", () => {
    const { stderr, status } = runCli(["frobnicate"])
    expect(status).toBe(1)
    expect(stderr).toContain("Unknown subcommand")
  })

  it("hook with an unknown event name exits 0 without blocking the tool call", () => {
    const result = spawnSync(process.execPath, [DIST_ENTRY, "hook", "not-a-real-event"], {
      encoding: "utf8",
      input: "{}",
    })
    expect(result.status).toBe(0)
  })
})
