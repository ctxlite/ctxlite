import { describe, it, expect, afterEach } from "vitest"
import {
  StatsStore,
  logTrimResult,
  logConcisenessSavings,
  logOptimizationSavings,
  logSessionUsage,
  closeSharedStores,
} from "./stats.js"
import { openStatsSqlite } from "./sqlite-adapter.js"
import { tmpdir } from "os"
import { join } from "path"
import { rmSync } from "fs"

const tmpDb = () => join(tmpdir(), `ctxlite-test-${Date.now()}.db`)

describe("StatsStore", () => {
  let store: StatsStore
  let dbPath: string

  afterEach(() => {
    store?.close()
    closeSharedStores()
    try {
      rmSync(dbPath)
    } catch {
      // ignore cleanup errors
    }
  })

  it("logs a request and returns summary", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "api.anthropic.com",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 400,
      tokensOut: 200,
      tokensSaved: 600,
      costSaved: 0.0018,
      latencyMs: 450,
      source: "compress",
    })

    let summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.tokensSaved).toBe(600)
    expect(summary.compressRequests).toBe(1)
    expect(summary.compressTokensSaved).toBe(600)
    expect(summary.realtimeTokensSaved).toBe(600)
    // No session-usage rows logged yet — savingsPercent has no "total" to compare against.
    expect(summary.sessionTokensUsed).toBe(0)
    expect(summary.tokensBefore).toBe(600)
    expect(summary.savingsPercent).toBeCloseTo(100, 5)

    logSessionUsage({ messageId: "msg-1", inputTokens: 2000, outputTokens: 0 }, dbPath)

    summary = store.summary()
    expect(summary.totalRequests).toBe(1) // session-usage rows are not "requests"
    expect(summary.sessionTokensUsed).toBe(2000)
    expect(summary.tokensBefore).toBe(2600)
    expect(summary.savingsPercent).toBeCloseTo((600 / 2600) * 100, 5)
  })

  it("excludes trim from realtimeTokensSaved/savingsPercent (no real session baseline)", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 10000,
      tokensUsed: 2000,
      tokensOut: 0,
      tokensSaved: 8000,
      costSaved: 0.024,
      latencyMs: 0,
      source: "trim",
    })
    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 400,
      tokensOut: 400,
      tokensSaved: 600,
      costSaved: 0.0018,
      latencyMs: 0,
      source: "compress",
    })
    logSessionUsage({ messageId: "msg-1", inputTokens: 5000, outputTokens: 0 }, dbPath)

    const summary = store.summary()
    expect(summary.tokensSaved).toBe(8600) // trim + compress
    expect(summary.trimTokensSaved).toBe(8000)
    expect(summary.realtimeTokensSaved).toBe(600) // trim excluded
    expect(summary.tokensBefore).toBe(5600) // 600 + 5000, not 8600 + 5000
    expect(summary.savingsPercent).toBeCloseTo((600 / 5600) * 100, 5)
  })

  it("compares concise (output) savings against output session usage, not input", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    logConcisenessSavings(
      { messageId: "msg-1", providerId: "anthropic", inputTokens: 100, outputTokens: 1000, reasoningTokens: 0 },
      dbPath,
    )
    // 15% of 1000 = 150 saved
    logSessionUsage({ messageId: "msg-1", inputTokens: 50000, outputTokens: 850 }, dbPath)

    const summary = store.summary()
    expect(summary.concisenessTokensSaved).toBe(150)
    expect(summary.realtimeTokensSaved).toBe(150)
    // before = (concise 150 + output used 850) + (0 input savings + 50000 input used)
    expect(summary.tokensBefore).toBe(150 + 850 + 50000)
    expect(summary.savingsPercent).toBeCloseTo((150 / (150 + 850 + 50000)) * 100, 5)
  })

  it("summary returns zero for empty db", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.totalRequests).toBe(0)
    expect(summary.tokensSaved).toBe(0)
    expect(summary.savingsPercent).toBe(0)
  })

  it("log does not throw on error", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)
    store.close()

    expect(() =>
      store.log({
        upstream: "test",
        cacheHit: false,
        tokensIn: 0,
        tokensUsed: 0,
        tokensOut: 0,
        tokensSaved: 0,
        costSaved: 0,
        latencyMs: 0,
      }),
    ).not.toThrow()
  })

  it("logTrimResult persists trim savings", () => {
    dbPath = tmpDb()
    logTrimResult(
      {
        files: [],
        tokensIn: 1000,
        tokensOut: 400,
        tokensSaved: 600,
        trimRatio: 0.6,
        filesIn: 5,
        filesOut: 2,
      },
      "opencode",
      dbPath,
    )

    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.tokensSaved).toBe(600)
    expect(summary.trimmedRequests).toBe(1)
    store.close()
  })

  it("logTrimResult skips zero savings", () => {
    dbPath = tmpDb()
    logTrimResult(
      {
        files: [],
        tokensIn: 100,
        tokensOut: 100,
        tokensSaved: 0,
        trimRatio: 0,
        filesIn: 1,
        filesOut: 1,
      },
      "opencode",
      dbPath,
    )

    store = new StatsStore(dbPath)
    expect(store.summary().totalRequests).toBe(0)
    store.close()
  })

  it("logConcisenessSavings persists estimated output savings", () => {
    dbPath = tmpDb()
    logConcisenessSavings(
      {
        messageId: "msg-1",
        providerId: "anthropic",
        inputTokens: 5000,
        outputTokens: 1000,
        reasoningTokens: 200,
      },
      dbPath,
    )

    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.concisenessRequests).toBe(1)
    expect(summary.concisenessTokensSaved).toBe(180) // 15% of 1200
    expect(summary.trimTokensSaved).toBe(0)

    // duplicate message id is ignored
    logConcisenessSavings(
      {
        messageId: "msg-1",
        providerId: "anthropic",
        inputTokens: 5000,
        outputTokens: 1000,
        reasoningTokens: 200,
      },
      dbPath,
    )
    expect(store.summary().totalRequests).toBe(1)
    store.close()
  })

  it("logOptimizationSavings persists compress savings", () => {
    dbPath = tmpDb()
    logOptimizationSavings(
      {
        source: "compress",
        upstream: "opencode",
        tokensIn: 5000,
        tokensOut: 1200,
        id: "compress-call-1",
      },
      dbPath,
    )

    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.compressRequests).toBe(1)
    expect(summary.compressTokensSaved).toBe(3800)
    store.close()
  })

  it("logSessionUsage feeds tokensBefore/savingsPercent without counting as a request", () => {
    dbPath = tmpDb()
    logOptimizationSavings(
      { source: "compress", upstream: "opencode", tokensIn: 1000, tokensOut: 700, id: "compress-1" },
      dbPath,
    )
    logSessionUsage({ messageId: "msg-1", inputTokens: 5000, outputTokens: 0 }, dbPath)

    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.tokensSaved).toBe(300)
    expect(summary.sessionTokensUsed).toBe(5000)
    expect(summary.tokensBefore).toBe(5300)

    // duplicate message id is ignored
    logSessionUsage({ messageId: "msg-1", inputTokens: 5000, outputTokens: 0 }, dbPath)
    expect(store.summary().sessionTokensUsed).toBe(5000)
    store.close()
  })

  it("logSessionUsage skips zero/negative input and output tokens", () => {
    dbPath = tmpDb()
    logSessionUsage({ messageId: "msg-1", inputTokens: 0, outputTokens: 0 }, dbPath)

    store = new StatsStore(dbPath)
    expect(store.summary().sessionTokensUsed).toBe(0)
    store.close()
  })

  it("pruneOlderThan removes old entries", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)
    store.close()

    const raw = openStatsSqlite(dbPath)
    raw.run(
      "INSERT INTO requests (id, ts, upstream, tokens_in, tokens_used, tokens_out, tokens_saved, cost_saved, latency_ms) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)",
      "old-1",
      Math.floor(Date.now() / 1000) - 86400 * 10,
      "test",
    )
    raw.close()

    store = new StatsStore(dbPath)
    const removed = store.pruneOlderThan(7)
    expect(removed).toBe(1)
  })

  it("summaryForSession only counts rows matching that host+session", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 1000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-a",
    })
    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 2000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 2000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-b",
    })

    const summaryA = store.summaryForSession("opencode", "ses-a")
    expect(summaryA.tokensSaved).toBe(1000)
    expect(summaryA.totalRequests).toBe(1)
    expect(summaryA.period).toBe("current session")

    const summaryB = store.summaryForSession("opencode", "ses-b")
    expect(summaryB.tokensSaved).toBe(2000)
  })

  it("sessionBreakdown groups by host+session, excluding rows without one", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 1000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-a",
    })
    store.log({
      upstream: "claude-code",
      cacheHit: false,
      tokensIn: 500,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 500,
      costSaved: 0,
      latencyMs: 0,
      source: "precall",
      host: "claude-code",
      sessionId: "ses-c",
    })
    // No host/session — e.g. an MCP call or a pre-migration row. Excluded from the breakdown.
    store.log({
      upstream: "mcp",
      cacheHit: false,
      tokensIn: 100,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 100,
      costSaved: 0,
      latencyMs: 0,
      source: "trim",
    })

    const rows = store.sessionBreakdown()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.host === "opencode")?.sessionId).toBe("ses-a")
    expect(rows.find((r) => r.host === "opencode")?.tokensSaved).toBe(1000)
    expect(rows.find((r) => r.host === "claude-code")?.sessionId).toBe("ses-c")
  })

  it("summary(since, host) filters totals to just that host", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 1000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-a",
    })
    store.log({
      upstream: "cursor",
      cacheHit: false,
      tokensIn: 500,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 500,
      costSaved: 0,
      latencyMs: 0,
      source: "precall",
      host: "cursor",
      sessionId: "ses-b",
    })
    store.log({
      upstream: "claude-code",
      cacheHit: false,
      tokensIn: 700,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 700,
      costSaved: 0,
      latencyMs: 0,
      source: "precall",
      host: "claude-code",
      sessionId: "ses-c",
    })

    const opencodeOnly = store.summary(0, "opencode")
    expect(opencodeOnly.totalRequests).toBe(1)
    expect(opencodeOnly.tokensSaved).toBe(1000)

    const cursorOnly = store.summary(0, "cursor")
    expect(cursorOnly.totalRequests).toBe(1)
    expect(cursorOnly.tokensSaved).toBe(500)

    const allHosts = store.summary(0)
    expect(allHosts.totalRequests).toBe(3)
    expect(allHosts.tokensSaved).toBe(2200)
  })

  it("summary(since, host) returns the same zero-data shape as an empty db for a host with no rows", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 1000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-a",
    })

    const result = store.summary(0, "nonexistent-host")
    expect(result.totalRequests).toBe(0)
    expect(result.tokensSaved).toBe(0)
  })

  it("sessionBreakdown(since, host) filters session rows to just that host", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    store.log({
      upstream: "opencode",
      cacheHit: false,
      tokensIn: 1000,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 1000,
      costSaved: 0,
      latencyMs: 0,
      source: "compress",
      host: "opencode",
      sessionId: "ses-a",
    })
    store.log({
      upstream: "cursor",
      cacheHit: false,
      tokensIn: 500,
      tokensUsed: 0,
      tokensOut: 0,
      tokensSaved: 500,
      costSaved: 0,
      latencyMs: 0,
      source: "precall",
      host: "cursor",
      sessionId: "ses-b",
    })

    const cursorRows = store.sessionBreakdown(0, "cursor")
    expect(cursorRows).toHaveLength(1)
    expect(cursorRows.at(0)?.host).toBe("cursor")
    expect(cursorRows.at(0)?.sessionId).toBe("ses-b")

    const allRows = store.sessionBreakdown(0)
    expect(allRows).toHaveLength(2)
  })
})
