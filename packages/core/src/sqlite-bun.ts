import { createRequire } from "node:module"
import type { StatsSqlite } from "./sqlite-types.js"

const require = createRequire(import.meta.url)

type BunDatabase = {
  run(sql: string, ...params: unknown[]): void
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number }
    get(...params: unknown[]): Record<string, unknown> | undefined
  }
  close(): void
}

/** Opens stats.db via Bun's built-in SQLite (OpenCode plugin runtime). */
export function openBunStatsSqlite(dbPath: string): StatsSqlite {
  const { Database } = require("bun:sqlite") as {
    Database: new (path: string, options?: { create?: boolean }) => BunDatabase
  }

  const db = new Database(dbPath, { create: true })
  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")

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
