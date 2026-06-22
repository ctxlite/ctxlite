import { describe, it, expect, afterEach } from "vitest"
import { StatsStore } from "./stats.js"
import { tmpdir } from "os"
import { join } from "path"
import { rmSync } from "fs"

const tmpDb = () => join(tmpdir(), `ctxlite-test-${Date.now()}.db`)

describe("StatsStore", () => {
  let store: StatsStore
  let dbPath: string

  afterEach(() => {
    store.close()
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
    })

    const summary = store.summary()
    expect(summary.totalRequests).toBe(1)
    expect(summary.tokensSaved).toBe(600)
    expect(summary.trimmedRequests).toBe(1)
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

  it("pruneOlderThan removes old entries", () => {
    dbPath = tmpDb()
    store = new StatsStore(dbPath)

    const db = (store as unknown as {
      db: { prepare: (s: string) => { run: (...a: unknown[]) => void } }
    }).db
    db.prepare(
      "INSERT INTO requests (id, ts, upstream, tokens_in, tokens_used, tokens_out, tokens_saved, cost_saved, latency_ms) VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)",
    ).run("old-1", Math.floor(Date.now() / 1000) - 86400 * 10, "test")

    const removed = store.pruneOlderThan(7)
    expect(removed).toBe(1)
  })
})
