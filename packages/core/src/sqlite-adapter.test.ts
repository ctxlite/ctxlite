import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock node:module's createRequire so openNodeStatsSqlite's internal
// require("better-sqlite3") / require("node:sqlite") calls are fully
// controllable — lets us exercise the better-sqlite3 failure -> node:sqlite
// fallback -> final-throw chain without needing a real broken native module.
let betterSqlite3Impl: () => unknown = () => {
  throw new Error("not mocked")
}
let nodeSqliteImpl: () => unknown = () => {
  throw new Error("not mocked")
}

vi.mock("node:module", () => ({
  createRequire: () => (specifier: string) => {
    if (specifier === "better-sqlite3") return betterSqlite3Impl()
    if (specifier === "node:sqlite") return nodeSqliteImpl()
    throw new Error(`unexpected require: ${specifier}`)
  },
}))

vi.mock("./sqlite-bun.js", () => ({
  openBunStatsSqlite: vi.fn(() => ({ marker: "bun" })),
}))

const { openStatsSqlite, isBunRuntime } = await import("./sqlite-adapter.js")
const { openBunStatsSqlite } = await import("./sqlite-bun.js")

function fakePreparedDb() {
  const pragma = vi.fn()
  const exec = vi.fn()
  const close = vi.fn()
  const run = vi.fn().mockReturnValue({ changes: 1 })
  const get = vi.fn().mockReturnValue({ id: 1 })
  const all = vi.fn().mockReturnValue([{ id: 1 }])
  const prepare = vi.fn().mockReturnValue({ run, get, all })
  return { pragma, exec, close, prepare, run, get, all }
}

describe("isBunRuntime", () => {
  afterEach(() => {
    delete (globalThis as { Bun?: unknown }).Bun
  })

  it("is false when globalThis.Bun is undefined", () => {
    expect(isBunRuntime()).toBe(false)
  })

  it("is true when globalThis.Bun is defined", () => {
    ;(globalThis as { Bun?: unknown }).Bun = { version: "1.0.0" }
    expect(isBunRuntime()).toBe(true)
  })
})

describe("openStatsSqlite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as { Bun?: unknown }).Bun
  })

  it("opens via Bun's adapter when running under Bun", () => {
    ;(globalThis as { Bun?: unknown }).Bun = { version: "1.0.0" }
    const adapter = openStatsSqlite("/tmp/stats.db")
    expect(openBunStatsSqlite).toHaveBeenCalledWith("/tmp/stats.db")
    expect(adapter).toEqual({ marker: "bun" })
  })

  it("opens via better-sqlite3 and sets pragmas when it's available", () => {
    const fake = fakePreparedDb()
    class FakeDatabase {
      constructor() {
        return fake as unknown as FakeDatabase
      }
    }
    betterSqlite3Impl = () => FakeDatabase

    const adapter = openStatsSqlite("/tmp/stats.db")
    expect(fake.pragma).toHaveBeenCalledWith("journal_mode = WAL")
    expect(fake.pragma).toHaveBeenCalledWith("synchronous = NORMAL")
    expect(fake.pragma).toHaveBeenCalledWith("busy_timeout = 5000")

    adapter.exec("CREATE TABLE x (id INTEGER)")
    expect(fake.exec).toHaveBeenCalledWith("CREATE TABLE x (id INTEGER)")

    const row = adapter.get<{ id: number }>("SELECT * FROM x")
    expect(row).toEqual({ id: 1 })

    const rows = adapter.all<{ id: number }>("SELECT * FROM x")
    expect(rows).toEqual([{ id: 1 }])

    adapter.close()
    expect(fake.close).toHaveBeenCalledTimes(1)
  })

  it("run() falls back to statement.changes when the result has no own changes field", () => {
    const fake = fakePreparedDb()
    fake.run.mockReturnValue(undefined)
    fake.prepare.mockReturnValue({ run: fake.run, get: fake.get, all: fake.all, changes: 7 })
    class FakeDatabase {
      constructor() {
        return fake as unknown as FakeDatabase
      }
    }
    betterSqlite3Impl = () => FakeDatabase

    const adapter = openStatsSqlite("/tmp/stats.db")
    expect(adapter.run("DELETE FROM x")).toEqual({ changes: 7 })
  })

  it("falls back to node:sqlite when better-sqlite3 fails to load", () => {
    betterSqlite3Impl = () => {
      throw new Error("NODE_MODULE_VERSION mismatch")
    }
    const fake = fakePreparedDb()
    class FakeDatabaseSync {
      constructor() {
        return fake as unknown as FakeDatabaseSync
      }
    }
    nodeSqliteImpl = () => ({ DatabaseSync: FakeDatabaseSync })

    const adapter = openStatsSqlite("/tmp/stats.db")
    expect(fake.exec).toHaveBeenCalledWith("PRAGMA journal_mode = WAL")
    expect(fake.exec).toHaveBeenCalledWith("PRAGMA synchronous = NORMAL")
    expect(fake.exec).toHaveBeenCalledWith("PRAGMA busy_timeout = 5000")
    expect(adapter).toBeDefined()
  })

  it("throws a clear error when neither better-sqlite3 nor node:sqlite are available", () => {
    betterSqlite3Impl = () => {
      throw new Error("native module mismatch")
    }
    nodeSqliteImpl = () => {
      throw new Error("not available on this Node version")
    }

    expect(() => openStatsSqlite("/tmp/stats.db")).toThrow(/cannot open stats\.db/)
  })
})
