import { describe, it, expect, vi, beforeEach } from "vitest"

// `bun:sqlite` is a Bun-builtin virtual module that doesn't exist under Node —
// openBunStatsSqlite() only ever runs inside the Bun-hosted OpenCode plugin
// process. Mocking node:module's createRequire to hand back a fake Database
// lets us verify the adapter wiring (which SQL pragmas run, how each adapter
// method maps onto the underlying Bun API) without needing the real runtime.
const run = vi.fn()
const exec = vi.fn()
const prepareRun = vi.fn().mockReturnValue({ changes: 1 })
const prepareGet = vi.fn().mockReturnValue({ id: 1 })
const prepareAll = vi.fn().mockReturnValue([{ id: 1 }, { id: 2 }])
const close = vi.fn()
const prepare = vi.fn().mockReturnValue({ run: prepareRun, get: prepareGet, all: prepareAll })

class FakeDatabase {
  run = run
  exec = exec
  prepare = prepare
  close = close
}

vi.mock("node:module", () => ({
  createRequire: () => (specifier: string) => {
    if (specifier === "bun:sqlite") {
      return { Database: FakeDatabase }
    }
    throw new Error(`unexpected require: ${specifier}`)
  },
}))

const { openBunStatsSqlite } = await import("./sqlite-bun.js")

describe("openBunStatsSqlite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sets the expected pragmas on open", () => {
    openBunStatsSqlite("/tmp/stats.db")

    expect(run).toHaveBeenCalledWith("PRAGMA journal_mode = WAL")
    expect(run).toHaveBeenCalledWith("PRAGMA synchronous = NORMAL")
    expect(run).toHaveBeenCalledWith("PRAGMA busy_timeout = 5000")
  })

  it("exec() delegates to the underlying database", () => {
    const adapter = openBunStatsSqlite("/tmp/stats.db")
    adapter.exec("CREATE TABLE foo (id INTEGER)")
    expect(exec).toHaveBeenCalledWith("CREATE TABLE foo (id INTEGER)")
  })

  it("run() prepares the statement and runs it with params", () => {
    const adapter = openBunStatsSqlite("/tmp/stats.db")
    const result = adapter.run("INSERT INTO foo VALUES (?)", 42)

    expect(prepare).toHaveBeenCalledWith("INSERT INTO foo VALUES (?)")
    expect(prepareRun).toHaveBeenCalledWith(42)
    expect(result).toEqual({ changes: 1 })
  })

  it("get() prepares the statement and returns a single row", () => {
    const adapter = openBunStatsSqlite("/tmp/stats.db")
    const row = adapter.get<{ id: number }>("SELECT * FROM foo WHERE id = ?", 1)

    expect(prepareGet).toHaveBeenCalledWith(1)
    expect(row).toEqual({ id: 1 })
  })

  it("all() prepares the statement and returns every row", () => {
    const adapter = openBunStatsSqlite("/tmp/stats.db")
    const rows = adapter.all<{ id: number }>("SELECT * FROM foo")

    expect(prepareAll).toHaveBeenCalled()
    expect(rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("close() delegates to the underlying database", () => {
    const adapter = openBunStatsSqlite("/tmp/stats.db")
    adapter.close()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
