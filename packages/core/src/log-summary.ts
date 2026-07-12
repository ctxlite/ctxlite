// Error-centric log compression — surface failures within a token budget.

import { estimateTokens } from "./tokens.js"

const DEFAULT_BUDGET = 2000
const MAX_INPUT_BYTES = 1_048_576

const ERROR_LINE =
  /\b(FAIL(?:ED)?|Error:|AssertionError|✘|EXCEPTION)\b|^\s+at\s+\S|^\s*Caused by:/i
const WARNING_LINE = /\b(WARN(?:ING)?|deprecated)\b/i

export interface LogSummaryOptions {
  text: string
  budget?: number
}

export interface LogSummaryResult {
  output: string
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  errorsFound: number
}

function extractErrorIds(line: string): string[] {
  const ids: string[] = []
  const failMatch = line.match(/\[FAIL\]\s+(\S+)/i)
  if (failMatch?.[1]) {
    ids.push(failMatch[1])
  }
  const testMatch = line.match(/test[-\s](\S+)/i)
  if (testMatch?.[1] && ERROR_LINE.test(line)) {
    ids.push(testMatch[1])
  }
  if (line.includes("AssertionError") || line.includes("Error:")) {
    ids.push(line.trim().slice(0, 80))
  }
  return ids
}

/**
 * Compress a noisy log to failures, stack frames, and material warnings.
 */
export function summarizeLog(options: LogSummaryOptions): LogSummaryResult {
  const { text, budget = DEFAULT_BUDGET } = options

  if (text.length > MAX_INPUT_BYTES) {
    throw new Error(`log text exceeds max input size (${MAX_INPUT_BYTES} bytes)`)
  }

  const tokensIn = estimateTokens(text)
  const lines = text.split("\n")
  const kept: string[] = []
  const errorIds = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const isError = ERROR_LINE.test(line)
    const isWarning = WARNING_LINE.test(line)
    const nextIsStack = i + 1 < lines.length && /^\s+at\s+/.test(lines[i + 1] ?? "")

    if (isError || isWarning || nextIsStack) {
      if (isError) {
        for (const id of extractErrorIds(line)) {
          errorIds.add(id)
        }
      }
      kept.push(line)
      if (nextIsStack && isError) {
        let j = i + 1
        while (j < lines.length && (/^\s+at\s+/.test(lines[j] ?? "") || (lines[j] ?? "").trim().startsWith("at "))) {
          kept.push(lines[j] ?? "")
          j++
        }
        i = j - 1
      }
    }
  }

  let body: string
  if (kept.length === 0) {
    body = `No failures detected in log (${tokensIn} tokens scanned).`
  } else {
    body = ["## log_summary", ...kept].join("\n")
    while (kept.length > 0 && estimateTokens(body) > budget) {
      kept.pop()
      body = ["## log_summary", ...kept].join("\n")
    }
  }

  const tokensOut = estimateTokens(body)
  const tokensSaved = Math.max(0, tokensIn - tokensOut)

  return {
    output: body,
    tokensIn,
    tokensOut,
    tokensSaved,
    errorsFound: errorIds.size,
  }
}
