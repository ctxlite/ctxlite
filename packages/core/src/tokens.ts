// Token counting from API responses + estimation

import type { TokenUsage } from "./types.js"

const ANTHROPIC_USAGE =
  /"usage"\s*:\s*\{[^}]*"input_tokens"\s*:\s*(\d+)[^}]*"output_tokens"\s*:\s*(\d+)/
const OPENAI_USAGE =
  /"usage"\s*:\s*\{[^}]*"prompt_tokens"\s*:\s*(\d+)[^}]*"completion_tokens"\s*:\s*(\d+)/

/**
 * Parse token usage from a JSON response body.
 * Supports Anthropic and OpenAI formats.
 * Returns zero usage when parsing fails — never throws.
 */
export function parseTokenUsage(responseBody: string): TokenUsage {
  const anthropicMatch = ANTHROPIC_USAGE.exec(responseBody)
  if (anthropicMatch?.[1] && anthropicMatch[2]) {
    const input = parseInt(anthropicMatch[1], 10)
    const output = parseInt(anthropicMatch[2], 10)
    return { inputTokens: input, outputTokens: output, totalTokens: input + output }
  }

  const openaiMatch = OPENAI_USAGE.exec(responseBody)
  if (openaiMatch?.[1] && openaiMatch[2]) {
    const input = parseInt(openaiMatch[1], 10)
    const output = parseInt(openaiMatch[2], 10)
    return { inputTokens: input, outputTokens: output, totalTokens: input + output }
  }

  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

/**
 * Estimate token count from text (~4 characters per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const PRICE_PER_MILLION: Record<string, number> = {
  "api.anthropic.com": 3.0,
  "api.openai.com": 2.5,
  "api.githubcopilot.com": 0.0,
  "api2.cursor.sh": 0.0,
  default: 3.0,
}

export function estimateCost(tokensSaved: number, upstream: string): number {
  const price = PRICE_PER_MILLION[upstream] ?? PRICE_PER_MILLION["default"] ?? 3.0
  return (tokensSaved / 1_000_000) * price
}
