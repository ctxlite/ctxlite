import { estimateTokens } from "./tokens.js"
import { compressToolOutput } from "./tool-output-compress.js"

/** Minimal shape for OpenCode message transform pruning. */
export interface PruneToolPart {
  type: "tool"
  callID: string
  tool: string
  state: {
    status: string
    input?: Record<string, unknown>
    output?: string
  }
}

export interface PruneMessage {
  parts: Array<{ type: string; callID?: string; tool?: string; state?: PruneToolPart["state"] }>
}

export interface ContextPruneResult {
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  prunedCount: number
}

function stableArgsKey(input: unknown): string {
  if (input === null || input === undefined) {
    return ""
  }
  if (typeof input !== "object") {
    return String(input)
  }
  const sorted = Object.keys(input as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (input as Record<string, unknown>)[key]
      return acc
    }, {})
  return JSON.stringify(sorted)
}

function toolKey(tool: string, input: unknown): string {
  return `${tool}:${stableArgsKey(input)}`
}

/**
 * Replace duplicate completed tool outputs with placeholders — keeps the latest call.
 */
export function pruneMessageContext(messages: PruneMessage[]): ContextPruneResult {
  const latestByKey = new Map<string, string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.state?.status !== "completed") {
        continue
      }
      const tool = part.tool ?? "unknown"
      latestByKey.set(toolKey(tool, part.state.input), part.callID ?? "")
    }
  }

  let tokensIn = 0
  let tokensOut = 0
  let tokensSaved = 0
  let prunedCount = 0

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool" || part.state?.status !== "completed" || !part.state.output) {
        continue
      }

      const tool = part.tool ?? "unknown"
      const key = toolKey(tool, part.state.input)
      const latestCallId = latestByKey.get(key)
      if (!latestCallId || part.callID === latestCallId) {
        continue
      }

      const original = part.state.output
      const originalTokens = estimateTokens(original)
      if (originalTokens < 48) {
        continue
      }

      const placeholder = `[ctxlite] Duplicate ${tool} output pruned (${originalTokens} tokens). See call ${latestCallId}.`
      part.state.output = placeholder
      const newTokens = estimateTokens(placeholder)

      tokensIn += originalTokens
      tokensOut += newTokens
      tokensSaved += originalTokens - newTokens
      prunedCount += 1
    }
  }

  return { tokensIn, tokensOut, tokensSaved, prunedCount }
}

export interface ContextCapResult {
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  cappedCount: number
}

/** Old tool outputs above this size get head/tail-capped — they're history, not the active task. */
const STALE_OUTPUT_MAX_TOKENS = 512

/**
 * Caps large completed tool outputs in older messages to a token budget,
 * regardless of whether they're duplicates. Unlike pruneMessageContext
 * (which only removes repeat calls), this targets the common case of a
 * single large read/grep early in a long session that otherwise stays at
 * full size in every subsequent request. The most recent message is left
 * untouched so the model keeps full fidelity on what it just produced.
 */
export function capStaleToolOutputs(messages: PruneMessage[], maxTokens = STALE_OUTPUT_MAX_TOKENS): ContextCapResult {
  let tokensIn = 0
  let tokensOut = 0
  let tokensSaved = 0
  let cappedCount = 0

  for (let i = 0; i < messages.length - 1; i++) {
    for (const part of messages[i]?.parts ?? []) {
      if (part.type !== "tool" || part.state?.status !== "completed" || !part.state.output) {
        continue
      }

      const output = part.state.output
      if (estimateTokens(output) <= maxTokens) {
        continue
      }

      const result = compressToolOutput(output, { maxChars: maxTokens * 4 })
      if (!result.compressed) {
        continue
      }

      part.state.output = result.output
      tokensIn += result.tokensIn
      tokensOut += result.tokensOut
      tokensSaved += result.tokensSaved
      cappedCount += 1
    }
  }

  return { tokensIn, tokensOut, tokensSaved, cappedCount }
}
