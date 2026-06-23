import { estimateTokens } from "./tokens.js"
import { compressToolOutput, type CompressToolOutputResult } from "./tool-output-compress.js"

export interface CompressGrepOutputOptions {
  /** Skip compression below this token count. Default: 128 */
  minTokens?: number
  /** Max matched lines kept per file before collapsing the rest. Default: 5 */
  maxLinesPerFile?: number
  /** Max files kept before collapsing the rest. Default: 30 */
  maxFiles?: number
}

/** ripgrep/grep -n style: "path/to/file.ts:42:  the matched line" */
const GREP_LINE_PATTERN = /^([^\n:]+):(\d+):(.*)$/

/**
 * Groups grep/ripgrep content-mode output by file and caps matches shown
 * per file and files shown overall, instead of compressToolOutput's blind
 * head/tail truncation — which would show every match in the first few
 * files and none from the rest, regardless of which files matter most.
 * Only applies to content-mode output (file:line:text); other output_modes
 * (files_with_matches, count) are already small and untouched by callers.
 */
export function compressGrepOutput(
  text: string,
  options: CompressGrepOutputOptions = {},
): CompressToolOutputResult {
  const minTokens = options.minTokens ?? 128
  const maxLinesPerFile = options.maxLinesPerFile ?? 5
  const maxFiles = options.maxFiles ?? 30

  const tokensIn = estimateTokens(text)
  if (tokensIn < minTokens) {
    return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
  }

  const groups: Array<{ file: string; lines: string[] }> = []
  const groupByFile = new Map<string, { file: string; lines: string[] }>()

  for (const line of text.split("\n")) {
    const match = GREP_LINE_PATTERN.exec(line)
    if (!match) {
      continue
    }
    const file = match[1] as string
    let group = groupByFile.get(file)
    if (!group) {
      group = { file, lines: [] }
      groupByFile.set(file, group)
      groups.push(group)
    }
    group.lines.push(line)
  }

  // Not ripgrep/grep -n style content — nothing to group (e.g. files_with_matches/count output, already small).
  if (groups.length === 0) {
    return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
  }

  const shownGroups = groups.slice(0, maxFiles)
  const hiddenGroupCount = groups.length - shownGroups.length

  const outputLines: string[] = []
  for (const group of shownGroups) {
    const shown = group.lines.slice(0, maxLinesPerFile)
    outputLines.push(...shown)
    const hidden = group.lines.length - shown.length
    if (hidden > 0) {
      outputLines.push(`  [ctxlite] … ${hidden} more match(es) in ${group.file} …`)
    }
  }
  if (hiddenGroupCount > 0) {
    outputLines.push(`[ctxlite] … ${hiddenGroupCount} more file(s) with matches …`)
  }

  const output = outputLines.join("\n")
  const tokensOut = estimateTokens(output)
  const tokensSaved = tokensIn - tokensOut
  if (tokensSaved <= 0) {
    return { output: text, tokensIn, tokensOut: tokensIn, tokensSaved: 0, compressed: false }
  }

  return { output, tokensIn, tokensOut, tokensSaved, compressed: true }
}

/**
 * Routes to the grep-aware compressor for grep-like tool names, falling
 * back to generic compression for everything else (or when the output
 * isn't in grep -n style, e.g. files_with_matches/count mode). Shared by
 * every PostToolUse-equivalent hook (OpenCode, Claude Code) so each one
 * doesn't reimplement the same tool-name check.
 */
export function compressOutputForTool(toolName: string, text: string): CompressToolOutputResult {
  if (toolName.toLowerCase() !== "grep") {
    return compressToolOutput(text)
  }
  const result = compressGrepOutput(text)
  return result.compressed ? result : compressToolOutput(text)
}
