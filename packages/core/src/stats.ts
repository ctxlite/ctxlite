// SQLite stats store — bun:sqlite (OpenCode/Bun) or better-sqlite3 (Node)

import { mkdirSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import { openStatsSqlite, type StatsSqlite } from "./sqlite-adapter.js"
import { estimateCost, estimateConcisenessSavings } from "./tokens.js"
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
  private readonly db: StatsSqlite
  private readonly sessionStart: number

  constructor(dbPath = defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = openStatsSqlite(dbPath)
    this.db.exec(SCHEMA)

    this.sessionStart = Math.floor(Date.now() / 1000)
  }

  log(entry: RequestLog, options?: { id?: string }): void {
    try {
      const id = options?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const source =
        entry.source ?? (entry.tokensIn > entry.tokensUsed ? "trim" : entry.tokensSaved > 0 ? "concise" : "trim")
      this.db.run(
        `INSERT OR IGNORE INTO requests
         (id, ts, upstream, trimmed, tokens_in, tokens_used, tokens_out,
          tokens_saved, cost_saved, latency_ms, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        Math.floor(Date.now() / 1000),
        entry.upstream,
        source === "trim" ? 1 : 0,
        entry.tokensIn,
        entry.tokensUsed,
        entry.tokensOut,
        entry.tokensSaved,
        entry.costSaved,
        entry.latencyMs,
        source,
      )
    } catch {
      // Silent — logging must not break the main flow
    }
  }

  summary(since = 0): Summary {
    const row = this.db.get<{
      total: number
      trimmed: number
      concise: number
      saved: number
      trim_saved: number
      concise_saved: number
      cost: number
      avg_lat: number
    }>(
      `SELECT
        COUNT(*)                                              as total,
        SUM(CASE WHEN source = 'trim' THEN 1 ELSE 0 END)       as trimmed,
        SUM(CASE WHEN source = 'concise' THEN 1 ELSE 0 END)    as concise,
        COALESCE(SUM(tokens_saved), 0)                        as saved,
        COALESCE(SUM(CASE WHEN source = 'trim' THEN tokens_saved ELSE 0 END), 0) as trim_saved,
        COALESCE(SUM(CASE WHEN source = 'concise' THEN tokens_saved ELSE 0 END), 0) as concise_saved,
        COALESCE(SUM(cost_saved), 0)                          as cost,
        COALESCE(AVG(CASE WHEN source = 'trim' THEN latency_ms END), 0) as avg_lat
       FROM requests
       WHERE (? = 0 OR ts >= ?)`,
      since,
      since,
    )

    const legacy = this.db.get<{ trim_count: number; trim_saved: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN source NOT IN ('trim', 'concise', 'cache') AND trimmed THEN 1 ELSE 0 END), 0) as trim_count,
        COALESCE(SUM(CASE WHEN source NOT IN ('trim', 'concise', 'cache') AND trimmed THEN tokens_saved ELSE 0 END), 0) as trim_saved
       FROM requests
       WHERE (? = 0 OR ts >= ?)`,
      since,
      since,
    )

    return {
      totalRequests: row?.total ?? 0,
      trimmedRequests: (row?.trimmed ?? 0) + (legacy?.trim_count ?? 0),
      concisenessRequests: row?.concise ?? 0,
      tokensSaved: row?.saved ?? 0,
      trimTokensSaved: (row?.trim_saved ?? 0) + (legacy?.trim_saved ?? 0),
      concisenessTokensSaved: row?.concise_saved ?? 0,
      costSaved: row?.cost ?? 0,
      avgLatencyMs: Math.round(row?.avg_lat ?? 0),
      period: since === 0 ? "all time" : "since " + new Date(since * 1000).toLocaleDateString(),
    }
  }

  sessionSummary(): Summary {
    return this.summary(this.sessionStart)
  }

  cacheStats(): CacheStats {
    const row = this.db.get<{ total: number; size: number; oldest: number | null }>(
      `SELECT
        COUNT(*)                    as total,
        COALESCE(SUM(LENGTH(upstream) + LENGTH(id) + 100), 0) as size,
        MIN(ts)                     as oldest
       FROM requests`,
    )

    return {
      totalEntries: row?.total ?? 0,
      sizeBytes: row?.size ?? 0,
      oldestEntry: row?.oldest ? new Date(row.oldest * 1000) : null,
    }
  }

  pruneOlderThan(days: number): number {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400
    return this.db.run(`DELETE FROM requests WHERE ts < ?`, cutoff).changes
  }

  close(): void {
    this.db.close()
  }
}

/**
 * Persist token savings from a trim_context run.
 * No-op when nothing was trimmed.
 */
export function logTrimResult(result: TrimResult, tool: "mcp" | "opencode", dbPath?: string): void {
  if (result.tokensSaved <= 0) {
    return
  }

  let store: StatsStore | null = null
  try {
    store = new StatsStore(dbPath)
    store.log({
      upstream: tool,
      cacheHit: false,
      tokensIn: result.tokensIn,
      tokensUsed: result.tokensOut,
      tokensOut: 0,
      tokensSaved: result.tokensSaved,
      costSaved: estimateCost(result.tokensSaved, tool),
      latencyMs: 0,
      source: "trim",
    })
  } catch {
    // Silent — logging must not break tool execution
  } finally {
    store?.close()
  }
}

export interface ConcisenessLog {
  messageId: string
  providerId: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
}

/**
 * Persist estimated token savings from conciseness system prompt injection.
 */
export function logConcisenessSavings(entry: ConcisenessLog, dbPath?: string): void {
  const tokensSaved = estimateConcisenessSavings(entry.outputTokens, entry.reasoningTokens)
  if (tokensSaved <= 0) {
    return
  }

  const generative = entry.outputTokens + entry.reasoningTokens
  let store: StatsStore | null = null
  try {
    store = new StatsStore(dbPath)
    store.log(
      {
        upstream: entry.providerId,
        cacheHit: false,
        tokensIn: entry.inputTokens,
        tokensUsed: generative,
        tokensOut: generative,
        tokensSaved,
        costSaved: estimateCost(tokensSaved, entry.providerId),
        latencyMs: 0,
        source: "concise",
      },
      { id: `concise-${entry.messageId}` },
    )
  } catch {
    // Silent — logging must not break the main flow
  } finally {
    store?.close()
  }
}
