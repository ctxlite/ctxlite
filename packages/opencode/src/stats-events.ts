import type { Event } from "@opencode-ai/sdk"
import { logConcisenessSavings } from "@ctxlite/core"
import { getStatsDbPath } from "./stats-path.js"

/**
 * Logs estimated conciseness savings when an assistant message completes.
 * Uses INSERT OR IGNORE on message id — safe across duplicate events.
 */
export function createStatsEventHandler(): (input: { event: Event }) => Promise<void> {
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
      getStatsDbPath(),
    )
  }
}
