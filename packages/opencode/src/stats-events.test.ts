import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Event } from "@opencode-ai/sdk"

let tmpHome: string

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>()
  return { ...actual, homedir: () => tmpHome }
})

const { createStatsEventHandler } = await import("./stats-events.js")
const { closeSharedStores } = await import("@ctxlite/core")

function assistantCompletedEvent(messageId: string, outputTokens: number, sessionID = "ses-1"): { event: Event } {
  return {
    event: {
      type: "message.updated",
      properties: {
        info: {
          id: messageId,
          sessionID,
          role: "assistant",
          providerID: "anthropic",
          time: { completed: Date.now() },
          tokens: { input: 1000, output: outputTokens, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      },
    } as unknown as Event,
  }
}

function fakeClient(title = "My session") {
  const showToast = vi.fn()
  const update = vi.fn()
  const get = vi.fn().mockResolvedValue({ data: { title } })
  return { client: { tui: { showToast }, session: { get, update } }, showToast, update, get }
}

describe("createStatsEventHandler", () => {
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ctxlite-stats-events-"))
  })

  afterEach(() => {
    closeSharedStores()
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it("does not toast on the first completed turn (baseline only)", async () => {
    const { client, showToast } = fakeClient()
    const handler = createStatsEventHandler(client)

    await handler(assistantCompletedEvent("msg-1", 1000))

    expect(showToast).not.toHaveBeenCalled()
  })

  it("toasts with the turn's delta on a subsequent completed turn", async () => {
    const { client, showToast } = fakeClient()
    const handler = createStatsEventHandler(client)

    await handler(assistantCompletedEvent("msg-1", 1000))
    await handler(assistantCompletedEvent("msg-2", 1000))

    expect(showToast).toHaveBeenCalledTimes(1)
    const body = showToast.mock.calls[0]?.[0]?.body
    expect(body.variant).toBe("success")
    expect(body.message).toContain("this turn")
  })

  it("does not toast again for a duplicate message id", async () => {
    const { client, showToast } = fakeClient()
    const handler = createStatsEventHandler(client)

    await handler(assistantCompletedEvent("msg-1", 1000))
    await handler(assistantCompletedEvent("msg-2", 1000))
    await handler(assistantCompletedEvent("msg-2", 1000))

    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it("works without a client (no toast attempted)", async () => {
    const handler = createStatsEventHandler()
    await expect(handler(assistantCompletedEvent("msg-1", 1000))).resolves.not.toThrow()
  })

  it("appends a ctxlite suffix to the session title, replacing any prior one", async () => {
    const { client, update } = fakeClient("My session · ctxlite: 1.0K saved")
    const handler = createStatsEventHandler(client)

    await handler(assistantCompletedEvent("msg-1", 1000))
    await handler(assistantCompletedEvent("msg-2", 1000))

    expect(update).toHaveBeenCalledTimes(1)
    const [{ path, body }] = update.mock.calls[0] as [{ path: { id: string }; body: { title: string } }]
    expect(path.id).toBe("ses-1")
    expect(body.title).toMatch(/^My session · ctxlite: .* saved$/)
    expect(body.title).not.toContain("1.0K saved · ctxlite")
  })

  it("toasts reliably on every qualifying turn across a burst of many turns — no intermittently silent feedback (spec 026, User Story 1)", async () => {
    const { client, showToast } = fakeClient()
    const handler = createStatsEventHandler(client)

    const turns = 20
    for (let i = 1; i <= turns; i++) {
      await handler(assistantCompletedEvent(`msg-${i}`, 1000))
    }

    // First turn is the baseline (no toast); every one of the remaining
    // turns has a positive delta, so every one of them must toast.
    expect(showToast).toHaveBeenCalledTimes(turns - 1)
  })

  it("reuses one shared read connection across many events instead of opening a fresh one per event", async () => {
    const { getSharedStatsStore, closeSharedStores: closeShared } = await import("@ctxlite/core")
    closeShared()

    const { client } = fakeClient()
    const handler = createStatsEventHandler(client)

    await handler(assistantCompletedEvent("msg-1", 1000))
    const dbPath = join(tmpHome, ".ctxlite", "stats.db")
    const afterFirst = getSharedStatsStore(dbPath)

    await handler(assistantCompletedEvent("msg-2", 1000))
    const afterSecond = getSharedStatsStore(dbPath)

    expect(afterSecond).toBe(afterFirst)
  })
})
