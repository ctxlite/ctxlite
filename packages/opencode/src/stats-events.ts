import type { Event } from "@opencode-ai/sdk"
import { StatsStore, formatTokenCount, logConcisenessSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

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
}

/**
 * Logs estimated conciseness savings when an assistant message completes,
 * and — when a client is provided — shows a TUI toast with that turn's
 * savings so users see ctxlite working without having to call get_stats.
 * Uses INSERT OR IGNORE on message id — safe across duplicate events.
 */
export function createStatsEventHandler(client?: ToastClient): (input: { event: Event }) => Promise<void> {
  const dbPath = getStatsDbPath()
  let lastTotal: number | null = null

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
      },
      dbPath,
    )

    if (!client) {
      return
    }

    let store: StatsStore | null = null
    try {
      store = new StatsStore(dbPath)
      const total = store.summary(0).tokensSaved

      // First completed turn after plugin load — set the baseline so we
      // don't dump all-time history into one toast.
      if (lastTotal === null) {
        lastTotal = total
        return
      }

      const delta = total - lastTotal
      lastTotal = total
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
    } catch {
      // Silent — a toast failure must not break the chat turn
    } finally {
      store?.close()
    }
  }
}
