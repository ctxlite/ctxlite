// SQLite stats store with better-sqlite3

import Database from "better-sqlite3"
import { mkdirSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import { estimateCost } from "./tokens.js"
import type { CacheStats, RequestLog, Summary, TrimResult } from "./types.js"

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS requests (
    id           TEXT    PRIMARY KEY,
    ts           INTEGER NOT NULL,
    upstream     TEXT    NOT NULL DEFAULT '',
    trimmed      BOOLEAN NOT NULL DEFAULT 0,
    tokens_in    INTEGER NOT NULL DEFAULT 0,
    tokens_used  INTEGER NOT NULL DEFAULT 0,
    tokens_out   INTEGER NOT NULL DEFAULT 0,
    tokens_saved INTEGER NOT NULL DEFAULT 0,
    cost_saved   REAL    NOT NULL DEFAULT 0,
    latency_ms   INTEGER NOT NULL DEFAULT 0,
    source       TEXT    NOT NULL DEFAULT 'mcp'
  );

  CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
`

export function defaultDbPath(): string {
  return join(homedir(), ".ctxlite", "stats.db")
}

export class StatsStore {
  private readonly db: Database.Database
  private readonly sessionStart: number

  constructor(dbPath = defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = new Database(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("synchronous = NORMAL")
    this.db.exec(SCHEMA)

    this.sessionStart = Math.floor(Date.now() / 1000)
  }

  log(entry: RequestLog): void {
    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      this.db
        .prepare(
          `INSERT INTO requests
           (id, ts, upstream, trimmed, tokens_in, tokens_used, tokens_out,
            tokens_saved, cost_saved, latency_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          Math.floor(Date.now() / 1000),
          entry.upstream,
          entry.tokensIn > entry.tokensUsed ? 1 : 0,
          entry.tokensIn,
          entry.tokensUsed,
          entry.tokensOut,
          entry.tokensSaved,
          entry.costSaved,
          entry.latencyMs,
        )
    } catch {
      // Silent — logging must not break the main flow
    }
  }

  summary(since = 0): Summary {
    const row = this.db
      .prepare(
        `SELECT
          COUNT(*)                                    as total,
          SUM(CASE WHEN trimmed THEN 1 ELSE 0 END)   as trimmed,
          COALESCE(SUM(tokens_saved), 0)              as saved,
          COALESCE(SUM(cost_saved), 0)                as cost,
          COALESCE(AVG(CASE WHEN NOT trimmed THEN latency_ms END), 0) as avg_lat
         FROM requests
         WHERE (? = 0 OR ts >= ?)`,
      )
      .get(since, since) as {
      total: number
      trimmed: number
      saved: number
      cost: number
      avg_lat: number
    }

    return {
      totalRequests: row.total,
      trimmedRequests: row.trimmed ?? 0,
      tokensSaved: row.saved,
      costSaved: row.cost,
      avgLatencyMs: Math.round(row.avg_lat),
      period: since === 0 ? "all time" : "since " + new Date(since * 1000).toLocaleDateString(),
    }
  }

  sessionSummary(): Summary {
    return this.summary(this.sessionStart)
  }

  cacheStats(): CacheStats {
    const row = this.db
      .prepare(
        `SELECT
          COUNT(*)                    as total,
          COALESCE(SUM(LENGTH(upstream) + LENGTH(id) + 100), 0) as size,
          MIN(ts)                     as oldest
         FROM requests`,
      )
      .get() as { total: number; size: number; oldest: number | null }

    return {
      totalEntries: row.total,
      sizeBytes: row.size,
      oldestEntry: row.oldest ? new Date(row.oldest * 1000) : null,
    }
  }

  pruneOlderThan(days: number): number {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400
    const result = this.db.prepare(`DELETE FROM requests WHERE ts < ?`).run(cutoff)
    return result.changes
  }

  close(): void {
    this.db.close()
  }
}

/**
 * Persist token savings from a trim_context run.
 * No-op when nothing was trimmed.
 */
export function logTrimResult(result: TrimResult, source: string, dbPath?: string): void {
  if (result.tokensSaved <= 0) {
    return
  }

  let store: StatsStore | null = null
  try {
    store = new StatsStore(dbPath)
    store.log({
      upstream: source,
      cacheHit: false,
      tokensIn: result.tokensIn,
      tokensUsed: result.tokensOut,
      tokensOut: 0,
      tokensSaved: result.tokensSaved,
      costSaved: estimateCost(result.tokensSaved, source),
      latencyMs: 0,
    })
  } catch {
    // Silent — logging must not break tool execution
  } finally {
    store?.close()
  }
}
