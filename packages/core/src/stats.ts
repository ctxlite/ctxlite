// SQLite stats store — bun:sqlite (OpenCode/Bun) or better-sqlite3 (Node)

import { mkdirSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import { openStatsSqlite, type StatsSqlite } from "./sqlite-adapter.js"
import { estimateCost, estimateConcisenessSavings } from "./tokens.js"
import type { CacheStats, RequestLog, SessionBreakdownRow, Summary, TrimResult } from "./types.js"

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

/** Added after the original schema — older databases need these columns backfilled. */
function migrateSchema(db: StatsSqlite): void {
  for (const stmt of ["ALTER TABLE requests ADD COLUMN host TEXT", "ALTER TABLE requests ADD COLUMN session_id TEXT"]) {
    try {
      db.exec(stmt)
    } catch {
      // Column already exists — runs on every open, only does work once.
    }
  }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(host, session_id)")
  } catch {
    // Best-effort — missing index just makes session queries slower, not wrong.
  }
}

export function defaultDbPath(): string {
  return join(homedir(), ".ctxlite", "stats.db")
}

/**
 * Bounded retry for the stats DB write path (spec 026, User Story 1). The
 * busy_timeout pragma already makes SQLite itself retry lock contention
 * internally for up to 5s before throwing; this adds a further bounded
 * JS-level retry so a write that still throws — e.g. two separate OS
 * processes (an OpenCode plugin process and a CLI `get_stats` invocation)
 * both hitting the same stats.db around the same moment — gets more than
 * one chance before the row is lost, instead of silently vanishing into the
 * caller's outer try/catch (kept as a last-resort guard so a stats-DB
 * problem never breaks tool execution, but it should rarely be reached now).
 */
export function runWithRetry(fn: () => void, attempts = 3): void {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      fn()
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

let logFailureCount = 0

/** Count of writes that exhausted their retry budget and were dropped. Test/diagnostic use. */
export function getLogFailureCount(): number {
  return logFailureCount
}

/** Resets the failure counter. Test use only. */
export function resetLogFailureCount(): void {
  logFailureCount = 0
}

export class StatsStore {
  private readonly db: StatsSqlite
  private readonly sessionStart: number

  constructor(dbPath = defaultDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true })

    this.db = openStatsSqlite(dbPath)
    this.db.exec(SCHEMA)
    migrateSchema(this.db)

    this.sessionStart = Math.floor(Date.now() / 1000)
  }

  log(entry: RequestLog, options?: { id?: string }): void {
    try {
      const id = options?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const source =
        entry.source ?? (entry.tokensIn > entry.tokensUsed ? "trim" : entry.tokensSaved > 0 ? "concise" : "trim")
      runWithRetry(() => {
        this.db.run(
          `INSERT OR IGNORE INTO requests
           (id, ts, upstream, trimmed, tokens_in, tokens_used, tokens_out,
            tokens_saved, cost_saved, latency_ms, source, host, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          entry.host ?? null,
          entry.sessionId ?? null,
        )
      })
    } catch {
      // Retry budget exhausted — logging must still never break tool
      // execution, but this is now the rare case, not the common one.
      logFailureCount += 1
    }
  }

  summary(since = 0, host?: string): Summary {
    const periodLabel = since === 0 ? "all time" : "since " + new Date(since * 1000).toLocaleDateString()
    const filterSql = host ? "(? = 0 OR ts >= ?) AND host = ?" : "(? = 0 OR ts >= ?)"
    const filterParams = host ? [since, since, host] : [since, since]
    return this.summaryWithFilter(filterSql, filterParams, periodLabel)
  }

  /** Stats for one host+session pair only — e.g. the OpenCode session currently active in the sidebar. */
  summaryForSession(host: string, sessionId: string): Summary {
    return this.summaryWithFilter("host = ? AND session_id = ?", [host, sessionId], "current session")
  }

  private summaryWithFilter(filterSql: string, filterParams: unknown[], periodLabel: string): Summary {
    const row = this.db.get<{
      total: number
      trimmed: number
      concise: number
      compress: number
      prune: number
      precall: number
      compact: number
      smart_read: number
      diff_read: number
      log_summary: number
      code_search: number
      saved: number
      trim_saved: number
      concise_saved: number
      compress_saved: number
      prune_saved: number
      precall_saved: number
      compact_saved: number
      smart_read_saved: number
      diff_read_saved: number
      log_summary_saved: number
      code_search_saved: number
      cost: number
      avg_lat: number
    }>(
      `SELECT
        COUNT(*)                                              as total,
        SUM(CASE WHEN source = 'trim' THEN 1 ELSE 0 END)       as trimmed,
        SUM(CASE WHEN source = 'concise' THEN 1 ELSE 0 END)    as concise,
        SUM(CASE WHEN source = 'compress' THEN 1 ELSE 0 END)   as compress,
        SUM(CASE WHEN source = 'prune' THEN 1 ELSE 0 END)      as prune,
        SUM(CASE WHEN source = 'precall' THEN 1 ELSE 0 END)    as precall,
        SUM(CASE WHEN source = 'compact' THEN 1 ELSE 0 END)    as compact,
        SUM(CASE WHEN source = 'smart_read' THEN 1 ELSE 0 END) as smart_read,
        SUM(CASE WHEN source = 'diff_read' THEN 1 ELSE 0 END) as diff_read,
        SUM(CASE WHEN source = 'log_summary' THEN 1 ELSE 0 END) as log_summary,
        SUM(CASE WHEN source = 'code_search' THEN 1 ELSE 0 END) as code_search,
        COALESCE(SUM(tokens_saved), 0)                        as saved,
        COALESCE(SUM(CASE WHEN source = 'trim' THEN tokens_saved ELSE 0 END), 0) as trim_saved,
        COALESCE(SUM(CASE WHEN source = 'concise' THEN tokens_saved ELSE 0 END), 0) as concise_saved,
        COALESCE(SUM(CASE WHEN source = 'compress' THEN tokens_saved ELSE 0 END), 0) as compress_saved,
        COALESCE(SUM(CASE WHEN source = 'prune' THEN tokens_saved ELSE 0 END), 0) as prune_saved,
        COALESCE(SUM(CASE WHEN source = 'precall' THEN tokens_saved ELSE 0 END), 0) as precall_saved,
        COALESCE(SUM(CASE WHEN source = 'compact' THEN tokens_saved ELSE 0 END), 0) as compact_saved,
        COALESCE(SUM(CASE WHEN source = 'smart_read' THEN tokens_saved ELSE 0 END), 0) as smart_read_saved,
        COALESCE(SUM(CASE WHEN source = 'diff_read' THEN tokens_saved ELSE 0 END), 0) as diff_read_saved,
        COALESCE(SUM(CASE WHEN source = 'log_summary' THEN tokens_saved ELSE 0 END), 0) as log_summary_saved,
        COALESCE(SUM(CASE WHEN source = 'code_search' THEN tokens_saved ELSE 0 END), 0) as code_search_saved,
        COALESCE(SUM(cost_saved), 0)                          as cost,
        COALESCE(AVG(CASE WHEN source = 'trim' THEN latency_ms END), 0) as avg_lat
       FROM requests
       WHERE ${filterSql} AND source != 'session'`,
      ...filterParams,
    )

    const legacy = this.db.get<{ trim_count: number; trim_saved: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN source NOT IN ('trim', 'concise', 'compress', 'prune', 'precall', 'compact', 'smart_read', 'diff_read', 'log_summary', 'code_search', 'cache', 'session') AND trimmed THEN 1 ELSE 0 END), 0) as trim_count,
        COALESCE(SUM(CASE WHEN source NOT IN ('trim', 'concise', 'compress', 'prune', 'precall', 'compact', 'smart_read', 'diff_read', 'log_summary', 'code_search', 'cache', 'session') AND trimmed THEN tokens_saved ELSE 0 END), 0) as trim_saved
       FROM requests
       WHERE ${filterSql}`,
      ...filterParams,
    )

    // tokens_used = real per-turn input tokens, tokens_out = real per-turn
    // output+reasoning tokens (see logSessionUsage). Tracked separately
    // because they must be compared against matching savings (input-side vs
    // output-side) before being combined — see below.
    const session = this.db.get<{
      session_input_used: number
      session_output_used: number
      session_turn_count: number
    }>(
      `SELECT
        COALESCE(SUM(tokens_used), 0) as session_input_used,
        COALESCE(SUM(tokens_out), 0)  as session_output_used,
        COUNT(*)                      as session_turn_count
       FROM requests
       WHERE ${filterSql} AND source = 'session'`,
      ...filterParams,
    )

    const tokensSaved = row?.saved ?? 0
    const trimTokensSaved = (row?.trim_saved ?? 0) + (legacy?.trim_saved ?? 0)
    const concisenessTokensSaved = row?.concise_saved ?? 0

    // trim_context measures savings against candidate files the agent chose
    // to evaluate, not files that were necessarily about to enter context —
    // unlike compress/prune/compact/precall/smart_read (measured before/after
    // on content actually entering a request) it has no real session
    // baseline to compare against, so it's excluded from this ratio (still
    // shown on its own in the breakdown). Heavy trim_context use would
    // otherwise dominate the numerator and push savingsPercent toward a
    // misleading 100%.
    //
    // concise saves OUTPUT tokens, everything else saves INPUT tokens — each
    // side is compared against its own matching session baseline before
    // being combined, so output savings can't be weighed against an
    // input-only denominator (or vice versa).
    const inputTokensSaved = tokensSaved - trimTokensSaved - concisenessTokensSaved
    const sessionInputTokensUsed = session?.session_input_used ?? 0
    const sessionOutputTokensUsed = session?.session_output_used ?? 0
    const sessionTokensUsed = sessionInputTokensUsed + sessionOutputTokensUsed
    const realtimeTokensSaved = inputTokensSaved + concisenessTokensSaved
    const tokensBefore =
      inputTokensSaved + sessionInputTokensUsed + concisenessTokensSaved + sessionOutputTokensUsed

    return {
      totalRequests: row?.total ?? 0,
      trimmedRequests: (row?.trimmed ?? 0) + (legacy?.trim_count ?? 0),
      concisenessRequests: row?.concise ?? 0,
      compressRequests: row?.compress ?? 0,
      pruneRequests: row?.prune ?? 0,
      precallRequests: row?.precall ?? 0,
      compactRequests: row?.compact ?? 0,
      tokensSaved,
      trimTokensSaved: (row?.trim_saved ?? 0) + (legacy?.trim_saved ?? 0),
      concisenessTokensSaved: row?.concise_saved ?? 0,
      compressTokensSaved: row?.compress_saved ?? 0,
      pruneTokensSaved: row?.prune_saved ?? 0,
      precallTokensSaved: row?.precall_saved ?? 0,
      compactTokensSaved: row?.compact_saved ?? 0,
      smartReadRequests: row?.smart_read ?? 0,
      smartReadTokensSaved: row?.smart_read_saved ?? 0,
      diffReadRequests: row?.diff_read ?? 0,
      diffReadTokensSaved: row?.diff_read_saved ?? 0,
      logSummaryRequests: row?.log_summary ?? 0,
      logSummaryTokensSaved: row?.log_summary_saved ?? 0,
      codeSearchRequests: row?.code_search ?? 0,
      codeSearchTokensSaved: row?.code_search_saved ?? 0,
      realtimeTokensSaved,
      sessionTokensUsed,
      sessionTurnCount: session?.session_turn_count ?? 0,
      tokensBefore,
      savingsPercent: tokensBefore > 0 ? (realtimeTokensSaved / tokensBefore) * 100 : 0,
      costSaved: row?.cost ?? 0,
      avgLatencyMs: Math.round(row?.avg_lat ?? 0),
      period: periodLabel,
    }
  }

  sessionSummary(): Summary {
    return this.summary(this.sessionStart)
  }

  /** One row per host+session, most recent first. Rows logged before this column existed (host/session_id NULL) are excluded. */
  sessionBreakdown(since = 0, host?: string): SessionBreakdownRow[] {
    const hostFilterSql = host ? "AND host = ?" : ""
    const params = host ? [since, since, host] : [since, since]
    return this.db.all<{
      host: string
      session_id: string
      total: number
      saved: number
      first_ts: number
      last_ts: number
    }>(
      `SELECT
        host,
        session_id,
        COUNT(*)                       as total,
        COALESCE(SUM(tokens_saved), 0) as saved,
        MIN(ts)                        as first_ts,
        MAX(ts)                        as last_ts
       FROM requests
       WHERE host IS NOT NULL AND session_id IS NOT NULL AND (? = 0 OR ts >= ?) ${hostFilterSql}
       GROUP BY host, session_id
       ORDER BY host, last_ts DESC`,
      ...params,
    ).map((row) => ({
      host: row.host,
      sessionId: row.session_id,
      totalRequests: row.total,
      tokensSaved: row.saved,
      firstTs: row.first_ts,
      lastTs: row.last_ts,
    }))
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
 * Shared writer connections, keyed by db path. Hot-path loggers (called on
 * every tool call / message event from long-lived plugin & MCP processes)
 * reuse one open connection instead of opening and closing SQLite per call —
 * opening per call caused "database is locked" under concurrent tool calls,
 * which the per-call try/catch swallowed silently, dropping rows.
 */
const sharedStores = new Map<string, StatsStore>()

function getSharedStore(dbPath?: string): StatsStore {
  const path = dbPath ?? defaultDbPath()
  let store = sharedStores.get(path)
  if (!store) {
    store = new StatsStore(path)
    sharedStores.set(path, store)
  }
  return store
}

/**
 * Public accessor for the same shared connection `getSharedStore` uses
 * internally — for callers (e.g. the OpenCode plugin's per-event read of
 * `summaryForSession`) that need to *read* stats repeatedly from a
 * long-lived process. Reusing this connection instead of opening a fresh
 * `new StatsStore(dbPath)` per call avoids competing with the shared writer
 * connection for the same file and avoids the per-call open/close failure
 * mode that made read-driven UI feedback (toasts, session titles)
 * intermittently silent (spec 026, User Story 1). Closed by
 * `closeSharedStores()` like any other shared connection.
 */
export function getSharedStatsStore(dbPath?: string): StatsStore {
  return getSharedStore(dbPath)
}

/** Closes all cached writer connections. For tests and graceful shutdown. */
export function closeSharedStores(): void {
  for (const store of sharedStores.values()) {
    store.close()
  }
  sharedStores.clear()
}

/**
 * Persist token savings from a trim_context run.
 * No-op when nothing was trimmed.
 */
export function logTrimResult(
  result: TrimResult,
  tool: "mcp" | "opencode",
  dbPath?: string,
  sessionId?: string,
): void {
  if (result.tokensSaved <= 0) {
    return
  }

  try {
    getSharedStore(dbPath).log({
      upstream: tool,
      cacheHit: false,
      tokensIn: result.tokensIn,
      tokensUsed: result.tokensOut,
      tokensOut: 0,
      tokensSaved: result.tokensSaved,
      costSaved: estimateCost(result.tokensSaved, tool),
      latencyMs: 0,
      source: "trim",
      host: tool,
      sessionId,
    })
  } catch {
    // Silent — logging must not break tool execution
  }
}

export interface ConcisenessLog {
  messageId: string
  providerId: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  host?: string | undefined
  sessionId?: string | undefined
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
  try {
    getSharedStore(dbPath).log(
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
        host: entry.host,
        sessionId: entry.sessionId,
      },
      { id: `concise-${entry.messageId}` },
    )
  } catch {
    // Silent — logging must not break the main flow
  }
}

export interface OptimizationLog {
  source: "compress" | "prune" | "precall" | "compact" | "smart_read" | "diff_read" | "log_summary" | "code_search"
  upstream: string
  tokensIn: number
  tokensOut: number
  id?: string
  host?: string | undefined
  sessionId?: string | undefined
}

/**
 * Persist measured savings from tool output compression or context pruning.
 */
export function logOptimizationSavings(entry: OptimizationLog, dbPath?: string): void {
  const tokensSaved = entry.tokensIn - entry.tokensOut
  if (tokensSaved <= 0) {
    return
  }

  try {
    getSharedStore(dbPath).log(
      {
        upstream: entry.upstream,
        cacheHit: false,
        tokensIn: entry.tokensIn,
        tokensUsed: entry.tokensOut,
        tokensOut: entry.tokensOut,
        tokensSaved,
        costSaved: estimateCost(tokensSaved, entry.upstream),
        latencyMs: 0,
        source: entry.source,
        host: entry.host,
        sessionId: entry.sessionId,
      },
      entry.id ? { id: entry.id } : undefined,
    )
  } catch {
    // Silent — logging must not break the main flow
  }
}

/**
 * Persist the actual input and output/reasoning tokens sent to/from the
 * model for one completed turn. Not a saving by itself — used as the
 * denominator for savingsPercent, so "X% saved" is relative to real session
 * traffic instead of just the subset of content ctxlite touched. Tracked
 * separately (tokensUsed = input, tokensOut = output) because input-side
 * savings (compress/prune/compact/precall/smart_read) and output-side
 * savings (concise) must each compare against their own matching baseline.
 * INSERT OR IGNORE on messageId — safe across duplicate events.
 */
export function logSessionUsage(
  entry: {
    messageId: string
    inputTokens: number
    outputTokens: number
    host?: string | undefined
    sessionId?: string | undefined
  },
  dbPath?: string,
): void {
  if (entry.inputTokens <= 0 && entry.outputTokens <= 0) {
    return
  }

  try {
    getSharedStore(dbPath).log(
      {
        upstream: "session",
        cacheHit: false,
        tokensIn: entry.inputTokens,
        tokensUsed: entry.inputTokens,
        tokensOut: entry.outputTokens,
        tokensSaved: 0,
        costSaved: 0,
        latencyMs: 0,
        source: "session",
        host: entry.host,
        sessionId: entry.sessionId,
      },
      { id: `session-${entry.messageId}` },
    )
  } catch {
    // Silent — logging must not break the main flow
  }
}
