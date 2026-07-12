// Diff-aware file reads — return only hunks affected by a unified diff plus context.

import { readFile } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { estimateTokens } from "./tokens.js"

const DEFAULT_CONTEXT_LINES = 3
const DEFAULT_BUDGET = 1500
const MAX_INPUT_BYTES = 1_048_576

export interface DiffHunk {
  newStart: number
  newCount: number
}

export interface DiffReadOptions {
  path: string
  diff: string
  contextLines?: number
  budget?: number
  cwd?: string
}

export interface DiffReadResult {
  output: string
  tokensIn: number
  tokensOut: number
  tokensSaved: number
  hunksIncluded: number
}

/**
 * Parse unified-diff hunk headers (`@@ -a,b +c,d @@`).
 */
export function parseUnifiedDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

  for (const line of diff.split("\n")) {
    const match = header.exec(line.trim())
    if (!match) {
      continue
    }
    const newStart = Number(match[1])
    const newCount = match[2] === undefined ? 1 : Number(match[2])
    if (newStart > 0 && newCount >= 0) {
      hunks.push({ newStart, newCount })
    }
  }

  return hunks
}

function formatHunkBlock(path: string, startLine: number, lines: string[]): string {
  const endLine = startLine + lines.length - 1
  const numbered = lines.map((line, i) => `${startLine + i}|${line}`).join("\n")
  return `### hunk @ L${startLine}-${endLine}\n\`\`\`\n${numbered}\n\`\`\``
}

/**
 * Read a file and return only diff-affected regions within a token budget.
 */
export async function diffRead(options: DiffReadOptions): Promise<DiffReadResult> {
  const { path, diff, contextLines = DEFAULT_CONTEXT_LINES, budget = DEFAULT_BUDGET, cwd = process.cwd() } = options

  if (diff.length > MAX_INPUT_BYTES) {
    throw new Error(`diff exceeds max input size (${MAX_INPUT_BYTES} bytes)`)
  }

  const hunks = parseUnifiedDiffHunks(diff)
  if (hunks.length === 0) {
    throw new Error("unparseable diff: no hunks found")
  }

  const absPath = isAbsolute(path) ? path : resolve(cwd, path)
  let content: string
  try {
    content = await readFile(absPath, "utf8")
  } catch {
    throw new Error(`file not found: ${path}`)
  }

  const fileLines = content.split("\n")
  const tokensIn = estimateTokens(content)

  const blocks: string[] = [`## diff_read ${path}`]
  let tokensOut = estimateTokens(blocks.join("\n"))
  let hunksIncluded = 0

  for (const hunk of hunks) {
    const rangeStart = Math.max(1, hunk.newStart - contextLines)
    const rangeEnd = Math.min(fileLines.length, hunk.newStart + Math.max(hunk.newCount, 1) - 1 + contextLines)
    const slice = fileLines.slice(rangeStart - 1, rangeEnd)
    const block = formatHunkBlock(path, rangeStart, slice)
    const blockTokens = estimateTokens(block)

    if (tokensOut + blockTokens > budget && hunksIncluded > 0) {
      blocks.push(`_(${hunks.length - hunksIncluded} more hunks omitted — budget ${budget} tokens)_`)
      break
    }

    blocks.push(block)
    tokensOut += blockTokens
    hunksIncluded++
  }

  if (hunksIncluded === 0) {
    throw new Error("budget too small to include any hunks")
  }

  const output = blocks.join("\n\n")
  tokensOut = estimateTokens(output)
  const tokensSaved = Math.max(0, tokensIn - tokensOut)

  return { output, tokensIn, tokensOut, tokensSaved, hunksIncluded }
}
