import type { Event } from "@opencode-ai/sdk"
import { formatTokenCount, logConcisenessSavings, logSessionUsage, getSharedStatsStore } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"
import { buildOpenCodeSessionTitle } from "./session-display.js"

/** Minimal shape we need from PluginInput.client — avoids depending on the full generated SDK type. */
export type ToastClient = {
  tui: {
    showToast(options: {
      body?: {
        title?: string
        message: string
        variant: "info" | "success" | "warning" | "error"
        duration?: number
      }
    }): unknown
  }
  session: {
    get(options: { path: { id: string } }): Promise<{ data: { title?: string } | undefined }>
    update(options: { path: { id: string }; body?: { title?: string } }): unknown
  }
}

/** Sets the session title to "<original title> · ctxlite: <total> saved", replacing any prior suffix. */
async function updateSessionTitle(client: ToastClient, sessionID: string, total: number): Promise<void> {
  if (total <= 0) return
  const result = await client.session.get({ path: { id: sessionID } })
  await client.session.update({
    path: { id: sessionID },
    body: { title: buildOpenCodeSessionTitle(result.data?.title ?? "", total) },
  })
}

/**
 * Logs estimated conciseness savings when an assistant message completes,
 * and — when a client is provided — shows a TUI toast and updates the
 * session title with that turn's savings, so users see ctxlite working
 * without having to call get_stats. Uses INSERT OR IGNORE on message id —
 * safe across duplicate events.
 */
export function createStatsEventHandler(client?: ToastClient): (input: { event: Event }) => Promise<void> {
  const dbPath = getStatsDbPath()
  // Keyed by sessionID — a single plugin instance can field events from
  // multiple sessions (switching chat tabs), so one shared counter would
  // compare one session's delta against a different session's baseline.
  const lastTotalBySession = new Map<string, number>()

  return async ({ event }) => {
    if (event.type !== "message.updated") {
      return
    }

    const info = event.properties.info
    if (info.role !== "assistant" || !info.time?.completed) {
      return
    }

    logConcisenessSavings(
      {
        messageId: info.id,
        providerId: info.providerID,
        inputTokens: info.tokens.input,
        outputTokens: info.tokens.output,
        reasoningTokens: info.tokens.reasoning,
        host: "opencode",
        sessionId: info.sessionID,
      },
      dbPath,
    )

    logSessionUsage(
      {
        messageId: info.id,
        inputTokens: info.tokens.input,
        outputTokens: info.tokens.output + info.tokens.reasoning,
        host: "opencode",
        sessionId: info.sessionID,
      },
      dbPath,
    )

    if (!client) {
      return
    }

    try {
      // Reuses the same shared connection as the writer calls above — see
      // getSharedStatsStore's doc comment (spec 026, User Story 1). Never a
      // fresh `new StatsStore(dbPath)` per event: that competed with the
      // shared writer connection for the same file, and any open/read
      // failure was silently swallowed below, making the toast/session-title
      // feedback the user actually watches intermittently vanish even when
      // the underlying savings had, in fact, been recorded correctly.
      const total = getSharedStatsStore(dbPath).summaryForSession("opencode", info.sessionID).tokensSaved

      // First completed turn seen for this session — set the baseline so we
      // don't dump pre-existing session history into one toast.
      const lastTotal = lastTotalBySession.get(info.sessionID)
      if (lastTotal === undefined) {
        lastTotalBySession.set(info.sessionID, total)
        return
      }

      const delta = total - lastTotal
      lastTotalBySession.set(info.sessionID, total)
      if (delta <= 0) {
        return
      }

      await client.tui.showToast({
        body: {
          title: "ctxlite",
          message: `saved ~${formatTokenCount(delta)} tokens this turn (${formatTokenCount(total)} total)`,
          variant: "success",
          duration: 4000,
        },
      })

      await updateSessionTitle(client, info.sessionID, total)
    } catch {
      // Silent — a toast/title failure must not break the chat turn
    }
  }
}
