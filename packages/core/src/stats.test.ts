import { describe, it, expect, afterEach } from "vitest"
import { StatsStore, logTrimResult, logConcisenessSavings } from "./stats.js"
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
      source: "trim",
    })

    const summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.tokensSaved).toBe(600)
    expect(summary.trimmedRequests).toBe(1)
    expect(summary.trimTokensSaved).toBe(600)
  })

  it("summary returns zero for empty db", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)
    const summary = store.summary()
    expect(summary.totalRequests).toBe(0)
    expect(summary.tokensSaved).toBe(0)
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
})
