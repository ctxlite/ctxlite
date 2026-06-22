import { createRequire } from "node:module"
import { openBunStatsSqlite } from "./sqlite-bun.js"
import type { StatsSqlite } from "./sqlite-types.js"

export type { StatsSqlite } from "./sqlite-types.js"

const require = createRequire(import.meta.url)

/** True when running inside OpenCode (Bun), not Node.js. */
export function isBunRuntime(): boolean {
  return typeof (globalThis as { Bun?: { version?: string } }).Bun !== "undefined"
}

function openNodeStatsSqlite(dbPath: string): StatsSqlite {
  // Lazy require — never loaded under Bun (OpenCode plugin runtime).
  type BetterSqliteDatabase = {
    pragma(name: string, value?: string): void
    exec(sql: string): void
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number }
      get(...params: unknown[]): Record<string, unknown> | undefined
    }
    close(): void
  }

  const Database = require("better-sqlite3") as new (path: string) => BetterSqliteDatabase
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("synchronous = NORMAL")

  return {
    exec(sql: string) {
      db.exec(sql)
    },
    run(sql: string, ...params: unknown[]) {
      return db.prepare(sql).run(...params)
    },
    get<T extends Record<string, unknown>>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).get(...params) as T | undefined
    },
    close() {
      db.close()
    },
  }
}

/**
 * Opens stats.db with bun:sqlite under Bun (OpenCode plugin) or
 * better-sqlite3 under Node (CLI, MCP, tests).
 */
export function openStatsSqlite(dbPath: string): StatsSqlite {
  if (isBunRuntime()) {
    return openBunStatsSqlite(dbPath)
  }
  return openNodeStatsSqlite(dbPath)
}
