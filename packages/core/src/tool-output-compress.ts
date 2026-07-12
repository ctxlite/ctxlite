import { estimateTokens } from "./tokens.js"

export interface CompressToolOutputOptions {
  /** Skip compression below this token count. Default: 128 */
  minTokens?: number
  /** Max characters kept (head + tail). Default: 12000 */
  maxChars?: number
  /** Lines kept from start when truncating. Default: 80 */
  headLines?: number
  /** Lines kept from end when truncating. Default: 40 */
  tailLines?: number
}

export interface CompressToolOutputResult {
  output: string
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  compressed: boolean
}

const ANSI_RE = /\u001b\[[0-9;]*m/g

/**
 * Compress tool output before it enters LLM context.
 * Lossless for short output; head/tail preserve for long logs and diffs.
 */
export function compressToolOutput(
  text: string,
  options: CompressToolOutputOptions = {},
): CompressToolOutputResult {
  const minTokens = options.minTokens ?? 96
  const maxChars = options.maxChars ?? 12_000
  const headLines = options.headLines ?? 80
  const tailLines = options.tailLines ?? 40

  const tokensIn = estimateTokens(text)
  if (tokensIn < minTokens) {
    return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
  }

  let normalized = text.replace(ANSI_RE, "")
  normalized = normalized.replace(/\n{4,}/g, "\n\n\n")

  if (normalized.length <= maxChars) {
    const tokensOut = estimateTokens(normalized)
    const tokensSaved = Math.max(0, tokensIn - tokensOut)
    if (tokensSaved <= 0) {
      return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
    }
    return { output: normalized, tokensIn, tokensOut, tokensSaved, compressed: true }
  }

  const lines = normalized.split("\n")
  if (lines.length > headLines + tailLines + 5) {
    const head = lines.slice(0, headLines).join("\n")
    const tail = lines.slice(-tailLines).join("\n")
    const omitted = lines.length - headLines - tailLines
    normalized = [
      head,
      "",
      `[ctxlite] … ${omitted} lines omitted (${estimateTokens(lines.join("\n")) - estimateTokens(head + tail)} tokens saved) …`,
      "",
      tail,
    ].join("\n")
  } else if (normalized.length > maxChars) {
    const headChars = Math.floor(maxChars * 0.65)
    const tailChars = maxChars - headChars - 80
    normalized = [
      normalized.slice(0, headChars),
      "",
      `[ctxlite] … ${normalized.length - headChars - tailChars} chars omitted …`,
      "",
      normalized.slice(-tailChars),
    ].join("\n")
  }

  const tokensOut = estimateTokens(normalized)
  const tokensSaved = tokensIn - tokensOut
  if (tokensSaved <= 0) {
    return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
  }

  return { output: normalized, tokensIn, tokensOut, tokensSaved, compressed: true }
}
