// Extract files and query from model message text

import { estimateTokens } from "./tokens.js"
import type { CodeFile } from "./types.js"

const CODE_BLOCK_RE = /```(\w*)\n(?:\/\/\s*(?:File:\s*)?([^\n]+)\n)?([\s\S]*?)```/g

/**
 * Extract code files from text (fenced code blocks with optional path comment).
 */
export function extractFiles(text: string): CodeFile[] {
  const files: CodeFile[] = []
  let match: RegExpExecArray | null

  CODE_BLOCK_RE.lastIndex = 0

  while ((match = CODE_BLOCK_RE.exec(text)) !== null) {
    const language = match[1] ?? ""
    const path = match[2]?.trim() ?? `snippet_${files.length}.${language || "txt"}`
    const content = match[3] ?? ""

    if (content.trim().length === 0) continue

    files.push({
      path,
      content,
      language,
      tokens: estimateTokens(content),
    })
  }

  return files
}

/**
 * Extract user query — text remaining after removing code blocks.
 */
export function extractQuery(text: string): string {
  return text
    .replace(CODE_BLOCK_RE, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Detect language from file path extension.
 */
export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    go: "go",
    py: "python",
    rs: "rust",
    java: "java",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "c",
    h: "c",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    bash: "bash",
    sql: "sql",
  }
  return langMap[ext] ?? ext
}
