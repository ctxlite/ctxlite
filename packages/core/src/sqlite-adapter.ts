import { createRequire } from "node:module"
import { openBunStatsSqlite } from "./sqlite-bun.js"
import type { StatsSqlite } from "./sqlite-types.js"

export type { StatsSqlite } from "./sqlite-types.js"

const require = createRequire(import.meta.url)

type SqliteStatement = {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
  changes?: number
}

type PreparedDb = {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
  pragma?: (name: string, value?: string) => void
}

function wrapDb(db: PreparedDb): StatsSqlite {
  return {
    exec(sql: string) {
      db.exec(sql)
    },
    run(sql: string, ...params: unknown[]) {
      const stmt = db.prepare(sql)
      const result = stmt.run(...params)
      if (result && typeof result === "object" && "changes" in result) {
        return { changes: (result as { changes: number }).changes }
      }
      return { changes: stmt.changes ?? 0 }
    },
    get<T extends Record<string, unknown>>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).get(...params) as T | undefined
    },
    all<T extends Record<string, unknown>>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...params) as T[]
    },
    close() {
      db.close()
    },
  }
}

/** True when running inside OpenCode (Bun), not Node.js. */
export function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: { version?: string } }).Bun !== "undefined"
}

function hasNodeBuiltinSqlite(): boolean {
  try {
    require("node:sqlite")
    return true
  } catch {
    return false
  }
}

function openNodeBetterSqlite3(dbPath: string): StatsSqlite {
  const Database = require("better-sqlite3") as new (path: string) => PreparedDb
  const db = new Database(dbPath)
  db.pragma?.("journal_mode = WAL")
  db.pragma?.("synchronous = NORMAL")
  db.pragma?.("busy_timeout = 5000")
  return wrapDb(db)
}

/** Node 22+ built-in sqlite — no native addon, avoids MODULE_VERSION mismatch. */
function openNodeBuiltinSqlite(dbPath: string): StatsSqlite {
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (path: string) => PreparedDb
  }
  const db = new DatabaseSync(dbPath)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = NORMAL")
  db.exec("PRAGMA busy_timeout = 5000")
  return wrapDb(db)
}

function openNodeStatsSqlite(dbPath: string): StatsSqlite {
  try {
    return openNodeBetterSqlite3(dbPath)
  } catch {
    if (hasNodeBuiltinSqlite()) {
      return openNodeBuiltinSqlite(dbPath)
    }
    throw new Error(
      "ctxlite: cannot open stats.db — better-sqlite3 native module mismatch. " +
        "Use Node 22+, run `npm rebuild better-sqlite3`, or upgrade @ctxlite/core.",
    )
  }
}

/**
 * Opens stats.db:
 * - Bun (OpenCode plugin) → bun:sqlite
 * - Node CLI/MCP → better-sqlite3, falling back to node:sqlite (Node 22+)
 */
export function openStatsSqlite(dbPath: string): StatsSqlite {
  if (isBunRuntime()) {
    return openBunStatsSqlite(dbPath)
  }
  return openNodeStatsSqlite(dbPath)
}
