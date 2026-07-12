// Workspace lexical code search with BM25 ranking and bounded snippets.

import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { BM25 } from "./bm25.js"
import { isIgnored, loadIgnorePatterns } from "./ctxliteignore.js"
import { estimateTokens } from "./tokens.js"

const DEFAULT_MAX_RESULTS = 5
const DEFAULT_SNIPPET_BUDGET = 400
const DEFAULT_MAX_FILES = 500
const MAX_FILE_BYTES = 1_048_576

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "go",
  "py",
  "rs",
  "java",
  "md",
])

export interface CodeSearchHit {
  path: string
  score: number
  snippet: string
  line: number
}

export interface CodeSearchOptions {
  query: string
  maxResults?: number
  snippetBudget?: number
  root?: string
  maxFilesScanned?: number
}

export interface CodeSearchResult {
  hits: CodeSearchHit[]
  tokensSaved: number
}

interface ScannedFile {
  path: string
  content: string
  tokens: number
}

async function walkCodeFiles(root: string, ignorePatterns: ReturnType<typeof loadIgnorePatterns>, maxFiles: number): Promise<ScannedFile[]> {
  const files: ScannedFile[] = []
  const queue = [root]

  while (queue.length > 0 && files.length < maxFiles) {
    const dir = queue.shift()
    if (!dir) {
      break
    }

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break
      }
      const full = join(dir, entry.name)
      const rel = relative(root, full)

      if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) {
        continue
      }

      if (isIgnored(rel, ignorePatterns)) {
        continue
      }

      if (entry.isDirectory()) {
        queue.push(full)
        continue
      }

      const ext = entry.name.split(".").pop()?.toLowerCase() ?? ""
      if (!CODE_EXTENSIONS.has(ext)) {
        continue
      }

      try {
        const info = await stat(full)
        if (info.size > MAX_FILE_BYTES) {
          continue
        }
        const content = await readFile(full, "utf8")
        files.push({
          path: rel,
          content,
          tokens: estimateTokens(content),
        })
      } catch {
        continue
      }
    }
  }

  return files
}

function extractSnippet(content: string, query: string, budgetTokens: number): { snippet: string; line: number } {
  const lines = content.split("\n")
  const lowerQuery = query.toLowerCase()
  const terms = lowerQuery.split(/\s+/).filter((t) => t.length >= 2)

  let bestLine = 1
  let bestScore = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const lower = line.toLowerCase()
    let score = 0
    for (const term of terms) {
      if (lower.includes(term)) {
        score++
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestLine = i + 1
    }
  }

  const halfWindow = 8
  const start = Math.max(0, bestLine - 1 - halfWindow)
  let end = Math.min(lines.length, bestLine - 1 + halfWindow + 1)
  let snippet = lines.slice(start, end).join("\n")

  while (start < end && estimateTokens(snippet) > budgetTokens) {
    end--
    snippet = lines.slice(start, end).join("\n")
  }

  return { snippet, line: bestLine }
}

/**
 * Search a workspace for files matching a query; return ranked snippets.
 */
export async function searchCodebase(options: CodeSearchOptions): Promise<CodeSearchResult> {
  const {
    query,
    maxResults = DEFAULT_MAX_RESULTS,
    snippetBudget = DEFAULT_SNIPPET_BUDGET,
    root = process.cwd(),
    maxFilesScanned = DEFAULT_MAX_FILES,
  } = options

  if (!query.trim()) {
    throw new Error("query must not be empty")
  }

  const absRoot = resolve(root)
  const ignorePatterns = loadIgnorePatterns(absRoot)
  const files = await walkCodeFiles(absRoot, ignorePatterns, maxFilesScanned)

  if (files.length === 0) {
    return { hits: [], tokensSaved: 0 }
  }

  const docs = files.map((f) => `${f.path}\n${f.content}`)
  const bm25 = new BM25(docs)
  const ranked = bm25.scoreAll(query).filter((r) => r.score > 0).slice(0, maxResults)

  const hits: CodeSearchHit[] = []
  let fullReadTokens = 0
  let snippetTokens = 0

  for (const row of ranked) {
    const file = files[row.index]
    if (!file) {
      continue
    }
    fullReadTokens += file.tokens
    const { snippet, line } = extractSnippet(file.content, query, snippetBudget)
    const hitTokens = estimateTokens(snippet)
    snippetTokens += hitTokens
    hits.push({
      path: file.path,
      score: Math.round(row.score * 10) / 10,
      snippet,
      line,
    })
  }

  const tokensSaved = Math.max(0, fullReadTokens - snippetTokens)
  return { hits, tokensSaved }
}

/**
 * Format search hits as markdown for MCP output.
 */
export function formatCodeSearchOutput(query: string, hits: CodeSearchHit[]): string {
  const lines = [`## code_search "${query}"`]
  hits.forEach((hit, i) => {
    lines.push(`${i + 1}. ${hit.path} (score ${hit.score}) L${hit.line}`)
    lines.push("```")
    lines.push(hit.snippet)
    lines.push("```")
  })
  if (hits.length === 0) {
    lines.push("No matches found.")
  }
  return lines.join("\n")
}
